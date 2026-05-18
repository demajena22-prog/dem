let handler = async ({ bot, chat_id }) => {
  bot.sendMessage(chat_id, `*ID :* \`${chat_id}\``, {
    parse_mode: "MarkdownV2",
  });
};

handler.owner = true;

handler.command = ["chatid", "chat_id", "idchat", "id_chat"];
export default handler;