import { createDeposit, safeDeleteMessage } from "../lib/myfunc.js";

export default async function ({ bot, from, chat_id, body }) {
  global.onCustomDeposit = global.onCustomDeposit || {};
  if (from in global.onCustomDeposit) {
    const msg = global.onCustomDeposit[from];
    const nominalText = String(body || "").replace(/\D/g, "");
    const nominal = Number(nominalText);

    if (!nominalText || !Number.isFinite(nominal) || !Number.isInteger(nominal)) {
      await safeDeleteMessage(bot, msg.chat_id, msg.message_id);
      bot.sendMessage(chat_id, `Nominal deposit hanya berupa angka!`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Ketik Ulang", callback_data: "customdeposit", style: "primary" }],
          ],
        },
      });
      delete global.onCustomDeposit[from];
      return;
    } else {
      if (nominal < 1000) {
        await safeDeleteMessage(bot, msg.chat_id, msg.message_id);
        bot.sendMessage(chat_id, esc(`Minimal deposit adalah *Rp 1.000*`), {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [{ text: "Ketik Ulang", callback_data: "customdeposit", style: "primary" }],
            ],
          },
        });
        delete global.onCustomDeposit[from];
        return;
      }
      if (nominal > 10000000) {
        await safeDeleteMessage(bot, msg.chat_id, msg.message_id);
        bot.sendMessage(chat_id, esc(`*Maksimal deposit adalah Rp 10.000.000*`), {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [{ text: "Ketik Ulang", callback_data: "customdeposit", style: "primary" }],
            ],
          },
        });
        delete global.onCustomDeposit[from];
        return;
      }
      
      await safeDeleteMessage(bot, msg.chat_id, msg.message_id);
      delete global.onCustomDeposit[from];
      let ref_id = global.createReffIdd();
      const payableAmount = nominal + Math.floor(Math.random() * 200) + 1;
      await createDeposit(bot, chat_id || from, payableAmount, ref_id, nominal);
    }
  }
}




