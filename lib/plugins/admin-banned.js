import { banUser, unbanUser, dbUser } from "../lib/database.js";

let handler = async ({ bot, chat_id, text, command, isAdmin }) => {
  if (!isAdmin) return bot.sendMessage(chat_id, esc(global.mess.admin || global.mess.owner), { parse_mode: "MarkdownV2" });

  if (!text) {
    return bot.sendMessage(
      chat_id,
      esc(
        `*Format Penggunaan ❗️*\n\n` +
        `/ban _user_id_\n` +
        `/unban _user_id_`
      ),
      { parse_mode: "MarkdownV2" }
    );
  }

  let targetId = text.trim();

  if (isNaN(targetId)) {
    return bot.sendMessage(chat_id, esc("ID User harus berupa angka."), { parse_mode: "MarkdownV2" });
  }

  targetId = parseInt(targetId, 10);

  let userCheck = await dbUser(targetId);
  if (!userCheck.success || !userCheck.data) {
    return bot.sendMessage(chat_id, esc("User tidak ditemukan di database."), { parse_mode: "MarkdownV2" });
  }

  if (command === "ban") {
    let res = await banUser(targetId);
    if (res.success) {
      await bot.sendMessage(
        chat_id,
        esc(`✅ Berhasil BANNED user dengan ID: ${targetId}`),
        { parse_mode: "MarkdownV2" }
      );
      try {
        await bot.sendMessage(targetId, esc("🚫 Akun Anda telah di-banned oleh Admin."), { parse_mode: "MarkdownV2" });
      } catch (e) {}
    } else {
      await bot.sendMessage(
        chat_id,
        esc(`❌ Gagal banned user: ${res.error}`),
        { parse_mode: "MarkdownV2" }
      );
    }
  } else if (command === "unban") {
    let res = await unbanUser(targetId);
    if (res.success) {
      await bot.sendMessage(
        chat_id,
        esc(`✅ Berhasil UNBANNED user dengan ID: ${targetId}`),
        { parse_mode: "MarkdownV2" }
      );
      try {
        await bot.sendMessage(targetId, esc("✅ Akun Anda telah di-unbanned. Silahkan gunakan bot kembali."), { parse_mode: "MarkdownV2" });
      } catch (e) {}
    } else {
      await bot.sendMessage(
        chat_id,
        esc(`❌ Gagal unban user: ${res.error}`),
        { parse_mode: "MarkdownV2" }
      );
    }
  }
};

handler.command = ["ban", "unban"];
handler.admin = true;

export default handler;
