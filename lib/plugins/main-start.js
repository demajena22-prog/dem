import t from '../lib/datetime.js';
import { dbUser, dbBot, User } from '../lib/database.js';
import { generateStartCard } from '../lib/card-generator.js';
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

let handler = async ({ bot, pushname, chat_id, from, username, bot_id }) => {
    let time = await t()
    try {
        let userResult = await dbUser(from);
        let botResult = await dbBot(bot_id);

        let user = userResult.data;
        let data_bot = botResult.data;

        if (!user || !data_bot) return bot.reply('Gagal memproses perintah, silahkan hubungi owner.');

        let total_user = await User.countDocuments();

        const totalPcs = data_bot.terjual || 0;
        const totalRevenue = data_bot.total_nominal_transaksi || 0;

        let image = await generateStartCard({
            bot, from, pushname, username,
            balance: rupiah(user.balance),
            totalBeli: user.membeli,
            totalTransaksi: rupiah(user.total_nominal_transaksi),
            botTerjual: totalPcs,
            botRevenue: rupiah(totalRevenue),
            totalUsers: total_user,
            storeName: global.store_name,
            tanggal: time.tanggal,
            jam: time.jam
        });

        let caption = `*Sortcuts :*
/start – Mulai Bot
/stok – Cek Stok Produk
/info – Info Bot`

        const reply_markup = global.use_reply_keyboard ? {
            keyboard: mainKeyboard,
            resize_keyboard: true,
            is_persistent: false,
            one_time_keyboard: false,
            input_field_placeholder: 'Pilih fitur dari tombol keyboard',
        } : {
            inline_keyboard: mainInlineKeyboard,
        };

        await bot.sendPhoto(chat_id, image, {
            caption: esc(caption),
            file_name: 'card.png',
            contentType: 'image/png',
            parse_mode: 'MarkdownV2',
            reply_markup,
        })
    } catch (e) {
        console.error('[main-start] Error:', e.message || e);
    }
}

handler.command = ['start']

export default handler