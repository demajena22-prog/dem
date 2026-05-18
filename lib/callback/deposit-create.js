import { createDeposit, safeDeleteMessage } from "../lib/myfunc.js";

let handler = async ({ m, bot, data, bot_id, from, chat_id, message_id }) => {
  let nominal = Number(data.data.split(" ")[1]);
  try {
    if (!Number.isFinite(nominal) || !Number.isInteger(nominal) || nominal < 1000 || nominal > 10000000) {
      if (data.id) {
        return bot.answerCallbackQuery(data.id, {
          text: "Nominal top-up tidak valid.",
          show_alert: true,
        });
      }
      return bot.sendMessage(chat_id || from, esc("Nominal top-up tidak valid."), { parse_mode: "MarkdownV2" });
    }

    await safeDeleteMessage(bot, chat_id, message_id);
    let ref_id = createRefId();
    const payableAmount = nominal + (Math.floor(Math.random() * 200) + 1);
    await createDeposit(bot, from, payableAmount, ref_id, nominal)
  } catch (e) {
    console.error("Error in deposit-create:", e);
    await bot.sendMessage(chat_id || from, esc(global.mess.error), { parse_mode: "MarkdownV2" }).catch(() => {});
  }
};

handler.key = "deposit";

export default handler;

function createRefId() {
  return global.createReffIdd();
}