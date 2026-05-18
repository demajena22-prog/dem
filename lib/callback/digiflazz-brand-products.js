import "../config.js";
import { getDigiflazzProductsByBrand } from "../lib/database.js";
import { safeDeleteMessage, stripEmoji } from "../lib/myfunc.js";

let handler = async ({ bot, from, chat_id, message_id, bot_id, data, brand }) => {
  try {
    const params = String(data?.data || "").split(" ").slice(1).join(" ");
    const [brandParam, rawPage] = params.split("|");
    const selectedBrand = brand || brandParam;
    const requestedPage = Number.parseInt(rawPage || "0", 10);
    const page = Number.isFinite(requestedPage) && requestedPage >= 0 ? requestedPage : 0;

    if (!selectedBrand) {
      return bot.answerCallbackQuery(data.id, {
        text: "Parameter tidak valid",
        show_alert: true,
      });
    }

    const productsResult = await getDigiflazzProductsByBrand(bot_id, selectedBrand);

    if (!productsResult.success || productsResult.data.length === 0) {
      return bot.answerCallbackQuery(data.id, {
        text: "Belum ada produk tersedia",
        show_alert: true,
      });
    }

    const products = productsResult.data;

    // Buat inline keyboard untuk produk (max 10 per page)
    const keyboard = [];
    const replyKeyboard = [];
    const variantMap = new Map();
    const navigationMap = new Map();
    const maxPerPage = 10;
    const totalPages = Math.max(1, Math.ceil(products.length / maxPerPage));
    const safePage = Math.min(page, totalPages - 1);
    const start = safePage * maxPerPage;
    const displayProducts = products.slice(start, start + maxPerPage);

    for (const product of displayProducts) {
      const label = `${stripEmoji(product.product_name)} - ${rupiah(product.sellPrice)}`;
      variantMap.set(label, `dgf_select ${product.buyer_sku_code}`);
      keyboard.push([
        {
          text: label,
          callback_data: `dgf_select ${product.buyer_sku_code}`,
          style: "success",
        },
      ]);
      replyKeyboard.push([{ text: label, style: "success" }]);
    }

    const prevCallback = safePage > 0 ? `dgf_brand_products ${selectedBrand}|${safePage - 1}` : null;
    const nextCallback = safePage < totalPages - 1 ? `dgf_brand_products ${selectedBrand}|${safePage + 1}` : null;
    const navRow = [];
    const navReplyRow = [];

    if (prevCallback) {
      navRow.push({ text: "⬅️ Sebelumnya", callback_data: prevCallback, style: "primary" });
      navReplyRow.push({ text: "⬅️ Sebelumnya", style: "primary" });
      navigationMap.set("⬅️ Sebelumnya", prevCallback);
    }

    if (nextCallback) {
      navRow.push({ text: "➡️ Berikutnya", callback_data: nextCallback, style: "primary" });
      navReplyRow.push({ text: "➡️ Berikutnya", style: "primary" });
      navigationMap.set("➡️ Berikutnya", nextCallback);
    }

    if (navRow.length) keyboard.push(navRow);
    if (navReplyRow.length) replyKeyboard.push(navReplyRow);

    keyboard.push([
      { text: "↩️ Kembali", callback_data: "listproduk", style: "danger" },
    ]);
    replyKeyboard.push([{ text: "↩️ Kembali", style: "danger" }]);

    if (from) {
      if (!global.digiflazzVariantContext) global.digiflazzVariantContext = new Map();
      global.digiflazzVariantContext.set(from, {
        products: variantMap,
        navigation: navigationMap,
        back: "listproduk",
      });
    }

    const shownStart = start + 1;
    const shownEnd = Math.min(start + displayProducts.length, products.length);

    const message = `*🛒 ${selectedBrand.toUpperCase()}*

Pilih produk yang ingin dibeli:

${products.length > maxPerPage ? `\n_Menampilkan ${shownStart}-${shownEnd} dari ${products.length} produk (Halaman ${safePage + 1}/${totalPages})_` : ""}`;

    await safeDeleteMessage(bot, chat_id, message_id, { logUnexpected: false });

    // Send new message
    await bot.sendMessage(chat_id, esc(message), {
      parse_mode: "MarkdownV2",
      reply_markup: global.use_reply_keyboard
        ? { keyboard: replyKeyboard, resize_keyboard: true, is_persistent: true }
        : { inline_keyboard: keyboard },
    });

    await bot.answerCallbackQuery(data.id);
  } catch (e) {
    console.error("Error in digiflazz-brand-products:", e);
    bot.answerCallbackQuery(data.id, {
      text: "Terjadi kesalahan",
      show_alert: true,
    });
  }
};

handler.key = "dgf_brand_products";

export default handler;
