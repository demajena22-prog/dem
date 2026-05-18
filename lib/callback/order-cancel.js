import "../config.js";
import { safeDeleteMessage } from "../lib/myfunc.js";

function clearOrderCancelState(from) {
  if (global.orderContext) global.orderContext.delete(from);
  if (global.orderPaymentContext) global.orderPaymentContext.delete(from);
  if (global.onInputCart) delete global.onInputCart[from];
  if (global.onInputVoucher) delete global.onInputVoucher[from];
}

function getStoredPaymentMessage(from) {
  const paymentData = global.orderPaymentContext?.get(from);
  return {
    chatId: paymentData?.paymentChatId,
    messageId: paymentData?.paymentMessageId,
  };
}

async function removePaymentMessage(bot, chat_id, message_id) {
  return safeDeleteMessage(bot, chat_id, message_id, { logUnexpected: false });
}

async function disablePaymentButtons(bot, chat_id, message_id) {
  if (!chat_id || !message_id) return;
  try {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id, message_id });
  } catch (e) {}
}

let handler = async ({ bot, from, chat_id, data, message_id }) => {
  const targetChatId = chat_id || from;
  const storedPayment = getStoredPaymentMessage(from);
  clearOrderCancelState(from);

  let deleted = await removePaymentMessage(bot, storedPayment.chatId, storedPayment.messageId);
  if (!deleted) deleted = await removePaymentMessage(bot, targetChatId, message_id);
  if (!deleted) await disablePaymentButtons(bot, targetChatId, message_id);

  await bot.sendMessage(targetChatId, esc("❌ *Transaksi Dibatalkan*\n\nPembayaran produk telah dibatalkan. Silakan mulai pesanan baru dari menu."), {
    parse_mode: "MarkdownV2",
    reply_markup: {
      inline_keyboard: [[{ text: "↩️ Kembali ke Menu", callback_data: "main_menu", style: "danger" }]],
    },
  });

  await bot.answerCallbackQuery(data?.id, { text: "Transaksi dibatalkan" }).catch(() => {});
};

handler.key = ["order_cancel", "cancelorder", "batalorder"];

export default handler;