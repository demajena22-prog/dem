import '../config.js';
import time from '../lib/datetime.js';
import { getAdminStats, dbUser } from '../lib/database.js';
import { getDailyStats } from '../lib/daily_stats.js';
import { generateAdminCard } from '../lib/card-generator.js';

let handler = async ({ bot, chat_id, bot_id, bot_username, message_id, from, pushname, isGroup }) => {
    try {
        let userRes = await dbUser(from);
        if (!userRes.success || !userRes.data) {
            return bot.reply('Gagal memproses data pengguna.');
        }

        let statsRes = await getAdminStats(bot_id);
        let stats = statsRes.success ? statsRes.data : {
            totalUsers: 0,
            totalTransactions: 0,
            totalProducts: 0,
            totalRevenue: 0,
            totalProductsSold: 0
        };

        let dailyStats = getDailyStats();

        let image = await generateAdminCard({
            bot, from, pushname,
            botId: bot_id,
            botUsername: bot_username,
            tanggal: time.tanggal,
            jam: time.jam,
            maintenance: global.maintenance,
            dailyPcs: dailyStats.pcs,
            dailyRevenue: rupiah(dailyStats.revenue),
            totalSold: stats.totalProductsSold,
            totalRevenue: rupiah(stats.totalRevenue),
            totalUsers: stats.totalUsers,
            totalProducts: stats.totalProducts,
            storeName: global.store_name
        });

        let caption = `*Menu Admin :*
└ /addsaldo – Tambah Saldo User
└ /cutsaldo – Potong Saldo User
└ /listvcr – Daftar Voucher
└ /buatvcr – Buat Voucher Baru
└ /ban · /unban · /cektrx
└ /setbulk · /delbulk
`;

        const adminButton = isGroup
            ? [{ text: 'Kelola Bot 🛒', url: global.url_admin, style: "primary" }]
            : [{ text: 'Kelola Bot 🛒', web_app: { url: global.url_admin }, style: "primary" }];

        await bot.sendPhoto(chat_id, image, {
            caption: esc(caption),
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [adminButton]
            }
        });

    } catch (e) {
        console.error("Error menu admin:", e);
        bot.reply("Terjadi kesalahan saat memuat menu admin.");
    }
};

handler.command = ['admin'];
handler.admin = true;

export default handler;
