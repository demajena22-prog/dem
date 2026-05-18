import "../config.js";
import { deductBalanceIfEnough, refundBalance } from "../lib/database.js";
import {
  buildDigiflazzResultMessage,
  getDigiflazzQuantity,
  getDigiflazzTotal,
  processDigiflazzOrder,
  validateDigiflazzCheckoutState,
} from "../lib/digiflazz-order.js";

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

function getErrorText(e, fallback = "Terjadi kesalahan") {
  return String(e?.response?.data?.message || e?.response?.data?.data?.message || e?.message || fallback).slice(0, 180);
}

let handler = async ({ bot, from, chat_id, data, message_id, bot_id }) => {
  let deductedAmount = 0;
  let statusMessageId = message_id;
  try {
    const state = global.digiflazzInput?.[from];
    if (!state) return bot.answerCallbackQuery(data.id, { text: "Sesi telah berakhir, silakan mulai lagi", show_alert: true });
    if (state.step !== "checkout") return bot.answerCallbackQuery(data.id, { text: "Langkah tidak valid", show_alert: true });

    const stateError = validateDigiflazzCheckoutState(state);
    if (stateError) {
      delete global.digiflazzInput[from];
      return bot.answerCallbackQuery(data.id, { text: stateError, show_alert: true });
    }

    const quantity = getDigiflazzQuantity(data.data.split(" ")[1] || state.quantity || 1);
    const total = getDigiflazzTotal(state.product, quantity);

    await bot.answerCallbackQuery(data.id, { text: "Transaksi sedang diproses..." }).catch(() => {});
    statusMessageId = await safeEditOrSend(bot, chat_id, message_id, esc("⏳ *Memproses pembayaran balance dan transaksi Digiflazz...*\n\nMohon tunggu sebentar."), {
      parse_mode: "MarkdownV2",
    });

    const deductResult = await deductBalanceIfEnough(from, total);
    if (!deductResult.success) {
      await safeEditOrSend(bot, chat_id, statusMessageId, esc(`❌ *Transaksi Gagal*\n\n${deductResult.error}`), { parse_mode: "MarkdownV2" });
      return;
    }

    deductedAmount = total;
    delete global.digiflazzInput[from];

    const processResult = await processDigiflazzOrder({
      bot_id,
      from,
      product: state.product,
      customer_no: state.customer_no,
      quantity,
      paymentMethod: "balance",
      statusChatId: chat_id,
      statusMessageId,
    });

    const refundAmount = Number(state.product.sellPrice) * processResult.failedCount;
    if (refundAmount > 0) {
      await refundBalance(from, refundAmount).catch((refundErr) => {
        console.error("Failed to refund Digiflazz balance:", refundErr);
        throw refundErr;
      });
      deductedAmount -= refundAmount;
    }
    deductedAmount = 0;

    await safeEditOrSend(bot, chat_id, statusMessageId, esc(buildDigiflazzResultMessage({
      product: state.product,
      customer_no: state.customer_no,
      quantity,
      totalPaid: total,
      paymentMethod: "balance",
      processResult,
      refundedAmount: refundAmount,
    })), { parse_mode: "MarkdownV2" });
  } catch (e) {
    console.error("Error in digiflazz-paybalance:", e);
    if (deductedAmount > 0) await refundBalance(from, deductedAmount).catch((refundErr) => console.error("Failed to refund Digiflazz balance after error:", refundErr));
    if (global.digiflazzInput?.[from]) delete global.digiflazzInput[from];
    await bot.answerCallbackQuery(data.id, { text: getErrorText(e), show_alert: true }).catch(() => {});
    await bot.sendMessage(chat_id, esc("❌ Terjadi kesalahan saat memproses Digiflazz. Jika saldo terpotong, saldo sudah dicoba dikembalikan."), { parse_mode: "MarkdownV2" });
  }
};

handler.key = "dgf_paybalance";
export default handler;