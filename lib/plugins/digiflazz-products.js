import "../config.js";
import { getDigiflazzCategories } from "../lib/database.js";
import { formatCategory } from "../lib/digiflazz.js";

let handler = async ({ bot, from, chat_id, bot_id }) => {
  try {
    if (!global.digiflazz?.enabled) {
      return bot.sendMessage(
        chat_id,
        esc("Fitur produk digital belum diaktifkan."),
        { parse_mode: "MarkdownV2" }
      );
    }

    const categoriesResult = await getDigiflazzCategories(bot_id);

    if (!categoriesResult.success || categoriesResult.data.length === 0) {
      return bot.sendMessage(
        chat_id,
        esc("Belum ada produk digital yang tersedia.\n\nAdmin dapat melakukan sync produk dengan command /digiflazz-sync"),
        { parse_mode: "MarkdownV2" }
      );
    }

    const categories = categoriesResult.data;
    
    // Buat inline keyboard untuk kategori
    const keyboard = [];
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      row.push({
        text: formatCategory(categories[i]),
        callback_data: `dgf_cat ${categories[i]}`,
        style: "primary",
      });
      if (i + 1 < categories.length) {
        row.push({
          text: formatCategory(categories[i + 1]),
          callback_data: `dgf_cat ${categories[i + 1]}`,
          style: "primary",
        });
      }
      keyboard.push(row);
    }

    keyboard.push([
      { text: "🔄 Refresh", callback_data: "digiflazz", style: "primary" },
      { text: "↩️ Kembali", callback_data: "main_menu", style: "danger" },
    ]);

    const message = `*🛒 PRODUK DIGITAL*

Pilih kategori produk yang ingin Anda beli:

💡 *Tips:*
• Pastikan saldo Anda mencukupi
• Periksa nomor tujuan dengan teliti
• Transaksi diproses otomatis`;

    await bot.sendMessage(chat_id, esc(message), {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (e) {
    console.error("Error in digiflazz-products:", e);
    bot.sendMessage(chat_id, esc(global.mess.error), {
      parse_mode: "MarkdownV2",
    });
  }
};

handler.command = ["digiflazz"];

export default handler;
