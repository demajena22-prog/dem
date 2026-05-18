import { getCategory, getProductList } from "../lib/database.js";
import moment from "moment-timezone";
import { generateCategoryCard, editWithCard } from "../lib/card-generator.js";

let handler = async ({ bot, chat_id, message_id, bot_id, data, from }) => {
  
  
  
  
  let categoryName = data.data.replace('refresh ', '');
  
  let get = await getCategory(bot_id);
  let products = await getProductList(bot_id);

  if (!get.success) {
    return bot.answerCallbackQuery(data.id, { text: `Error: ${get.error}`, show_alert: true });
  } else if (!products.success) {
    return bot.answerCallbackQuery(data.id, { text: `Error: ${products.error}`, show_alert: true });
  }

  let jamWib = moment().tz("Asia/Jakarta").format("HH.mm.ss") + " WIB";
  const categories = get.data || {};
  
  
  let select = Object.keys(categories).find(k => k.toLowerCase() === categoryName.toLowerCase());
  
  if (!select) {
     return bot.answerCallbackQuery(data.id, { text: "Kategori tidak ditemukan / berubah nama.", show_alert: true });
  }

  let cekCategory = categories[select];
  let sold = 0;
  for (let prod of cekCategory) {
    let res = products.data.find((p) => p.productId == prod);
    if (res) sold += res.terjual || 0;
  }

  let caption = `╭ - - - - - - - - - - - - - - - - - - - - - - - ╮\n`;
  caption += `┊ *Produk :* ${select}\n`;
  caption += `┊ *Terjual :* ${sold}pcs\n`;
  caption += `╰ - - - - - - - - - - - - - - - - - - - - - - - ╯\n`;

  let buttonProduct = [];
  let replyKeyboard = [];
  const contextMap = new Map();
  for (let prod of cekCategory) {
    let res = products.data.find((p) => p.productId === prod);
    if (res) {
        caption += `╭ - - - - - - - - - - - - - - - - - - - - - - -  ╮\n`;
        caption += `┊ \`${res.name.toUpperCase()}\`\n`;
        caption += `┊ Harga: *Rp${res.price.toLocaleString("id-ID")}* - *Stok :* ${res.stock}\n`;
        caption += `┊ ╰➤ Terjual: *${res.terjual}pcs*\n`;
        caption += `╰ - - - - - - - - - - - - - - - - - - - - - - - ╯\n`;
        buttonProduct.push([
            { text: `${res.name}`, callback_data: `addcart ${res.productId}`, style: "success" },
        ]);
        replyKeyboard.push([{ text: res.name, style: "success" }]);
        contextMap.set(res.name, `addcart ${res.productId}`);
    }
  }

  caption += `╰➤  Refresh at *${jamWib}*`;
  
  buttonProduct.push([
    { text: "🔄 Refresh", callback_data: `refresh ${select.toLowerCase()}`, style: "primary" }, 
    { text: "↩️ Kembali", callback_data: `listproduk`, style: "danger" }
  ]);
  replyKeyboard.push([{ text: "🔄 Refresh", style: "primary" }, { text: "↩️ Kembali", style: "danger" }]);
  contextMap.set("🔄 Refresh", `refresh ${select.toLowerCase()}`);
  contextMap.set("↩️ Kembali", "listproduk");
  global.productButtonContext?.set(from, contextMap);

  const prods = cekCategory.map(prod => {
    let res = products.data.find(p => p.productId === prod);
    return res ? { name: res.name, price: 'Rp' + res.price.toLocaleString('id-ID'), stock: res.stock, sold: res.terjual || 0 } : null;
  }).filter(Boolean);

  const cardBuf = await generateCategoryCard({
    from: chat_id,
    categoryName: select,
    sold,
    products: prods,
    refreshLabel: 'Refresh at ' + jamWib
  });

  const reply_markup = global.use_reply_keyboard ? {
    keyboard: replyKeyboard.length ? replyKeyboard : [[{ text: "↩️ Kembali" }]],
    resize_keyboard: true,
    is_persistent: true,
  } : {
    inline_keyboard: buttonProduct
  };

  await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), reply_markup);
};

handler.key = "refresh";

export default handler;