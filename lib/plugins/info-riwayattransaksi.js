import { getUserTransactionHistory } from "../lib/database.js";

const ITEMS_PER_PAGE = 5;

export default async function ({ bot, chat_id, body, from }) {
  if (body.slice(3).toLowerCase() === "riwayat transaksi" || body.toLowerCase() === "riwayat transaksi") {
    try {
      let dataTrx = await getUserTransactionHistory(from, ITEMS_PER_PAGE, 0);
      if (!dataTrx.success) {
        return bot.sendMessage(chat_id, `Terjadi kesalahan saat mengambil data ❗️`);
      } else if (!dataTrx.data || dataTrx.total === 0) {
        return bot.sendMessage(chat_id, `Kamu belum memiliki riwayat transaksi.`);
      }

      const transactions = dataTrx.data;
      const totalItems = dataTrx.total;
      const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
      const page = 1;

      let caption = `*🔖 RIWAYAT TRANSAKSI*\n\n`;
      caption += `*Total:* ${totalItems} transaksi\n\n`;

      let num = 1;
      for (let item of transactions) {
        caption += `*${num++}. ${item.productName || 'Unknown'}*\n`;
        caption += `➜ ID : \`${item.reffId || '-'}\`\n`;
        caption += `➜ Harga : ${rupiah(item.price || 0)}\n`;
        caption += `➜ Jumlah : ${item.quantity || 1} pcs\n`;
        caption += `➜ Total : ${rupiah(item.totalAmount || 0)}\n`;
        caption += `➜ Tanggal : ${item.createdAt ? new Date(item.createdAt).toLocaleString("id-ID") : '-'}\n\n`;
      }

      caption += `_Halaman ${page} dari ${totalPages}_`;

      const inlineKeyboard = [];
      if (page < totalPages) {
        inlineKeyboard.push([
          {
            text: "Berikutnya ▶️",
            callback_data: `riwayattransaksi ${page + 1}`,
            style: "primary",
          },
        ]);
      }
      inlineKeyboard.push([{ text: "↩️ Kembali ke Menu", callback_data: "main_menu", style: "danger" }]);

      await bot.sendMessage(chat_id, esc(caption), {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      });
    } catch (e) {
      console.error("[riwayattransaksi plugin] Error:", e.message);
      bot.sendMessage(chat_id, "Terjadi kesalahan saat memuat riwayat transaksi.").catch(() => {});
    }
  }
}
