import { generateInfoCard } from '../lib/card-generator.js';
import buttonStyles from '../styles/index.js';

const btnStyles = buttonStyles.telegram;

let handler = async ({ bot, chat_id, from }) => {
  let caption = `*🤖 Informasi BOT*

*Detail BOT:*
└ Owner: @${global.username_owner}
└ Channel: @${global.channel_id_owner}

*Informasi Developer:*
└ Developer: @rifalosid

*Sewa BOT:*
Ingin bot seperti ini? Hubungi developer kami!
Fitur:
- Sistem pembayaran otomatis
- Banyak metode pembayaran
- Panel admin canggih
- Statistik lengkap
- Sistem pengiriman otomatis
- Dan masih banyak lagi!

*Harga:* Rp35.000/bulan`;
  const image = await generateInfoCard({
    from,
    owner: global.username_owner,
    channel: global.channel_id_owner,
    developer: 'rifalosid',
    price: 'Rp35.000/bulan',
    storeName: global.store_name
  });

  await bot.sendPhoto(chat_id, image, {
    caption: esc(caption),
    parse_mode: "MarkdownV2",
    reply_markup: {
      inline_keyboard: [
        [
          btnStyles.urlButton("success", "💬 Contact Owner", `https://t.me/${global.username_owner}`),
          btnStyles.urlButton("primary", "📢 Channel", `https://t.me/${global.channel_id_owner}`),
        ],
        [
          btnStyles.urlButton("primary", "🧑‍💻 Developer", "https://t.me/rifalosid"),
          btnStyles.backButton("Kembali", "main_menu"),
        ],
      ],
    },
  });
};

handler.command = ["info", "bot"];

export default handler;
