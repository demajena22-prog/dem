import {
  dbBot,
  dbUser,
  User,
  getDBData,
  getCategory,
  getProductList,
} from "../lib/database.js";
import time from "../lib/datetime.js";
import moment from "moment-timezone";
import { rupiah } from "../lib/myfunc.js";
import { generateStokCard, generateListProdukCard } from "../lib/card-generator.js";

const PER_PAGE = 15;

export default async function ({
  from,
  body,
  bot,
  bot_id,
  chat_id,
  pushname,
  username,
}) {
  let user = await getDBData(dbUser, from);
  if (!user)
    return bot.reply("Gagal memproses perintah, silahkan hubungi owner.");

  let cas = body.toLowerCase();


  if (cas === "/stok" || cas === "stok" || cas.startsWith("/stok")) {
    let list = await getProductList(bot_id);
    if (!list.success) {
      return bot.reply(`*Terjadi Kesalahan ❗️*\n\`${list.error}\``);
    }

    let products = list.data;

    products.sort((a, b) => a.name.localeCompare(b.name));

    let date = moment().tz("Asia/Jakarta").locale("id").format("dddd, DD MMMM YYYY HH:mm:ss");

    let caption = `📦 STOCK PRODUCTS\n${date}\n\n`;

    if (products.length === 0) {
      caption += "_Belum ada produk yang tersedia._";
    } else {
      for (let p of products) {
        let icon = p.stock > 0 ? "✅" : "❌";
        caption += `${icon} ${p.name} - x${p.stock}\n`;
      }
    }

    const totalPages = 1;
    const cardBuf = await generateStokCard({
      from: chat_id,
      storeName: global.store_name,
      date,
      products: products.map(p => ({ name: p.name, stock: p.stock })),
      page: 1,
      totalPages
    });

    return bot.sendPhoto(chat_id, cardBuf, {
      caption: esc(caption),
      parse_mode: "MarkdownV2",
      file_name: 'card.png',
      contentType: 'image/png',
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: "checkstok", style: "primary" }],
          [{ text: "↩️ Kembali ke Menu", callback_data: "main_menu", style: "danger" }]
        ],
      },
    });
  }


  if (cas.startsWith("list produk")) {
    let get = await getCategory(bot_id);
    if (!get.success) {
      return bot.reply(`*Terjadi Kesalahan ❗️*\n\`${get.error}\``);
    }

    const categories = get.data || {};
    let keys = Object.keys(categories);

    keys.sort((a, b) => {
      const nameA = a.replace(/\d+$/, "");
      const nameB = b.replace(/\d+$/, "");

      const cmp = nameA.localeCompare(nameB, "id", { sensitivity: "base" });
      if (cmp !== 0) return cmp;

      const numA = parseInt(a.match(/\d+$/)?.[0] || 0, 10);
      const numB = parseInt(b.match(/\d+$/)?.[0] || 0, 10);

      return numA - numB;
    });

    let page = 1;
    const m = body.match(/listproduk(?:\s*[:\-]?\s*(\d+)|(\d+))?$/i);
    if (m) page = Math.max(1, parseInt(m[1] || m[2]) || 1);

    const totalItems = keys.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));
    if (page > totalPages) page = totalPages;

    const startIndex = (page - 1) * PER_PAGE;
    const endIndex = Math.min(startIndex + PER_PAGE, totalItems);
    const pageKeys = keys.slice(startIndex, endIndex);

    let capt;
    if (totalItems < 1) {
      capt = `*Selamat ${time.salam}, ${pushname} 👋*\n\nKami memohon maaf, saat ini belum terdapat produk yang dapat kami tawarkan karena *Owner* belum melakukan pengisian ulang produk. 😔🙏`;
    } else {
      capt = `*Selamat ${time.salam}, ${pushname}* 👋🏻\n\nBerikut adalah daftar kategori produk yang tersedia:\n`;
      capt += `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
      let num = startIndex + 1;
      for (let key of pageKeys) {
        capt += `┊ [*${num++}] ${key}*\n`;
      }
      capt += `╰ - - - - - - - - - - - - - - - - - - - ╯`;
    }

    const inlineKeyboard = [];
    const replyKeyboard = [];
    const contextMap = new Map();
    const cols = 5;

    for (let i = 0; i < pageKeys.length; i += cols) {
      const row = pageKeys.slice(i, i + cols).map((k, idx) => {
        const globalIndex = startIndex + i + idx + 1;
        contextMap.set(`${globalIndex}`, `selcat ${globalIndex}`);
        return { text: `${globalIndex}`, callback_data: `selcat ${globalIndex}`, style: "primary" };
      });
      inlineKeyboard.push(row);
      replyKeyboard.push(row.map((button) => ({ text: button.text, style: button.style })));
    }

    const navRow = [];
    if (page > 1) {
      contextMap.set("‹ Sebelumnya", `listproduk ${page - 1}`);
      navRow.push({
        text: "‹ Sebelumnya",
        callback_data: `listproduk ${page - 1}`,
        style: "primary",
      });
    }
    if (page < totalPages) {
      contextMap.set("Berikutnya ›", `listproduk ${page + 1}`);
      navRow.push({
        text: "Berikutnya ›",
        callback_data: `listproduk ${page + 1}`,
        style: "primary",
      });
    }

    if (navRow.length > 0) inlineKeyboard.push(navRow);
    if (navRow.length > 0) replyKeyboard.push(navRow.map((button) => ({ text: button.text, style: button.style })));
    inlineKeyboard.push([{ text: "↩️ Kembali ke Menu", callback_data: "main_menu", style: "danger" }]);

    const cardBuf2 = await generateListProdukCard({
      bot, from,
      pushname,
      storeName: global.store_name,
      salam: time.salam,
      categories: pageKeys.map((k, i) => ({ num: startIndex + i + 1, name: k })),
      page,
      totalPages
    });

    replyKeyboard.push([{ text: "🔄 Refresh", style: "primary" }, { text: "Kembali ke Menu ↩️", style: "danger" }]);
    contextMap.set("🔄 Refresh", `listproduk ${page}`);
    contextMap.set("Kembali ke Menu ↩️", "main_menu");
    contextMap.set("↩️ Kembali ke Menu", "main_menu");
    global.productButtonContext?.set(from, contextMap);

    const reply_markup = global.use_reply_keyboard ? {
      keyboard: replyKeyboard,
      resize_keyboard: true,
      is_persistent: true,
    } : {
      inline_keyboard: inlineKeyboard,
    };

    await bot.sendPhoto(chat_id, cardBuf2, {
      caption: esc(capt),
      parse_mode: "MarkdownV2",
      file_name: 'card.png',
      contentType: 'image/png',
      reply_markup,
    });
  }
}