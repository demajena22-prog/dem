import fs from "fs";
import { safeDeleteMessage } from "../lib/myfunc.js";
import { dbUser, getDBData, getProductDetails } from "../lib/database.js";
import { processingLocks } from "../lib/locks.js";

var createQr;
if (global.paymentgateway.midtrans) {
  let midtrans = await import("../lib/midtrans.js");
  createQr = midtrans.createQr;
} else if (global.paymentgateway.pakasir) {
  let pakasir = await import("../lib/pakasir.js");
  createQr = pakasir.createQr;
} else if (global.paymentgateway.cashify) {
  let cashify = await import("../lib/cashify.js");
  createQr = cashify.createQr;
} else if (global.paymentgateway.binancepay) {
  let binancepay = await import("../lib/binancepay.js");
  createQr = binancepay.createQr;
}

let handler = async ({ bot, chat_id, from, bot_id, data, username, message_id }) => {
  const lockKey = `qris:${from}`;
  if (!processingLocks.lock(lockKey, 30000)) {
    return bot.answerCallbackQuery(data.id, {
      text: "QRIS sedang dibuat, mohon tunggu.",
      show_alert: false,
    });
  }

  try {
  if (!createQr) {
    return bot.answerCallbackQuery(data.id, {
      text: "Payment gateway belum dikonfigurasi.",
      show_alert: true,
    });
  }

  let parts = data.data.split(" ");
  let product_id = parts[1];
  let jumlah_pesanan = parseInt(parts[2]);
  let total_harga_input = parts[3] !== undefined ? parseInt(parts[3]) : NaN;
  let voucher_code = parts[4] || null;

  let user = await getDBData(dbUser, from);
  let productDetailsResult = await getProductDetails(bot_id, product_id);
  let productData = productDetailsResult.data;

  if (!user || !productData) {
    return bot.sendMessage(chat_id, "Gagal memproses, data tidak ditemukan.");
  }

  let total_harga;
  if (!isNaN(total_harga_input)) {
    total_harga = total_harga_input;
  } else {
    total_harga = productData.price * jumlah_pesanan;
  }

  const order_refid = "APPST" + Math.floor(100000000000 + Math.random() * 900000000000);
  const sourceMessageId = data.message?.message_id || message_id;

  if (total_harga === 0) {
    await safeDeleteMessage(bot, chat_id, sourceMessageId);
    let caption_free = `*Konfirmasi Pesanan (Gratis)*\n\n` +
    `Pesanan ini tidak dikenakan biaya karena penggunaan Voucher.\n\n` +
    `— Produk: *${productData.name}*\n` +
    `— Jumlah: *${jumlah_pesanan} pcs*\n` +
    `— Voucher: *${voucher_code}*\n\n` +
    `Silahkan klik tombol di bawah untuk memproses pesanan.`;

    await bot.sendMessage(chat_id, esc(caption_free), {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Proses Pesanan",
              callback_data: `cekorder 0 ${order_refid} ${product_id} ${jumlah_pesanan} ${voucher_code || ''}`,
              style: "success"
            }
          ],
          [{ text: "❌ Batalkan", callback_data: "order_cancel", style: "danger" }]
        ]
      }
    });
    return;
  }

  total_harga = total_harga + Math.floor(Math.random() * 200) + 1;

  let qris = await createQr(total_harga, order_refid);

  if (!qris) {
    return bot.sendMessage(chat_id, esc("*Gagal membuat QRIS* ❌\n\nSilakan coba lagi nanti atau hubungi admin."), {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [[{ text: "↩️ Kembali ke Menu", callback_data: "main_menu", style: "danger" }]]
      }
    });
  }

  await safeDeleteMessage(bot, chat_id, sourceMessageId);

  let caption_qris = `*Pembayaran QRIS ✅*\n\nSilahkan bayar senilai *${rupiah(total_harga)}*\n\n— Reff ID: \`${order_refid}\`\n— Produk: *${productData.name}*\n— Jumlah: *${jumlah_pesanan} pcs*`;
  
  if (voucher_code) {
    caption_qris += `\n— Voucher: *${voucher_code}*`;
  }

  const sentPayment = await bot.sendPhoto(chat_id, qris, {
    caption: esc(caption_qris),
    file_name: "menu.png",
    contentType: "image/jpeg",
    parse_mode: "MarkdownV2",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Sudah Bayar",
            callback_data: `cekorder ${total_harga} ${order_refid} ${product_id} ${jumlah_pesanan} ${voucher_code || ''}`,
            style: "success"
          }
        ],
        [{ text: "❌ Batalkan", callback_data: "order_cancel", style: "danger" }]
      ]
    }
  });

  if (!global.orderPaymentContext) global.orderPaymentContext = new Map();
  const paymentData = global.orderPaymentContext.get(from) || {};
  global.orderPaymentContext.set(from, {
    ...paymentData,
    paymentChatId: chat_id,
    paymentMessageId: sentPayment?.message_id,
    paymentRefId: order_refid,
    callbackData: `cekorder ${total_harga} ${order_refid} ${product_id} ${jumlah_pesanan} ${voucher_code || ''}`.trim(),
  });
  } finally {
    processingLocks.unlock(lockKey);
  }
};

handler.key = ["orderqr"];
export default handler;
