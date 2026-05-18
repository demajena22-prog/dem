import { getCategory, getProductDetails } from "../lib/database.js";
import { generateCategoryCard, editWithCard } from "../lib/card-generator.js";

let handler = async ({ bot, bot_id, chat_id, data, message_id, from }) => {
  let product_id = data.data.split(" ")[1];
  if (!product_id) return;

  let categoryData = await getCategory(bot_id);
  if (!categoryData.success) {
    return bot.sendMessage(chat_id, `*Terjadi Kesalahan ❗️*\n\`${categoryData.error}\``);
  }

  let nameCategory = cekCategory(product_id, categoryData);
  if (!nameCategory) return;

  let categories = categoryData.data || {};
  let productIds = categories[nameCategory];
  if (!productIds) return;

  let sold = 0;
  let productDetailsMap = {};

  for (let id of productIds) {
    let res = await getProductDetails(bot_id, id);
    if (res.success) {
      productDetailsMap[id] = res.data;
      sold += res.data.terjual || 0;
    }
  }

  let caption = "";
  caption += `╭ - - - - - - - - - - - - - - - - - - - - - - - ╮\n`;
  caption += `┊ *Produk :* ${nameCategory}\n`;
  caption += `┊ *Terjual :* ${sold}pcs\n`;
  caption += `╰ - - - - - - - - - - - - - - - - - - - - - - - ╯\n`;

  let buttonProduct = [];
  let replyKeyboard = [];
  const contextMap = new Map();
  for (let id of productIds) {
    let p = productDetailsMap[id];
    if (!p) continue;

    caption += `╭ - - - - - - - - - - - - - - - - - - - - - - -  ╮\n`;
    caption += `┊ \`${p.name.toUpperCase()}\`\n`;
    caption += `┊ Harga: *Rp${p.price.toLocaleString("id-ID")}* - *Stok :* ${p.stock}\n`;
    caption += `┊ ╰➤ Terjual: *${p.terjual}pcs*\n`;
    caption += `╰ - - - - - - - - - - - - - - - - - - - - - - - ╯\n`;

    buttonProduct.push([{ text: p.name, callback_data: `addcart ${p.productId}`, style: "success" }]);
    replyKeyboard.push([{ text: p.name, style: "success" }]);
    contextMap.set(p.name, `addcart ${p.productId}`);
  }

  buttonProduct.push([{ text: "↩️ Kembali", callback_data: "listproduk", style: "danger" }]);
  replyKeyboard.push([{ text: "↩️ Kembali", style: "danger" }]);
  contextMap.set("↩️ Kembali", "listproduk");
  global.productButtonContext?.set(from, contextMap);

  const prods = productIds.map(id => {
    let p = productDetailsMap[id];
    return p ? { name: p.name, price: 'Rp' + p.price.toLocaleString('id-ID'), stock: p.stock, sold: p.terjual || 0 } : null;
  }).filter(Boolean);

  const cardBuf = await generateCategoryCard({
    from: chat_id,
    categoryName: nameCategory,
    sold,
    products: prods
  });

  const reply_markup = global.use_reply_keyboard ? {
    keyboard: replyKeyboard.length ? replyKeyboard : [[{ text: "↩️ Kembali" }]],
    resize_keyboard: true,
    is_persistent: true,
  } : {
    inline_keyboard: buttonProduct,
  };

  await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), reply_markup);
};

handler.key = "selectproduct";

export default handler;

function cekCategory(valueToFind, response) {
  for (const [key, arr] of Object.entries(response.data)) {
    if (arr.includes(valueToFind)) return key;
  }
  return null;
}