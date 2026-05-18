import { getCategory, getProductList } from "../lib/database.js";
import moment from "moment-timezone";

export default async function ({ from, body, bot, bot_id, chat_id, m }) {
  if (isNaN(body)) return;
  if (global.onInputCart && global.onInputCart[from]) return;
  if (m.reply_to_message) return;
  let get = await getCategory(bot_id);
  let products = await getProductList(bot_id);
  if (!get.success) {
    return bot.reply(`*Terjadi Kesalahan ❗️*\n\`${get.error}\``);
  } else if (!products.success) {
    return bot.reply(`*Terjadi Kesalahan ❗️*\n\`${products.error}\``);
  }
  let jamWib = moment().tz("Asia/Jakarta").format("HH.mm.ss") + " WIB";
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

  let select = keys[Number(body) - 1];
  let cekCategory = categories[select];
  if (!cekCategory) return;
  let sold = 0;
  for (let prod of cekCategory) {
    let res = products.data.find((p) => p.productId == prod);
    sold += res.terjual || 0;
  }
  let detail = products.data[cekCategory[0]];
  let caption = `╭ - - - - - - - - - - - - - - - - - - - - - - - ╮\n`;
  caption += `┊ *Produk :* ${select}\n`;
  caption += `┊ *Terjual :* ${sold}pcs\n`;
  caption += `╰ - - - - - - - - - - - - - - - - - - - - - - - ╯\n`;
  let num = 1;
  let buttonProduct = [];
  const contextMap = new Map();
  for (let prod of cekCategory) {
    let res = products.data.find((p) => p.productId === prod);
    if (!res) continue;
    caption += `╭ - - - - - - - - - - - - - - - - - - - - - - -  ╮\n`;
    caption += `┊ \`${res.name.toUpperCase()}\`\n`;
    
    caption += `┊ Harga: *Rp${res.price.toLocaleString("id-ID")}* - *Stok :* ${
      res.stock
    }\n`;
    caption += `┊ ╰➤ Terjual: *${res.terjual}pcs*\n`;
    caption += `╰ - - - - - - - - - - - - - - - - - - - - - - - ╯\n`;
    buttonProduct.push([
      { text: `${res.name}`, callback_data: `addcart ${res.productId}`, style: "success" },
    ]);
    contextMap.set(res.name, `addcart ${res.productId}`);
  }
  caption += `╰➤  Refresh at *${jamWib}*`;
  buttonProduct.push([
    { text: "🔄 Refresh", callback_data: `refresh ${select.toLowerCase()}`, style: "primary" },
  ]);
  contextMap.set("🔄 Refresh", `refresh ${select.toLowerCase()}`);
  global.productButtonContext?.set(from, contextMap);
  await bot.sendMessage(chat_id, esc(caption), {
    parse_mode: "MarkdownV2",
    reply_markup: {
      inline_keyboard: buttonProduct,
    },
  });
}