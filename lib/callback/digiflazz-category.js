import "../config.js";
import { getDigiflazzBrands } from "../lib/database.js";

const isIgnorableEditError = (err) => {
  const message = String(
    err?.message ||
    err?.response?.body?.description ||
    err?.response?.data?.description ||
    err?.response?.description ||
    err ||
    ""
  ).toLowerCase();

  return (
    message.includes("message to edit not found") ||
    message.includes("message can't be edited") ||
    message.includes("message_id_invalid") ||
    message.includes("message is not found") ||
    message.includes("message not found") ||
    message.includes("there is no text in the message to edit")
  );
};

const safeAnswerCallbackQuery = async (bot, data, options = {}) => {
  if (!data?.id) return false;
  try {
    await bot.answerCallbackQuery(data.id, options);
    return true;
  } catch {
    return false;
  }
};

const editOrSendMessage = async (bot, chat_id, message_id, text, options = {}) => {
  if (message_id) {
    try {
      await bot.editMessageText(text, { chat_id, message_id, ...options });
      return;
    } catch (err) {
      if (!isIgnorableEditError(err)) throw err;
    }
  }

  await bot.sendMessage(chat_id, text, options);
};

let handler = async ({ bot, from, chat_id, data, message_id, bot_id }) => {
  try {
    const category = data.data.split(" ").slice(1).join(" ");

    if (!category) {
      return safeAnswerCallbackQuery(bot, data, {
        text: "Kategori tidak valid",
        show_alert: true,
      });
    }

    const brandsResult = await getDigiflazzBrands(bot_id, category);

    if (!brandsResult.success || brandsResult.data.length === 0) {
      return safeAnswerCallbackQuery(bot, data, {
        text: "Belum ada produk dalam kategori ini",
        show_alert: true,
      });
    }

    const brands = brandsResult.data.sort();

    // Buat inline keyboard untuk brand
    const keyboard = [];
    for (let i = 0; i < brands.length; i += 2) {
      const row = [];
      row.push({
        text: brands[i],
        callback_data: `dgf_brand ${category}|${brands[i]}`,
        style: "primary",
      });
      if (i + 1 < brands.length) {
        row.push({
          text: brands[i + 1],
          callback_data: `dgf_brand ${category}|${brands[i + 1]}`,
          style: "primary",
        });
      }
      keyboard.push(row);
    }

    keyboard.push([
      { text: "↩️ Kembali", callback_data: "digiflazz", style: "danger" },
    ]);

    const message = `*🛒 ${category.toUpperCase()}*

Pilih operator/brand:`;

    await editOrSendMessage(bot, chat_id, message_id, esc(message), {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });

    await safeAnswerCallbackQuery(bot, data);
  } catch (e) {
    console.error("Error in digiflazz-category:", e);
    await safeAnswerCallbackQuery(bot, data, {
      text: "Terjadi kesalahan",
      show_alert: true,
    });
  }
};

handler.key = "dgf_cat";

export default handler;
