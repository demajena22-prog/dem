import "../config.js";
import { getDigiflazzQuantity } from "../lib/digiflazz-order.js";
import { safeDeleteMessage } from "../lib/myfunc.js";

export default async function ({ bot, chat_id, from, body, bot_id, message_id }) {
  const inputState = global.onInputDigiflazzQty?.[from];
  if (!inputState || inputState.status !== "input_jumlah_digiflazz") return;

  const quantity = parseInt(body, 10);
  const retryOptions = {
    parse_mode: "MarkdownV2",
    reply_markup: { force_reply: true },
  };

  if (!Number.isFinite(quantity)) {
    await bot.sendMessage(chat_id, "*Mohon masukkan angka yang valid ❗️*", retryOptions);
    return;
  }

  if (quantity <= 0) {
    await bot.sendMessage(chat_id, "*Jumlah beli harus lebih dari 0 ❗️*", retryOptions);
    return;
  }

  if (quantity > 100) {
    await bot.sendMessage(chat_id, "*Jumlah beli Digiflazz maksimal 100 unit per transaksi ❗️*", retryOptions);
    return;
  }

  await safeDeleteMessage(bot, chat_id, message_id);
  await safeDeleteMessage(bot, chat_id, inputState.message2);

  delete global.onInputDigiflazzQty[from];
  const checkout = global.cbFunction?.dgf_checkout;
  if (!checkout) {
    return bot.sendMessage(chat_id, esc("*Terjadi Kesalahan ❗️*\nHandler checkout Digiflazz tidak ditemukan."), { parse_mode: "MarkdownV2" });
  }

  const inputBot = Object.create(bot);
  inputBot.answerCallbackQuery = async () => true;

  await checkout({
    bot: inputBot,
    data: { id: null, data: `dgf_checkout current ${getDigiflazzQuantity(quantity)}` },
    bot_id,
    chat_id,
    message_id: inputState.message1,
    from,
  });
}