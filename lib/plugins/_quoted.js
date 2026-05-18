let handler = async ({ bot, chat_id, m }) => {
  if (!m.reply_to_message) return await bot.reply("Reply pesannya");
  let data = m.reply_to_message;
  if (data.photo) {
    let capt = ``;
    let id = data.photo.slice(-1)
      capt +=
        `*File ID :* \`${id[0].file_id}\`\n` +
        `*Width :* \`${id[0].width}\`\n` +
        `*Height :* \`${id[0].height}\`\n` +
        `*File Size :* \`${id[0].file_size}\` bytes\n\n`;
    await bot.reply(capt);
  } else if (data.video) {
    let vid = data.video;
    let capt =
      `*File ID :* \`${vid.file_id}\`\n` +
      `*Width :* \`${vid.width}\`\n` +
      `*Height :* \`${vid.height}\`\n` +
      `*Duration :* \`${vid.duration}\` seconds\n` +
      `*File Size :* \`${vid.file_size}\` bytes\n`;
    await bot.reply(capt);
  } else if (data.document) {
    let doc = data.document;
    let capt =
      `*File ID :* \`${doc.file_id}\`\n` +
      `*File Name :* \`${doc.file_name}\`\n` +
      `*MIME Type :* \`${doc.mime_type}\`\n` +
      `*File Size :* \`${doc.file_size}\` bytes\n`;
    await bot.reply(capt);
  } else if (data.sticker) {
    let stk = data.sticker;
    let capt =
      `*Thumbnail*\n` +
      `*File ID :* \`${stk.thumbnail.file_id}\`\n` +
      `*Width :* \`${stk.thumbnail.width}\`\n` +
      `*Height :* \`${stk.thumbnail.height}\`\n` +
      `*File Size :* \`${stk.thumbnail.file_size}\` bytes\n\n` +
      `*Sticker*\n` +
      `*File ID :* \`${stk.file_id}\`\n` +
      `*Size :* ${stk.file_size} bytes\n`;
    await bot.reply(capt);
  } else {
    await bot.reply(
      "Pesan yang di reply tidak mengandung media foto, video, atau dokumen."
    );
  }
};

handler.command = ["q"];

export default handler;
