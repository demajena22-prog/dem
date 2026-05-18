import "../config.js";
import crypto from "crypto";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import customizeQR from "./qrtemplate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TX_FILE = path.join(__dirname, "../src/binancepay_tx.json");

const BASE_URL = "https://bpay.binanceapi.com";

// ==================== Persistent Transaction Map ====================
// Maps ref_id -> { prepayId, merchantTradeNo }
function loadTxMap() {
  try {
    if (fs.existsSync(TX_FILE)) {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(TX_FILE, "utf-8"))));
    }
  } catch {}
  return new Map();
}

function saveTxMap(map) {
  try {
    const dir = path.dirname(TX_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TX_FILE, JSON.stringify(Object.fromEntries(map), null, 2));
  } catch {}
}

const txMap = loadTxMap();

// Cleanup expired transactions (lebih dari 20 menit)
setInterval(() => {
  const now = Date.now();
  const EXPIRY = 20 * 60 * 1000;
  let cleaned = 0;
  for (const [key, val] of txMap.entries()) {
    if (val.createdAt && now - val.createdAt > EXPIRY) {
      txMap.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    saveTxMap(txMap);
    console.log(`[BinancePay] Cleanup ${cleaned} expired transactions`);
  }
}, 5 * 60 * 1000);

// ==================== Binance Pay Signature ====================
function generateNonce(length = 32) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let nonce = "";
  for (let i = 0; i < length; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function createSignature(timestamp, nonce, body) {
  const payload = `${timestamp}\n${nonce}\n${body}\n`;
  return crypto
    .createHmac("sha512", global.binancepay_secret_key)
    .update(payload)
    .digest("hex")
    .toUpperCase();
}

function getHeaders(body) {
  const timestamp = Date.now();
  const nonce = generateNonce(32);
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  const signature = createSignature(timestamp, nonce, bodyStr);

  return {
    "Content-Type": "application/json",
    "BinancePay-Timestamp": timestamp,
    "BinancePay-Nonce": nonce,
    "BinancePay-Certificate-SN": global.binancepay_api_key,
    "BinancePay-Signature": signature,
  };
}

// ==================== Create QR (Create Order) ====================
async function createQr(nominal, ref_id) {
  try {
    const merchantTradeNo = ref_id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);

    // Konversi nominal Rupiah ke USDT menggunakan rate dari config
    // Jika binancepay_currency adalah IDR-based, kita gunakan fiatAmount
    const currency = global.binancepay_currency || "USDT";
    const useFiat = global.binancepay_use_fiat || false;

    const requestBody = {
      env: {
        terminalType: "APP",
      },
      merchantTradeNo: merchantTradeNo,
      description: global.store_name || "Digital Product Payment",
      goodsDetails: [
        {
          goodsType: "02", // Virtual Goods
          goodsCategory: "6000", // Game & Recharge
          referenceGoodsId: ref_id,
          goodsName: `Payment ${ref_id}`,
        },
      ],
    };

    // Jika menggunakan fiat (IDR), gunakan fiatAmount + fiatCurrency
    // Binance akan otomatis konversi ke USDT/USDC
    if (useFiat && global.binancepay_fiat_currency) {
      requestBody.fiatAmount = parseFloat(nominal);
      requestBody.fiatCurrency = global.binancepay_fiat_currency; // e.g. "IDR"
    } else {
      // Jika langsung pakai crypto amount
      const amount = global.binancepay_idr_to_crypto
        ? (parseInt(nominal) / global.binancepay_idr_to_crypto).toFixed(8)
        : parseFloat(nominal);
      requestBody.orderAmount = parseFloat(amount);
      requestBody.currency = currency;
    }

    // Set expire time (15 menit)
    requestBody.orderExpireTime = Date.now() + 15 * 60 * 1000;

    const bodyStr = JSON.stringify(requestBody);
    const headers = getHeaders(bodyStr);

    const response = await axios.post(
      `${BASE_URL}/binancepay/openapi/v3/order`,
      bodyStr,
      { headers, timeout: 30000 }
    );

    const result = response.data;

    if (result && result.status === "SUCCESS" && result.data) {
      const { prepayId, qrContent, qrcodeLink, checkoutUrl } = result.data;

      // Simpan mapping ref_id -> prepayId untuk cek status nanti
      txMap.set(ref_id, {
        prepayId,
        merchantTradeNo,
        checkoutUrl: checkoutUrl || "",
        createdAt: Date.now(),
      });
      saveTxMap(txMap);

      // Generate QR image dari qrContent (checkout URL)
      const qrString = qrContent || checkoutUrl;
      if (!qrString) {
        console.error("[BinancePay] qrContent/checkoutUrl kosong:", result.data);
        return null;
      }

      const qrisImage = await customizeQR(qrString);
      return qrisImage;
    }

    console.error("[BinancePay] Create order error:", result?.errorMessage || "Response tidak valid");
    return null;
  } catch (e) {
    const errMsg = e.response?.data?.errorMessage || e.response?.data || e.message;
    console.error("[BinancePay] createQr error:", errMsg);
    return null;
  }
}

// ==================== Cek Transaksi (Query Order) ====================
async function cekTransaksi(nominal, ref_id) {
  try {
    const tx = txMap.get(ref_id);
    console.log(`[BinancePay] cekTransaksi ref_id=${ref_id}, txMap has=${txMap.has(ref_id)}, tx=`, tx);

    if (!tx) {
      console.error(`[BinancePay] txMap tidak punya ref_id: ${ref_id}. Keys:`, [...txMap.keys()]);
      return false;
    }

    // Query order by prepayId
    const requestBody = { prepayId: tx.prepayId };
    const bodyStr = JSON.stringify(requestBody);
    const headers = getHeaders(bodyStr);

    const response = await axios.post(
      `${BASE_URL}/binancepay/openapi/v2/order/query`,
      bodyStr,
      { headers, timeout: 15000 }
    );

    const result = response.data;
    console.log(`[BinancePay] query order response:`, JSON.stringify(result));

    if (result && result.status === "SUCCESS" && result.data) {
      const orderStatus = result.data.status?.toUpperCase();

      if (orderStatus === "PAID") {
        // Pembayaran berhasil
        txMap.delete(ref_id);
        saveTxMap(txMap);
        return true;
      }

      if (orderStatus === "EXPIRED" || orderStatus === "CANCELED" || orderStatus === "ERROR") {
        // Order sudah expired/dibatalkan
        txMap.delete(ref_id);
        saveTxMap(txMap);
        return false;
      }

      // Status lain (INITIAL, PENDING) = belum bayar
      return false;
    }

    return false;
  } catch (e) {
    console.error("[BinancePay] cekTransaksi error:", e.response?.data || e.message);
    return false;
  }
}

export { createQr, cekTransaksi };
