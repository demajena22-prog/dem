import { getProdukPopuler } from "../lib/database.js";
import { generatePopulerCard } from "../lib/card-generator.js";

export default async function ({
  bot,
  chat_id,
  pushname,
  bot_id,
  body,
}) {
  if (body.startsWith("Produk Populer")) {
    let from = chat_id;
    let data = await getProdukPopuler(bot_id, 10);
    if (!data.success) {
      console.log("Gagal mengambil data produk populer:", data.error);
      await bot.sendMessage(
        chat_id,
        `*Terjadi kesalahan saat mengambil data ❗️*`
      );
      return;
    } else {
      data = data.data;
    }
    let caption = `*Halo kak ${pushname}* 👋🏻
Berikut adalah *10* produk paling populer berdasarkan jumlah penjualan.\n\n`;
    let num = 1;
    for (let item of data) {
      caption += `*${num++}. ${item.productName}*\n*└ ID :* \`${
        item._id
      }\`\n*└ Terjual :* ${item.totalSold} pcs\n*└ Transaksi :* ${rupiah(
        item.totalRevenue
      )}\n\n`;
    }
    const cardBuf = await generatePopulerCard({
      from,
      storeName: global.store_name,
      items: data.map(it => ({
        name: it.productName, sold: it.totalSold, revenue: rupiah(it.totalRevenue)
      }))
    });

    await bot.sendPhoto(chat_id, cardBuf, {
      caption: esc(caption),
      parse_mode: "MarkdownV2",
      file_name: 'card.png',
      contentType: 'image/png',
      reply_markup: {
        inline_keyboard: [
          [{ text: "Daftar Produk", callback_data: "listproduk", style: "primary" }],
        ],
      },
    });
  }
}
