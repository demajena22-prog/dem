import "../config.js";
import { getDigiflazzProductByCode } from "../lib/database.js";
import { stripEmoji } from "../lib/myfunc.js";

// Global state untuk menyimpan input user
if (!global.digiflazzInput) global.digiflazzInput = {};

let handler = async ({ bot, from, chat_id, data, message_id, bot_id }) => {
  try {
    const buyer_sku_code = data.data.split(" ").slice(1).join(" ");

    if (!buyer_sku_code) {
      return bot.answerCallbackQuery(data.id, {
        text: "Produk tidak valid",
        show_alert: true,
      });
    }

    const productResult = await getDigiflazzProductByCode(bot_id, buyer_sku_code);

    if (!productResult.success) {
      return bot.answerCallbackQuery(data.id, {
        text: productResult.error,
        show_alert: true,
      });
    }

    const product = productResult.data;

    // Simpan produk ke state
    if (global.digiflazzVariantContext) global.digiflazzVariantContext.delete(from);
    global.digiflazzInput[from] = {
      product,
      step: "input_number",
    };

    const message = `*${stripEmoji(product.product_name)}*

*Harga:* ${rupiah(product.sellPrice)}
*Kategori:* ${product.category}
*Brand:* ${product.brand}

${product.desc ? `_${product.desc}_\n\n` : ""}*Masukkan nomor tujuan:*
${getNumberHint(product.category)}`;

    const keyboard = [
      [{ text: "❌ Batalkan", callback_data: `dgf_brand ${product.category}|${product.brand}`, style: "danger" }],
    ];

    if (global.use_reply_keyboard || !data.id) {
      await bot.sendMessage(chat_id, esc(message), {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
    } else {
      await bot.editMessageText(esc(message), {
        chat_id,
        message_id,
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
    }

    await bot.answerCallbackQuery(data.id);
  } catch (e) {
    console.error("Error in digiflazz-product-select:", e);
    // Cleanup state on error
    if (global.digiflazzInput && global.digiflazzInput[from]) {
      delete global.digiflazzInput[from];
    }
    bot.answerCallbackQuery(data.id, {
      text: "Terjadi kesalahan",
      show_alert: true,
    });
  }
};

handler.key = "dgf_select";

function getNumberHint(category) {
  const normalizedCategory = String(category || "").trim().toLowerCase();

  switch (normalizedCategory) {
    case "pulsa":
    case "data":
    case "paket data":
      return "Contoh: 08123456789";
    case "pln":
    case "token listrik":
      return "Contoh: 12345678901 (11-12 digit)";
    case "voucher":
    case "voucher game":
      return "Contoh: 1234567890 (ID Game)";
    case "e-money":
    case "e-wallet":
      return "Contoh: 08123456789";
    default:
      return "Masukkan nomor/ID tujuan";
  }
}

export default handler;
