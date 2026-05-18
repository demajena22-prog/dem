import { generateCaraOrderCard } from '../lib/card-generator.js';
import buttonStyles from '../styles/index.js';

const btnStyles = buttonStyles.telegram;

export default async function ({ bot, chat_id, body, from }) {
  if (body.toLowerCase() == "cara order ❓" || body.slice(1) == "help") {
    let caption = `*Cara Melakukan Pembelian Pada Bot*

1. Cari produk yang ingin dibeli pada *List Produk.*
2. Pilih varian yang ingin kamu beli.
3. Tentukan jumlah pembelian dengan tombol *+/-* atau ketik manual.
4. Pilih metode pembayaran yang ingin kamu gunakan
5. Jika saldo kamu tidak cukup, silahkan gunakan metode pembayaran menggunakan *Qris.*
6. Scan *Qris* yang dikirim oleh Bot.
7. Produk akan diberikan apabila pembayaran sukses.

Silakan hubungi kami jika Anda memiliki pertanyaan lebih lanjut.`;
    let inline_keyboard = [
      [btnStyles.primary("List Product", "listproduk", true)],
      [btnStyles.urlButton("success", "💬 Hubungi Kami", `https://t.me/` + global.username_owner)],
    ];
    const img = await generateCaraOrderCard({ from, storeName: global.store_name });

    await bot.sendPhoto(chat_id, img, {
      caption: esc(caption),
      file_name: 'card.png',
      contentType: 'image/png',
      reply_markup: {
        inline_keyboard: inline_keyboard,
      },
      parse_mode: "MarkdownV2",
    });
  }
}
