import { getProductDetails, getCategory } from "../lib/database.js";
import { generateInputQtyCard, editWithCard } from "../lib/card-generator.js";

let handler = async ({ bot, chat_id, message_id, from, data, bot_id }) => {
    global.onInputCart = global.onInputCart || {};

    let product_id = data.data.split(' ')[1];
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

    let stock = product.data.stock; 
    
    if (stock < 1) {
        await bot.answerCallbackQuery(data.id, {
            text: `Stok produk ini sedang kosong ❗️`,
            show_alert: true,
        });
        return;
    }

    let caption =
        `*📜 JUMLAH PESANAN*\n\n` +
        `*— Produk:* ${result}\n` +
        `*— Variasi:* ${product.data.name}\n` +
        `*— Harga Satuan:* Rp${product.data.price.toLocaleString('id-ID')}\n` +
        `*— Stok Tersedia:* ${stock}`;

    const cardBuf = await generateInputQtyCard({
        from,
        productName: result,
        variant: product.data.name,
        harga: 'Rp' + product.data.price.toLocaleString('id-ID'),
        stok: String(stock),
        storeName: global.store_name
    });

    let message1 = await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), {
        inline_keyboard: [
            [{ text: '« Back to Order', callback_data: `addcart ${product.data.productId}`, style: "danger" }]
        ]
    });

    let message2 = await bot.sendMessage(chat_id, esc(`*Ketik jumlah pembelian yang kamu inginkan disini :*`), {
        parse_mode: 'MarkdownV2',
        reply_markup: {
            force_reply: true
        }
    })

    global.onInputCart[from] = {
        status: 'input_jumlah',
        from,
        product_id: product.data.productId,
        stock,
        message1: message1.message_id, 
        message2: message2.message_id 
    };
};

handler.key = 'inputcart';

export default handler;