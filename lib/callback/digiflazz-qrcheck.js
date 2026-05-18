import "../config.js";
import { refundBalance } from "../lib/database.js";
import {
  buildDigiflazzResultMessage,
  processDigiflazzOrder,
  validateDigiflazzCheckoutState,
} from "../lib/digiflazz-order.js";
import { processingLocks } from "../lib/locks.js";

async function safeEditOrSend(bot, chat_id, message_id, text, options = {}) {
  try {
    await bot.editMessageText(text, { chat_id, message_id, ...options });
    return message_id;
  } catch (e) {
    const msg = e.message || "";
    if (!msg.includes("message is not modified")) {
      const sent = await bot.sendMessage(chat_id, text, options);
      return sent?.message_id || message_id;
    }
    return message_id;
  }
}

var cekTransaksi;
if (global.paymentgateway.midtrans) {
  cekTransaksi = (await import("../lib/midtrans.js")).cekTransaksi;
} else if (global.paymentgateway.pakasir) {
  cekTransaksi = (await import("../lib/pakasir.js")).cekTransaksi;
} else if (global.paymentgateway.cashify) {
  cekTransaksi = (await import("../lib/cashify.js")).cekTransaksi;
} else if (global.paymentgateway.binancepay) {
  cekTransaksi = (await import("../lib/binancepay.js")).cekTransaksi;
}

let handler = async ({ bot, from, chat_id, data, message_id, bot_id }) => {
  const parts = data.data.split(" ");
  const nominal = parseInt(parts[1], 10);
  const qrisRef = parts[2];
  const lockKey = `${from}:${qrisRef}:digiflazz`;
  let locked = false;

  try {
    if (!cekTransaksi) return bot.answerCallbackQuery(data.id, { text: "Payment gateway belum dikonfigurasi.", show_alert: true });
    if (!Number.isFinite(nominal) || nominal <= 0 || !qrisRef) {
      return bot.answerCallbackQuery(data.id, { text: "Data pembayaran tidak valid", show_alert: true });
    }

    locked = processingLocks.lock(lockKey, 30000);
    if (!locked) {
      return bot.answerCallbackQuery(data.id, { text: "Permintaan sedang diproses, mohon tunggu.", show_alert: false });
    }

    const state = global.digiflazzInput?.[from];
    if (!state || state.step !== "qris_waiting" || state.qris_ref !== qrisRef) {
      return bot.answerCallbackQuery(data.id, { text: "Sesi QRIS tidak valid atau telah berakhir", show_alert: true });
    }

    const paid = await cekTransaksi(nominal, qrisRef);
    if (!paid) {
      return bot.answerCallbackQuery(data.id, {
        text: "Pembayaran belum terdeteksi ❗️\nSilahkan selesaikan pembayaran atau tunggu 30 detik terlebih dahulu.",
        show_alert: true,
      });
    }

    const stateError = validateDigiflazzCheckoutState(state);
    if (stateError) {
      delete global.digiflazzInput[from];
      return bot.answerCallbackQuery(data.id, { text: stateError, show_alert: true });
    }

    await bot.answerCallbackQuery(data.id, { text: "Pembayaran diterima, memproses Digiflazz..." }).catch(() => {});
    const statusMessageId = await safeEditOrSend(bot, chat_id, message_id, esc("_Pembayaran diterima, sedang memproses Digiflazz..._"), { parse_mode: "MarkdownV2" });

    delete global.digiflazzInput[from];
    const processResult = await processDigiflazzOrder({
      bot_id,
      from,
      product: state.product,
      customer_no: state.customer_no,
      quantity: state.quantity,
      paymentMethod: "qris",
      statusChatId: chat_id,
      statusMessageId,
    });

    const refundAmount = Number(state.product.sellPrice) * processResult.failedCount;
    if (refundAmount > 0) {
      const refundResult = await refundBalance(from, refundAmount);
      if (!refundResult.success) console.error("Refund QRIS Digiflazz gagal:", refundResult.error);
    }

    await safeEditOrSend(bot, chat_id, statusMessageId, esc(buildDigiflazzResultMessage({
      product: state.product,
      customer_no: state.customer_no,
      quantity: state.quantity,
      totalPaid: state.subtotal || nominal,
      paymentMethod: "qris",
      processResult,
      refundedAmount: refundAmount,
    })), { parse_mode: "MarkdownV2" });
  } catch (e) {
    console.error("Error in digiflazz-qrcheck:", e);
    const text = e?.response?.data?.message || e?.response?.data?.data?.message || e.message || "Terjadi kesalahan sistem.";
    bot.answerCallbackQuery(data.id, { text: String(text).slice(0, 180), show_alert: true }).catch(() => {});
  } finally {
    if (locked) processingLocks.unlock(lockKey);
  }
};

handler.key = "dgf_qrcheck";
export default handler;