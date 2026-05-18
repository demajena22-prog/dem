import { dbUser } from "../lib/database.js";

export default async function ({
  bot,
  body,
  chat_id,
  from,
  command,
}) {
  try {
    if (body.slice(3).toLowerCase().startsWith("saldo: rp.") || command == "saldo") {
      let user = await dbUser(from);
      if (!user.success)
        return bot.reply(
          "Gagal mengambil data pengguna, silahkan coba lagi nanti."
        );
      let res = user.data;
      let caption = `*Detail saldo Anda di ${global.store_name}*

Saldo anda saat ini: *${rupiah(res.balance)}*

Mau isi saldo? Silahkan pilih nominal dibawah ini:`;
      bot.sendMessage(chat_id, esc(caption), {
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Rp. 10,000", callback_data: "deposit 10000", style: "success" },
              { text: "Rp. 25,000", callback_data: "deposit 25000", style: "success" },
            ],
            [
              { text: "Rp. 50,000", callback_data: "deposit 50000", style: "success" },
              { text: "Rp. 100,000", callback_data: "deposit 100000", style: "success" },
            ],
            [{ text: "Ketik Nominal Lain", callback_data: "customdeposit", style: "primary" }],
          ],
        },
      });
    }
  } catch (e) {
    console.log(e);
  }
}
