import t from '../lib/datetime.js';
import {
  dbUser,
  dbBot,
  User
} from "../lib/database.js";
import { generateStartCard, editWithCard } from '../lib/card-generator.js';
import buttonStyles from '../styles/index.js';

const mainKeyboard = [
  [{ text: 'List Produk 🛒', style: 'primary' }, { text: '💰 Saldo', style: 'primary' }],
  [{ text: '📂 Riwayat Transaksi', style: 'primary' }, { text: 'Produk Populer ✨', style: 'primary' }],
  [{ text: 'Menu Lain ⏩', style: 'primary' }],
];

const mainInlineKeyboard = buttonStyles.telegram.createMenuKeyboard([
  { text: "List Produk", icon: "🛒", callback: "listproduk" },
  { text: "Saldo", icon: "💰", callback: "ceksaldo" },
  { text: "Riwayat Transaksi", icon: "📂", callback: "riwayattransaksi" },
  { text: "Produk Populer", icon: "✨", callback: "produkpopuler" },
  { text: "Menu Lain", icon: "⏩", callback: "menulain" }
], 2);

let handler = async ({
  bot,
  pushname,
  chat_id,
  message_id,
  from,
  username,
  bot_id,
}) => {
  try {
    const nowTime = await t();
    let userResult = await dbUser(from);
    let botResult = await dbBot(bot_id);

    let user = userResult.data;
    let data_bot = botResult.data;

    const reply_markup = global.use_reply_keyboard ? {
      keyboard: mainKeyboard,
      resize_keyboard: true,
      is_persistent: false,
      one_time_keyboard: false,
      input_field_placeholder: 'Pilih fitur dari tombol keyboard',
    } : {
      inline_keyboard: mainInlineKeyboard,
    };

    if (!userResult.success || !user || !botResult.success || !data_bot) {
      return bot.sendMessage(chat_id || from, esc("⚠️ Gagal memuat menu utama. Silakan coba /start lagi."), {
        parse_mode: "MarkdownV2",
        reply_markup,
      });
    }

    let total_user = await User.countDocuments();

    const totalPcs = data_bot.terjual || 0;
    const totalRevenue = data_bot.total_nominal_transaksi || 0;

    const cardBuf = await generateStartCard({
      bot, from, pushname, username,
      balance: rupiah(user.balance),
      totalBeli: user.membeli,
      totalTransaksi: rupiah(user.total_nominal_transaksi),
      botTerjual: totalPcs,
      botRevenue: rupiah(totalRevenue),
      totalUsers: total_user,
      storeName: global.store_name,
      tanggal: nowTime.tanggal,
      jam: nowTime.jam
    });

    let caption = `*Sortcuts :*
/start – Mulai Bot
/stok – Cek Stok Produk
/info – Info Bot`;

    await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), reply_markup);
  } catch (e) {
    console.error("Error callback start/main menu:", e);
    if (chat_id || from) {
      await bot.sendMessage(chat_id || from, esc("⚠️ Terjadi kesalahan saat memuat menu utama. Silakan coba /start lagi."), {
        parse_mode: "MarkdownV2",
        reply_markup: { inline_keyboard: mainInlineKeyboard },
      }).catch(() => {});
    }
  }
};

handler.key = "start";

export default handler;
