import "../config.js";
import {
  createDigiflazzTransaction,
  updateDigiflazzTransaction,
  incrementDigiflazzProductSold,
  refundBalance,
} from "./database.js";
import { createTransaction } from "./digiflazz.js";
import { stripEmoji } from "./myfunc.js";
import buttonStyles from "../styles/index.js";

export function getDigiflazzQuantity(rawQuantity = 1) {
  const quantity = parseInt(rawQuantity, 10);
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(quantity, 100);
}

export function getDigiflazzTotal(product, quantity = 1) {
  return Number(product?.sellPrice || 0) * getDigiflazzQuantity(quantity);
}

export function validateDigiflazzCheckoutState(state) {
  const product = state?.product;
  const sellPrice = Number(product?.sellPrice);

  if (!product || typeof product !== "object") return "Data produk tidak ditemukan. Silakan pilih produk ulang.";
  if (!product.buyer_sku_code) return "Kode SKU produk tidak valid. Silakan sync produk Digiflazz ulang.";
  if (!product.product_name) return "Nama produk tidak valid. Silakan pilih produk ulang.";
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) return "Harga produk tidak valid. Silakan sync produk Digiflazz ulang.";
  if (!state.customer_no) return "Nomor tujuan belum terisi. Silakan mulai ulang transaksi.";

  return null;
}

export function buildDigiflazzCheckoutMessage(state, user = null) {
  const product = state.product;
  const quantity = getDigiflazzQuantity(state.quantity);
  const total = getDigiflazzTotal(product, quantity);

  let message = `*🛒 KONFIRMASI PEMBELIAN*\n\n`;
  message += `*— Produk:* ${stripEmoji(product.product_name)}\n`;
  message += `*— Nomor Tujuan:* ${state.customer_no}\n`;
  message += `*— Kategori:* ${product.category || "-"}\n`;
  message += `*— Brand:* ${product.brand || "-"}\n`;
  message += `*— Harga Satuan:* ${rupiah(product.sellPrice)}\n`;
  message += `*— Jumlah Beli:* ${quantity}\n`;
  message += `*— Total Pembayaran:* ${rupiah(total)}\n`;

  if (user) {
    message += `\n*Saldo Anda:* ${rupiah(user.balance || 0)}\n`;
    message += user.balance >= total
      ? `*Sisa Saldo Jika Balance:* ${rupiah((user.balance || 0) - total)}\n`
      : `*Kurang Saldo Jika Balance:* ${rupiah(total - (user.balance || 0))}\n`;
  }

  if (product.desc) message += `\n_${product.desc}_\n`;
  message += `\nPilih jumlah beli dan metode pembayaran:`;

  return message;
}

export function buildDigiflazzCheckoutKeyboard(state) {
  const quantity = getDigiflazzQuantity(state.quantity);
  const product = state.product;
  const sku = encodeURIComponent(product.buyer_sku_code);
  const backTarget = product.category && product.brand
    ? `dgf_brand ${product.category}|${product.brand}`
    : "digiflazz";

  // Use button styles for quantity keyboard
  const keyboard = [];

  // Quantity controls
  const qtyButton = (label, delta) => ({
    text: label,
    callback_data: `dgf_checkout ${sku} ${Math.max(1, quantity + delta)}`,
    style: "primary",
  });

  keyboard.push([
    qtyButton("-10", -10),
    qtyButton("-5", -5),
    qtyButton("-1", -1),
  ]);

  keyboard.push([
    { text: `📦 ${quantity}`, callback_data: "noop" },
    { text: "Ketik Jumlah", callback_data: "dgf_inputqty", style: "primary" },
  ]);

  keyboard.push([
    qtyButton("+1", 1),
    qtyButton("+5", 5),
    qtyButton("+10", 10),
  ]);

  // Payment buttons using button styles
  const paymentKeyboard = buttonStyles.telegram.createPaymentKeyboard(
    `dgf_payqris ${quantity}`,
    `dgf_paybalance ${quantity}`,
    null
  );
  keyboard.push(...paymentKeyboard);

  // Back button
  keyboard.push([buttonStyles.telegram.backButton("Kembali", backTarget)]);

  const replyKeyboard = [
    [{ text: "-1", style: "primary" }, { text: "Ketik Jumlah", style: "primary" }, { text: "+1", style: "primary" }],
    [{ text: "-10", style: "primary" }, { text: "-5", style: "primary" }, { text: "+5", style: "primary" }, { text: "+10", style: "primary" }],
    [{ text: "Qris 1⃣", style: "success" }, { text: "Balance 2⃣", style: "success" }],
    [{ text: "↩️ Kembali", style: "danger" }],
  ];

  return { keyboard, replyKeyboard };
}

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function makeRefId(from, index = 1) {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `DGF${Date.now()}${from}${index}${suffix}`;
}

export async function processDigiflazzOrder({
  bot_id,
  from,
  product,
  customer_no,
  quantity = 1,
  paymentMethod = "balance",
  statusChatId = null,
  statusMessageId = null,
}) {
  const totalQty = getDigiflazzQuantity(quantity);
  const results = [];
  let successCount = 0;
  let pendingCount = 0;
  let failedCount = 0;

  for (let i = 1; i <= totalQty; i++) {
    const ref_id = makeRefId(from, i);
    const trxData = {
      botId: bot_id,
      userId: from,
      ref_id,
      buyer_sku_code: product.buyer_sku_code,
      customer_no,
      product_name: product.product_name,
      price: product.price,
      sellPrice: Number(product.sellPrice),
      status: "pending",
      paymentMethod,
      statusChatId,
      statusMessageId,
    };

    const createTrxResult = await createDigiflazzTransaction(trxData);
    if (!createTrxResult.success) {
      failedCount++;
      results.push({ ref_id, status: "failed", message: `Gagal menyimpan transaksi: ${createTrxResult.error}` });
      continue;
    }

    let digiflazzResult;
    try {
      digiflazzResult = await createTransaction({
        buyer_sku_code: product.buyer_sku_code,
        customer_no,
        ref_id,
        testing: global.digiflazz?.mode === "development",
      });
    } catch (error) {
      digiflazzResult = { success: false, error: error.message || "Gagal membuat transaksi Digiflazz" };
    }

    if (!digiflazzResult.success) {
      failedCount++;
      await updateDigiflazzTransaction(ref_id, {
        status: "failed",
        message: digiflazzResult.error,
        rc: digiflazzResult.data?.rc || "99",
      });
      results.push({ ref_id, status: "failed", message: digiflazzResult.error });
      continue;
    }

    const result = digiflazzResult.data;
    const status = normalizeStatus(result.status);

    await updateDigiflazzTransaction(ref_id, {
      trx_id: result.trx_id,
      status: result.status,
      rc: result.rc,
      message: result.message,
      sn: result.sn,
      buyer_last_saldo: result.buyer_last_saldo,
    });

    if (status === "success" || status === "sukses") {
      successCount++;
      await incrementDigiflazzProductSold(bot_id, product.buyer_sku_code);
    } else if (status === "pending") {
      pendingCount++;
    } else {
      failedCount++;
      await updateDigiflazzTransaction(ref_id, { status: "failed" });
    }

    results.push({
      ref_id,
      status: status || "unknown",
      message: result.message,
      sn: result.sn,
    });
  }

  return { successCount, pendingCount, failedCount, results };
}

export async function refundFailedDigiflazzUnits(from, product, failedCount) {
  const amount = Number(product?.sellPrice || 0) * Number(failedCount || 0);
  if (amount <= 0) return { success: true, data: null };
  return refundBalance(from, amount);
}

export function buildDigiflazzResultMessage({ product, customer_no, quantity, totalPaid, paymentMethod, processResult, refundedAmount = 0 }) {
  const totalQty = getDigiflazzQuantity(quantity);
  const refs = processResult.results.map((item, index) => {
    const sn = item.sn ? ` | SN: ${item.sn}` : "";
    return `${index + 1}. ${item.ref_id} - ${item.status}${sn}`;
  }).join("\n");

  let title = "✅ TRANSAKSI BERHASIL";
  if (processResult.failedCount > 0 && processResult.successCount + processResult.pendingCount > 0) title = "⚠️ TRANSAKSI SEBAGIAN BERHASIL";
  if (processResult.failedCount === totalQty) title = "❌ TRANSAKSI GAGAL";
  if (processResult.pendingCount > 0 && processResult.failedCount === 0 && processResult.successCount === 0) title = "⏳ TRANSAKSI DIPROSES";

  let message = `*${title}*\n\n`;
  message += `*Produk:* ${stripEmoji(product.product_name)}\n`;
  message += `*Nomor Tujuan:* ${customer_no}\n`;
  message += `*Jumlah:* ${totalQty}\n`;
  message += `*Total Dibayar:* ${rupiah(totalPaid)}\n`;
  message += `*Metode:* ${paymentMethod.toUpperCase()}\n\n`;
  message += `*Ringkasan:*\n`;
  message += `Sukses: ${processResult.successCount}\n`;
  message += `Pending: ${processResult.pendingCount}\n`;
  message += `Gagal: ${processResult.failedCount}\n`;
  if (refundedAmount > 0) message += `Refund ke saldo: ${rupiah(refundedAmount)}\n`;
  if (processResult.pendingCount > 0) message += `\n⚡ *Transaksi pending akan diupdate otomatis* (maks 2 menit)\n`;
  message += `\n*Ref ID:*\n\`${refs || "-"}\``;

  return message;
}