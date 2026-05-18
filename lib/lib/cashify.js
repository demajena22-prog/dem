import "../config.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import customizeQR from "./qrtemplate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TX_FILE = path.join(__dirname, "../src/cashify_tx.json");

const BASE_URL = "https://cashify.my.id/api/generate";

function loadTxMap() {
  try {
    if (fs.existsSync(TX_FILE)) {
      const data = JSON.parse(fs.readFileSync(TX_FILE, "utf-8"));
      return new Map(Object.entries(data));
    }
  } catch (e) {
    console.error("[Cashify] Gagal load txMap:", e.message);
  }
  return new Map();
}

function saveTxMap(map) {
  try {
    fs.writeFileSync(TX_FILE, JSON.stringify(Object.fromEntries(map), null, 2));
  } catch (e) {
    console.error("[Cashify] Gagal save txMap:", e.message);
  }
}

const txMap = loadTxMap();

// Cleanup expired (30 menit)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, val] of txMap.entries()) {
    if (val.createdAt && now - val.createdAt > 30 * 60 * 1000) {
      txMap.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) saveTxMap(txMap);
}, 5 * 60 * 1000);

/**
 * Generate QRIS via Cashify API v1
 */
async function createQr(nominal, ref_id) {
  try {
    const payload = {
      id: global.cashify_qris_id,
      amount: parseInt(nominal),
      useUniqueCode: true,
      packageIds: global.cashify_package_ids || ["id.dana"],
      expiredInMinutes: 15,
    };

    const response = await axios.post(`${BASE_URL}/qris`, payload, {
      headers: { "x-license-key": global.cashify_license_key },
      timeout: 30000,
    });

    const result = response.data;
    if (result && result.status === 200 && result.data) {
      const { qr_string, transactionId, totalAmount, originalAmount } = result.data;
      if (!qr_string) {
        console.error("[Cashify] qr_string kosong");
        return null;
      }

      txMap.set(ref_id, {
        transactionId,
        totalAmount,
        originalAmount: originalAmount || nominal,
        createdAt: Date.now(),
      });
      saveTxMap(txMap);

      const qrisImage = await customizeQR(qr_string);
      return qrisImage;
    }
    console.error("[Cashify] createQr error:", result?.message || result);
    return null;
  } catch (e) {
    console.error("[Cashify] createQr error:", e.response?.data || e.message);
    return null;
  }
}

/**
 * Cek status pembayaran
 * Berdasarkan docs: POST /check-status dengan { transactionId }
 * Response: { status: 200, data: { transactionId, amount, status: "pending"|"paid", expiredAt } }
 */
async function cekTransaksi(nominal, ref_id) {
  try {
    const tx = txMap.get(ref_id);
    if (!tx) {
      console.error(`[Cashify] ref_id tidak ditemukan di txMap: ${ref_id}`);
      return false;
    }

    // METHOD 1: check-status (recommended oleh docs)
    try {
      const response = await axios.post(`${BASE_URL}/check-status`, {
        transactionId: tx.transactionId,
      }, {
        headers: { "x-license-key": global.cashify_license_key },
        timeout: 15000,
      });

      const result = response.data;
      if (result && result.status === 200 && result.data) {
        const status = String(result.data.status || "").toLowerCase();
        if (status === "paid" || status === "success") {
          txMap.delete(ref_id);
          saveTxMap(txMap);
          return true;
        }
        // Jika masih pending, lanjut ke method 2
      }
    } catch (e) {
      console.error("[Cashify] check-status error:", e.response?.data || e.message);
    }

    // METHOD 2: list dengan filter status=success, cari berdasarkan transactionId
    try {
      const listResponse = await axios.get(
        `${BASE_URL}/list?status=success&sort=newest&limit=20`,
        {
          headers: { "x-license-key": global.cashify_license_key },
          timeout: 15000,
        }
      );

      const listResult = listResponse.data;
      if (listResult && listResult.status === 200 && listResult.data) {
        const items = listResult.data.items || [];

        // Match by transactionId
        const found = items.find(item => item.transactionId === tx.transactionId);
        if (found) {
          txMap.delete(ref_id);
          saveTxMap(txMap);
          return true;
        }

        // Fallback: match by totalAmount
        const expectedAmount = Number(tx.totalAmount);
        const foundByAmount = items.find(item => Number(item.amount) === expectedAmount);
        if (foundByAmount) {
          txMap.delete(ref_id);
          saveTxMap(txMap);
          return true;
        }
      }
    } catch (e) {
      console.error("[Cashify] list error:", e.response?.data || e.message);
    }

    return false;
  } catch (e) {
    console.error("[Cashify] cekTransaksi error:", e.message);
    return false;
  }
}

export { createQr, cekTransaksi };
