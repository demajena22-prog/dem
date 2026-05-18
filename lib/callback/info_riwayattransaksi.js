import { getUserTransactionHistory, dbUser } from "../lib/database.js";
import { generateRiwayatCard, editWithCard } from "../lib/card-generator.js";

const ITEMS_PER_PAGE = 5;

let handler = async ({ bot, chat_id, from, data, message_id }) => {
  try {
    let page = 1;
    const args = data.data.split(" ");
    if (args[1]) {
      page = Math.max(1, parseInt(args[1]) || 1);
    }

    const skip = (page - 1) * ITEMS_PER_PAGE;
    let dataTrx = await getUserTransactionHistory(from, ITEMS_PER_PAGE, skip);

    if (!dataTrx.success) {
      return bot.answerCallbackQuery(data.id, { text: `Error: ${dataTrx.error}`, show_alert: true });
    } else if (!dataTrx.data || dataTrx.total === 0) {
      return bot.answerCallbackQuery(data.id, { text: "Kamu belum memiliki riwayat transaksi.", show_alert: true });
    }

    const transactions = dataTrx.data;
    const totalItems = dataTrx.total;
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    if (page > totalPages) page = totalPages;

    let caption = `*🔖 RIWAYAT TRANSAKSI*\n\n`;
    caption += `*Total:* ${totalItems} transaksi\n\n`;

    let num = (page - 1) * ITEMS_PER_PAGE + 1;
    for (let item of transactions) {
      caption += `*${num++}. ${item.productName || 'Unknown'}*\n`;
      caption += `➜ ID : \`${item.reffId || '-'}\`\n`;
      caption += `➜ Harga : ${rupiah(item.price || 0)}\n`;
      caption += `➜ Jumlah : ${item.quantity || 1} pcs\n`;
      caption += `➜ Total : ${rupiah(item.totalAmount || 0)}\n`;
      caption += `➜ Tanggal : ${item.createdAt ? new Date(item.createdAt).toLocaleString("id-ID") : '-'}\n\n`;
    }

    caption += `_Halaman ${page} dari ${totalPages}_`;

    let buttons = [];
    if (page > 1) {
      buttons.push({
        text: "◀️ Sebelumnya",
        callback_data: `riwayattransaksi ${page - 1}`,
        style: "primary",
      });
    }
    if (page < totalPages) {
      buttons.push({
        text: "Berikutnya ▶️",
        callback_data: `riwayattransaksi ${page + 1}`,
        style: "primary",
      });
    }

    let inlineKeyboard = [];
    if (buttons.length > 0) inlineKeyboard.push(buttons);
    inlineKeyboard.push([{ text: "↩️ Kembali ke Menu", callback_data: "main_menu", style: "danger" }]);

    try {
      const userData = await dbUser(from);
      const totalNominal = userData?.data?.total_nominal_transaksi || 0;
      const cardBuf = await generateRiwayatCard({
        from,
        totalTransaksi: rupiah(totalNominal),
        totalPcs: totalItems,
        transactions: transactions.map((item, i) => ({
          num: (page - 1) * ITEMS_PER_PAGE + i + 1,
          name: item.productName || 'Unknown',
          reffId: item.reffId || '-',
          total: rupiah(item.totalAmount || 0),
          qty: item.quantity || 1,
          date: item.createdAt ? new Date(item.createdAt).toLocaleDateString('id-ID') : '-'
        })),
        page,
        totalPages
      });

      await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), {
        inline_keyboard: inlineKeyboard,
      });
    } catch (cardErr) {
      // Fallback: kirim tanpa card kalau generate card gagal
      console.error("[riwayattransaksi] Card error:", cardErr.message);
      await bot.sendMessage(chat_id, esc(caption), {
        parse_mode: "MarkdownV2",
        reply_markup: { inline_keyboard: inlineKeyboard },
      });
    }
  } catch (e) {
    console.error("[riwayattransaksi] Error:", e.message, e.stack);
    if (data?.id) {
      bot.answerCallbackQuery(data.id, { text: "Terjadi kesalahan.", show_alert: true }).catch(() => {});
    }
  }
};

handler.key = "riwayattransaksi";

export default handler;
