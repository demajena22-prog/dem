import { getCategory, getCombinedCategoriesWithBrands, getDBData, dbUser } from "../lib/database.js";
import time from "../lib/datetime.js";
import { generateListProdukCard, editWithCard } from "../lib/card-generator.js";

const PER_PAGE = 15;

let handler = async ({ bot, chat_id, message_id, bot_id, data, user_id, pushname }) => {
  let user = await getDBData(dbUser, user_id);
  if (!user) return bot.answerCallbackQuery(data.id, { text: "Gagal memuat data user.", show_alert: true });

  let get = await getCombinedCategoriesWithBrands(bot_id);
  if (!get.success) {
    return bot.answerCallbackQuery(data.id, { text: `Error: ${get.error}`, show_alert: true });
  }

  const categories = get.data || {};
  let keys = Object.keys(categories);

  keys.sort((a, b) => {
    const nameA = a.replace(/\d+$/, "");
    const nameB = b.replace(/\d+$/, "");
    const cmp = nameA.localeCompare(nameB, "id", { sensitivity: "base" });
    if (cmp !== 0) return cmp;
    const matchA = a.match(/\d+$/);
    const matchB = b.match(/\d+$/);
    const numA = parseInt(matchA ? matchA[0] : 0, 10);
    const numB = parseInt(matchB ? matchB[0] : 0, 10);
    return numA - numB;
  });

  let page = 1;
  const args = data.data.split(" ");
  if (args[1]) {
    page = Math.max(1, parseInt(args[1]) || 1);
  }

  const totalItems = keys.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));
  if (page > totalPages) page = totalPages;

  const startIndex = (page - 1) * PER_PAGE;
  const endIndex = Math.min(startIndex + PER_PAGE, totalItems);
  const pageKeys = keys.slice(startIndex, endIndex);

  let capt;
  if (totalItems < 1) {
    capt = `*Selamat ${time.salam}, ${pushname} 👋*\n\nKami memohon maaf, saat ini belum terdapat produk yang dapat kami tawarkan. 😔🙏`;
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
  replyKeyboard.push([{ text: "🔄 Refresh", style: "primary" }, { text: "Kembali ke Menu ↩️", style: "danger" }]);
  contextMap.set("🔄 Refresh", `listproduk ${page}`);
  contextMap.set("Kembali ke Menu ↩️", "main_menu");
  contextMap.set("↩️ Kembali ke Menu", "main_menu");
  global.productButtonContext?.set(user_id, contextMap);

  const cardBuf = await generateListProdukCard({
    bot,
    from: user_id,
    pushname,
    storeName: global.store_name,
    salam: time.salam,
    categories: pageKeys.map((k, i) => ({ num: startIndex + i + 1, name: k })),
    page,
    totalPages
  });

  const reply_markup = global.use_reply_keyboard ? {
    keyboard: replyKeyboard.length ? replyKeyboard : [[{ text: "Kembali ke Menu ↩️" }]],
    resize_keyboard: true,
    is_persistent: true,
  } : {
    inline_keyboard: inlineKeyboard,
  };

  await editWithCard(bot, chat_id, message_id, cardBuf, esc(capt), reply_markup);
};

handler.key = "listproduk";

export default handler;
