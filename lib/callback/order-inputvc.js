import { getProductDetails, getCategory } from "../lib/database.js";
import { generateVoucherCard, editWithCard } from "../lib/card-generator.js";

let handler = async ({ bot, chat_id, message_id, from, data, bot_id }) => {
    global.onInputVoucher = global.onInputVoucher || {};

    const parts = data.data.split(' ');
    let product_id = parts[1];
    let jumlah_pesanan = parts[2];

    let product = await getProductDetails(bot_id, product_id);
    let category = await getCategory(bot_id);

    if (!product.success) {
        return bot.sendMessage(chat_id, `*Terjadi Kesalahan*\n${product.error}`);
    }
    if (!category.success) {
        return bot.sendMessage(chat_id, `*Terjadi Kesalahan*\n${category.error}`);
    }

    let res = category.data;
    let result = Object.keys(res).find(key => res[key].includes(product_id));

    let caption =
        `*🎫 INPUT VOUCHER*\n\n` +
        `*— Produk:* ${result}\n` +
        `*— Variasi:* ${product.data.name}\n` +
        `*— Harga Satuan:* Rp${product.data.price.toLocaleString('id-ID')}\n` +
        `*— Jumlah Pesanan:* ${jumlah_pesanan}`;

    const cardBuf = await generateVoucherCard({
        from,
        productName: result,
        variant: product.data.name,
        harga: 'Rp' + product.data.price.toLocaleString('id-ID'),
        jumlah: jumlah_pesanan,
        storeName: global.store_name
    });

    await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), {
        inline_keyboard: [
            [{ text: '« Back to Order', callback_data: `addcart ${product_id} ${jumlah_pesanan}`, style: "danger" }]
        ]
    });

    let message2 = await bot.sendMessage(chat_id, esc(`*Ketik kode voucher yang kamu miliki disini :*`), {
        parse_mode: 'MarkdownV2',
        reply_markup: {
            force_reply: true
        }
    });

    global.onInputVoucher[from] = {
        status: 'input_voucher',
        from,
        product_id: product_id,
        jumlah_pesanan: jumlah_pesanan,
        message_addcart_id: message_id,
        message_id: message2.message_id
    };
};

handler.key = 'inputvcr';

export default handler;