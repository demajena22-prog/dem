import "../config.js";
import { getDigiflazzProducts } from "../lib/database.js";
import { safeDeleteMessage, stripEmoji } from "../lib/myfunc.js";

async function sendVariantSelectionAfterCancel(bot, from, chat_id, message_id, bot_id, product) {
  const category = product?.category;
  const brand = product?.brand;
  if (!category || !brand) return false;

  const productsResult = await getDigiflazzProducts(bot_id, { category, brand });
  if (!productsResult.success || productsResult.data.length === 0) return false;

  const products = productsResult.data;
  const keyboard = [];
  const replyKeyboard = [];
  const variantMap = new Map();
  const maxPerPage = 10;
  const displayProducts = products.slice(0, maxPerPage);

  for (const item of displayProducts) {
    const label = `${stripEmoji(item.product_name)} - ${rupiah(item.sellPrice)}`;
    variantMap.set(label, `dgf_select ${item.buyer_sku_code}`);
    keyboard.push([{ text: label, callback_data: `dgf_select ${item.buyer_sku_code}`, style: "success" }]);
    replyKeyboard.push([{ text: label, style: "success" }]);
  }

  keyboard.push([{ text: "↩️ Kembali", callback_data: `dgf_cat ${category}`, style: "danger" }]);
  replyKeyboard.push([{ text: "↩️ Kembali", style: "danger" }]);

  if (!global.digiflazzVariantContext) global.digiflazzVariantContext = new Map();
  global.digiflazzVariantContext.set(from, {
    products: variantMap,
    back: `dgf_cat ${category}`,
  });

  const message = `❌ *Transaksi Dibatalkan*

*🛒 ${brand.toUpperCase()}*
_${category}_

Pilih produk yang ingin dibeli:

${products.length > maxPerPage ? `\n_Menampilkan ${maxPerPage} dari ${products.length} produk_` : ""}`;

  // Pesan QRIS berupa photo/caption, jadi lebih aman dihapus lalu kirim daftar varian baru.
  await safeDeleteMessage(bot, chat_id, message_id);

  if (global.use_reply_keyboard) {
    await bot.sendMessage(chat_id, esc(message), {
      parse_mode: "MarkdownV2",
      reply_markup: { keyboard: replyKeyboard, resize_keyboard: true, is_persistent: true },
    });
  } else {
    await bot.sendMessage(chat_id, esc(message), {
      parse_mode: "MarkdownV2",
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  return true;
}

async function deletePaymentMessage(bot, chat_id, message_id) {
  return safeDeleteMessage(bot, chat_id, message_id, { logUnexpected: false });
}

async function editOrSendCancelMessage(bot, chat_id, message_id) {
  const text = esc("❌ *Transaksi Dibatalkan*\n\nAnda dapat memulai transaksi baru kapan saja.");
  const deleted = await deletePaymentMessage(bot, chat_id, message_id);
  if (deleted) {
    await bot.sendMessage(chat_id, text, { parse_mode: "MarkdownV2" });
    return;
  }

  try {
    await bot.editMessageCaption(text, {
      chat_id,
      message_id,
      parse_mode: "MarkdownV2",
      reply_markup: { inline_keyboard: [] },
    });
  } catch (captionError) {
    try {
      await bot.editMessageText(text, {
        chat_id,
        message_id,
        parse_mode: "MarkdownV2",
        reply_markup: { inline_keyboard: [] },
      });
    } catch (e) {
      const msg = e.message || captionError.message || "";
      if (msg.includes("message is not modified")) return;
      await bot.sendMessage(chat_id, text, { parse_mode: "MarkdownV2" });
    }
  }
}

let handler = async ({ bot, from, chat_id, data, message_id, bot_id }) => {
  try {
    const state = global.digiflazzInput?.[from];
    const product = state?.product;
    const paymentChatId = state?.qris_chat_id || chat_id;
    const paymentMessageId = state?.qris_message_id || message_id;

    if (global.digiflazzInput && global.digiflazzInput[from]) {
      delete global.digiflazzInput[from];
    }

    if (global.onInputDigiflazzQty && global.onInputDigiflazzQty[from]) {
      delete global.onInputDigiflazzQty[from];
    }

    if (global.digiflazzVariantContext) {
      global.digiflazzVariantContext.delete(from);
    }

    const returnedToVariant = await sendVariantSelectionAfterCancel(bot, from, paymentChatId, paymentMessageId, bot_id, product);
    if (!returnedToVariant) {
      await editOrSendCancelMessage(bot, paymentChatId, paymentMessageId);
    }

    if (data?.id) {
      await bot.answerCallbackQuery(data.id, {
        text: returnedToVariant ? "Transaksi dibatalkan, silakan pilih varian lagi" : "Transaksi dibatalkan",
      }).catch(() => {});
    }
  } catch (e) {
    console.error("Error in digiflazz-cancel:", e);
    const text = e?.response?.data?.message || e?.response?.data?.data?.message || e.message || "Terjadi kesalahan";
    if (data?.id) {
      await bot.answerCallbackQuery(data.id, {
        text: String(text).slice(0, 180),
        show_alert: true,
      }).catch(() => {});
    }
  }
};

handler.key = "dgf_cancel";

export default handler;
