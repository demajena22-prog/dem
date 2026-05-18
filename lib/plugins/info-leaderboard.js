import { getLeaderboard, dbUser, dbBot, User } from "../lib/database.js";
import { generateLeaderboardCard } from "../lib/card-generator.js";

let handler = async ({ bot, chat_id, bot_id }) => {
  try {
    const limit = 10;
    const result = await getLeaderboard(bot_id, limit);

    let botResult = await dbBot(bot_id);
    let total_user = await User.countDocuments();
    let data_bot = botResult.success ? botResult.data : {};

    const totalPcs = data_bot.terjual || 0;
    const totalRevenue = data_bot.total_nominal_transaksi || 0;

    if (!result.success) {
      (await import('../lib/logger.js')).logger.error('Gagal mengambil data top user: ' + result.error);
      return bot.reply(
        `*Terjadi kesalahan saat mengambil data Top User ❗️*\n\`${result.error}\``
      );
    }

    const topUsers = result.data;
    const userIds = topUsers.map((u) => u.userId);
    const userDetailsMap = new Map();

    for (const userId of userIds) {
      const userResult = await dbUser(userId);
      if (userResult.success && userResult.data) {
        userDetailsMap.set(userId, {
          name: userResult.data.name,
          username: userResult.data.username,
        });
      } else {
        userDetailsMap.set(userId, {
          name: `User ID: ${userId}`,
          username: null,
        });
      }
    }

    let caption = `*Bot Info*\n`;
    caption += `└ *Terjual :* ${totalPcs} pcs\n`;
    caption += `└ *Total Transaksi :* ${rupiah(totalRevenue)}\n`;
    caption += `└ *Total Pengguna :* ${total_user}\n\n`;

    if (topUsers.length === 0) {
      caption += `Belum ada data transaksi yang tercatat di bot ini.`;
    } else {
      let num = 1;
      for (let user of topUsers) {
        const details = userDetailsMap.get(user.userId);
        const displayName = details.name;
        const displayUsername = details.username ? `@${details.username}` : "-";

        caption += `*${num++}. ${displayName} ( ${displayUsername} )*\n`;
        caption += `└ *Total Revenue:* ${rupiah(user.totalRevenue)}\n`;
        caption += `└ *Jumlah Transaksi:* ${user.totalTransactions}\n`;
        caption += `└ *Total Produk Dibeli:* ${user.totalPcs} pcs\n\n`;
      }
    }

    const cardBuf = await generateLeaderboardCard({
      from: chat_id,
      botTerjual: totalPcs,
      botRevenue: rupiah(totalRevenue),
      totalUsers: total_user,
      users: topUsers.map(u => {
        const d = userDetailsMap.get(u.userId);
        return {
          name: d.name,
          revenue: rupiah(u.totalRevenue),
          trx: u.totalTransactions,
          pcs: u.totalPcs
        };
      })
    });

    await bot.sendPhoto(chat_id, cardBuf, {
      caption: esc(caption),
      parse_mode: "MarkdownV2",
      file_name: 'card.png',
      contentType: 'image/png',
    });
  } catch (e) {
    (await import('../lib/logger.js')).logger.error('Error leaderboard: ' + (e.message || e));
    console.debug(e.stack || e);
    bot.reply("Terjadi kesalahan sistem saat memuat Leaderboard.");
  }
};

handler.command = ["leaderboard", "topuser"];

export default handler;
