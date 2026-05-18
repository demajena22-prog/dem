import { getProductDetails } from "../lib/database.js";
import { safeDeleteMessage } from "../lib/myfunc.js";

export default async function ({ bot, chat_id, from, body, bot_id, m, message_id }) {
  if (
    global.onInputCart &&
    global.onInputCart[from] &&
    global.onInputCart[from].status === "input_jumlah"
  ) {
    let jumlah_pesanan = parseInt(body, 10);
    const inputState = global.onInputCart[from];
    const product_id = inputState.product_id;
    const retryOptions = {
      parse_mode: "MarkdownV2",
      reply_markup: { force_reply: true },
    };

    if (isNaN(jumlah_pesanan)) {
      await bot.sendMessage(chat_id, "*Mohon masukkan angka yang valid ❗️*", {
        ...retryOptions,
      });
      return;
    } else if (jumlah_pesanan <= 0) {
      await bot.sendMessage(
        chat_id,
        "*Jumlah pesanan harus lebih dari 0 ❗️*",
        retryOptions
      );
      return;
    } else if (jumlah_pesanan > 100000) {
      await bot.sendMessage(
        chat_id,
        "*Jumlah pesanan terlalu besar ❗️ Maksimal 100.000 unit*",
        retryOptions
      );
      return;
    }

    const productResult = await getProductDetails(bot_id, product_id);
    if (!productResult.success) {
      await bot.sendMessage(chat_id, esc(`*Terjadi Kesalahan ❗️*\n\`${productResult.error}\``), { parse_mode: "MarkdownV2" });
      return delete global.onInputCart[from];
    }
    const productData = productResult.data;

    if (jumlah_pesanan > productData.stock) {
      await bot.sendMessage(
        chat_id,
        `Stok tersedia hanya ${productData.stock} unit ❗️\nMohon masukkan jumlah yang sesuai`,
        retryOptions
      );
      return;
    }

    await safeDeleteMessage(bot, chat_id, message_id);
    const addcart = global.cbFunction?.addcart;
    if (!addcart) {
      await bot.sendMessage(chat_id, esc("*Terjadi Kesalahan ❗️*\nHandler order tidak ditemukan."), { parse_mode: "MarkdownV2" });
      return delete global.onInputCart[from];
    }

    await safeDeleteMessage(bot, chat_id, inputState.message2);
    delete global.onInputCart[from];
    if (global.orderContext) global.orderContext.set(from, `addcart ${product_id} ${jumlah_pesanan}`);

    const inputBot = Object.create(bot);
    inputBot.answerCallbackQuery = async () => true;

    await addcart({
      bot: inputBot,
      data: { id: null, data: `addcart ${product_id} ${jumlah_pesanan}` },
      bot_id,
      chat_id,
      message_id: inputState.message1,
      from,
    });
  }
}