import { getCategory, getCombinedCategoriesWithBrands, getProductList } from "../lib/database.js";
import moment from "moment-timezone";
import { generateCategoryCard, editWithCard } from "../lib/card-generator.js";

let handler = async ({ bot, from, chat_id, message_id, bot_id, data }) => {
  let index = parseInt(data.data.split(" ")[1]);
  if (isNaN(index)) return;

  let get = await getCombinedCategoriesWithBrands(bot_id);
  let products = await getProductList(bot_id);

  if (!get.success) {
    return bot.answerCallbackQuery(data.id, { text: `Error: ${get.error}`, show_alert: true });
  } else if (!products.success) {
    return bot.answerCallbackQuery(data.id, { text: `Error: ${products.error}`, show_alert: true });
  }

  let jamWib = moment().tz("Asia/Jakarta").format("HH.mm.ss") + " WIB";
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

  let select = keys[index - 1];
  let cekCategory = categories[select];

  if (!cekCategory) {
    return bot.answerCallbackQuery(data.id, { text: "Kategori tidak ditemukan", show_alert: true });
  }

  // Deteksi jika ini adalah brand Digiflazz (cek marker khusus)
  if (Array.isArray(cekCategory) && cekCategory.length > 0 && cekCategory[0].startsWith('__digiflazz_brand__')) {
    const brand = cekCategory[0].replace('__digiflazz_brand__', '');
    
    // Import handler untuk tampilkan produk
    const { default: brandProductHandler } = await import('./digiflazz-brand-products.js');
    
    return brandProductHandler({ bot, from, chat_id, message_id, bot_id, data, brand });
  }

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
      replyKeyboard.push([{ text: `${res.name}`, style: "success" }]);
      contextMap.set(res.name, `addcart ${res.productId}`);
    }
  }

  caption += `╰➤  Refresh at *${jamWib}*`;


  buttonProduct.push([
    { text: "🔄 Refresh", callback_data: `selcat ${index}`, style: "primary" },
    { text: "↩️ Kembali", callback_data: `listproduk`, style: "danger" }
  ]);
  replyKeyboard.push([{ text: "🔄 Refresh", style: "primary" }, { text: "↩️ Kembali", style: "danger" }]);
  contextMap.set("🔄 Refresh", `selcat ${index}`);
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
    inline_keyboard: buttonProduct,
  };

  await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), reply_markup);
};

handler.key = "selcat";

export default handler;
