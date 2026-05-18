import { safeDeleteMessage } from "../lib/myfunc.js";

let handler = async ({ bot, chat_id, from, data, message_id, pushname, username, bot_id }) => {
  await bot.answerCallbackQuery(data.id, {
    text: "✅ Fitur wajib join sudah dinonaktifkan.",
    show_alert: false,
  });

  await safeDeleteMessage(bot, chat_id, message_id);

  // Langsung trigger /start
  if (global.plugins && global.plugins['start']) {
    await global.plugins['start']({
      m: { from: { id: from }, chat: { id: chat_id, type: 'private' } },
      bot, from, chat_id, pushname, username, bot_id,
      isOwner: global.owner.includes(from),
      isAdmin: false,
      body: '/start', text: '', args: [],
      command: 'start', message_id,
      bot_name: '', bot_username: '',
    });
  }
};

handler.key = "cek_join";
export default handler;
