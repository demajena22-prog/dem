import { getTelegramUsers } from "../lib/database.js";
import t from '../lib/datetime.js';

let handler = async ({
  bot,
  bot_id,
  chat_id,
  from,
  text,
  command,
  message_id,
}) => {
  let time = await t();
  try {
    let users = await getTelegramUsers();
    if (!text || !text.trim()) {
      return bot.sendMessage(chat_id, esc(`*Format Broadcast 📢*\n/${command} _pesan broadcast_\n\nBroadcast akan dikirim ke *${users.length} Pengguna*`), {
        parse_mode: "MarkdownV2",
        clean_chat: false,
      });
    }

    const startMsg = await bot.sendMessage(chat_id, esc(
      `*Memulai Broadcast...*\n` +
      `Target: ${users.length} pengguna\n` +
      `Estimasi Waktu: ${Math.ceil((users.length * 1.5) / 60)} menit`
    ), {
      parse_mode: "MarkdownV2",
      clean_chat: false,
    });

    let capt = `*📢 PESAN BROADCAST*\n\n`;
    capt += `*Selamat ${time.salam}*\n\n${text}\n\n━━━━━━━━━━━━━━━━━\nTerima kasih telah menggunakan layanan kami.`;

    let success = 0;
    let failed = 0;
    let blocked = 0;

    for (let user of users) {
      try {
        await bot.sendMessage(user.userId, esc(capt), {
          parse_mode: "MarkdownV2",
          skip_keyboard: true,
          clean_chat: false,
        });
        success++;
      } catch (e) {
        const errMsg = e?.message || e?.response?.body?.description || "";
        if (errMsg.includes("blocked") || errMsg.includes("Forbidden") || errMsg.includes("deactivated")) {
          blocked++;
        } else {
          failed++;
          console.log(`Gagal Broadcast ke ${user.userId}: ${errMsg}`);
        }
      }
      await sleep(1500);
    }

    let report = `*📢 Laporan Broadcast Selesai*\n\n`;
    report += `✅ Sukses: ${success}\n`;
    report += `🚫 Diblokir User: ${blocked}\n`;
    report += `❌ Gagal: ${failed}\n`;
    report += `📊 Total Target: ${users.length}`;

    await bot.sendMessage(chat_id, esc(report), {
      parse_mode: "MarkdownV2",
      clean_chat: false,
    });
  } catch (e) {
    await bot.sendMessage(chat_id, esc(`*Error pada fitur broadcast ❗️*\n\n${e.message || e}`), {
      parse_mode: "MarkdownV2",
      clean_chat: false,
    });
    console.error("[broadcast] Error:", e);
  }
};

handler.command = ["broadcast", "bc"];
handler.admin = true;

export default handler;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
