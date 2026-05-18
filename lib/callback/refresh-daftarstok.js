import { getProductList } from "../lib/database.js";
import moment from "moment-timezone";
import { generateStokCard, editWithCard } from "../lib/card-generator.js";

let handler = async ({ bot, chat_id, message_id, bot_id, data }) => {
  // Ambil halaman dari callback data (format: checkstok <page>)
  let args = data.data.split(" ");
  let page = args[1] ? parseInt(args[1]) : 1;
  let limit = 20; // Batas produk per halaman untuk mencegah error caption terlalu panjang

  let list = await getProductList(bot_id);
  if (!list.success) {
    return bot.answerCallbackQuery(data.id, { text: `Error: ${list.error}`, show_alert: true });
  }

  let products = list.data;
  
  // Sorting produk berdasarkan nama
  products.sort((a, b) => a.name.localeCompare(b.name));

  // Logika Pagination
  let totalPages = Math.ceil(products.length / limit);
  if (products.length === 0) totalPages = 1;
  
  // Validasi halaman agar tidak keluar batas
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;

  let startIndex = (page - 1) * limit;
  let endIndex = Math.min(startIndex + limit, products.length);
  let currentProducts = products.slice(startIndex, endIndex);

  let date = moment().tz("Asia/Jakarta").locale("id").format("dddd, DD MMMM YYYY HH:mm:ss");

  let caption = `📦 STOCK PRODUCTS (Page ${page}/${totalPages})\n${date}\n\n`;

  if (products.length === 0) {
    caption += "_Belum ada produk yang tersedia._";
  } else {
    for (let p of currentProducts) {
      let icon = p.stock > 0 ? "✅" : "❌";
      caption += `${icon} ${p.name} - x${p.stock}\n`;
    }
  }

  // Membuat tombol navigasi
  let keyboard = [];
  let navRow = [];

  if (page > 1) {
    navRow.push({ text: "⬅️ Prev", callback_data: `checkstok ${page - 1}`, style: "primary" });
  }

  navRow.push({ text: "🔄 Refresh", callback_data: `checkstok ${page}`, style: "primary" });

  if (page < totalPages) {
    navRow.push({ text: "Next ➡️", callback_data: `checkstok ${page + 1}`, style: "primary" });
  }

  keyboard.push(navRow);
  keyboard.push([{ text: "↩️ Kembali ke Menu", callback_data: "menulain", style: "danger" }]);

  try {
    const cardBuf = await generateStokCard({
      from: chat_id,
      storeName: global.store_name,
      date,
      products: currentProducts.map(p => ({ name: p.name, stock: p.stock })),
      page,
      totalPages
    });

    await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), {
      inline_keyboard: keyboard,
    });
  } catch (e) {
    if (!e.message?.includes("message is not modified")) {
        console.error(e);
    } else {
        bot.answerCallbackQuery(data.id, { text: "Data sudah paling update!", show_alert: false });
    }
  }
};

handler.key = "checkstok";

export default handler;