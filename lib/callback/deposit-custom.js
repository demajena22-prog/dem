import { safeDeleteMessage } from "../lib/myfunc.js";

let handler = async ({ bot, chat_id, from, data }) => {
  global.onCustomDeposit = global.onCustomDeposit || {};
  if (from in global.onCustomDeposit) {
    const oldMsg = global.onCustomDeposit[from];
    await safeDeleteMessage(bot, oldMsg.chat_id, oldMsg.message_id);
    delete global.onCustomDeposit[from];
  }
  let msg = await bot.sendMessage(
    chat_id,
    esc(`*Silahkan ketik nominal deposit yang kamu inginkan _(min. 1000)_ :*`),
    {
      parse_mode: "MarkdownV2",
      reply_markup: {
        force_reply: true,
      },
    }
  );
  global.onCustomDeposit[from] = {
    chat_id,
    message_id: msg.message_id,
  };
};

handler.key = "customdeposit";

export default handler;
