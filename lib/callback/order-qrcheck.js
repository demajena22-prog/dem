import fs from "fs";
import {
  takeProductAccount,
  addBotTransaction,
  addUserTransaction,
  addProductSold,
  addTransactionHistory,
  getProductDetails,
  refundBalance,
  ProductStock,
} from "../lib/database.js";
import { processingLocks } from "../lib/locks.js";
import { markVoucherUsed } from "../lib/voucher.js";
import { generateNotifCard } from '../lib/card-generator.js';
import { safeDeleteMessage } from "../lib/myfunc.js";

async function notifyCallback(bot, chat_id, callbackId, text, options = {}) {
  let answered = false;
  if (callbackId) {
    try {
      await bot.answerCallbackQuery(callbackId, {
        text,
        show_alert: options.show_alert ?? true,
      });
      answered = true;
    } catch (e) { }
  }
  if (!answered && options.fallbackMessage !== false) {
    await bot.sendMessage(chat_id, text).catch(() => {});
  }
}

async function withTimeout(fn, ms, timeoutMessage) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function cekTransaksiWithRetry(nominal, ref_id, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(
        () => cekTransaksi(nominal, ref_id),
        15000,
        "Cek pembayaran timeout"
      );
    } catch (e) {
      const isRetryable = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timeout|socket hang up/i.test(e.message);
      if (!isRetryable || attempt === maxRetries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return false;
}

var cekTransaksi;
if (global.paymentgateway.midtrans) {
  cekTransaksi = (await import("../lib/midtrans.js")).cekTransaksi;
} else if (global.paymentgateway.pakasir) {
  cekTransaksi = (await import("../lib/pakasir.js")).cekTransaksi;
} else if (global.paymentgateway.cashify) {
  cekTransaksi = (await import("../lib/cashify.js")).cekTransaksi;
} else if (global.paymentgateway.binancepay) {
  cekTransaksi = (await import("../lib/binancepay.js")).cekTransaksi;
} else {
  cekTransaksi = null;
}

let handler = async ({ bot, chat_id, from, bot_id, data, username, message_id }) => {
  console.log('[CEKORDER] Handler dipanggil dari', from, '| data:', data?.data);

  let parts = data.data.split(" ");
  let nominal = parts[1];
  let ref_id_qris = parts[2];
  let product_id = parts[3];
  let jumlah_pesanan = parseInt(parts[4]);
  let voucher_code = parts[5] || null;

  const lockKey = `${from}:${product_id}:${ref_id_qris}`;
  let locked = false;
  let msgCek = null;
  let orderDelivered = false;
  let stockTaken = false;
  let reffId;

  try {
    reffId = ref_id_qris || global.createReffIdd();

    if (!cekTransaksi) {
      console.log('[CEKORDER] Payment gateway belum dikonfigurasi');
      return notifyCallback(bot, chat_id, data.id, "Payment gateway belum dikonfigurasi.");
    }

    let isValid = true;
    try {
      const { isValidProductId, isValidQuantity } = await import('../lib/validate.js');
      if (!isValidProductId(product_id) || !isValidQuantity(jumlah_pesanan)) {
        isValid = false;
      }
    } catch (valErr) {
      console.log('[CEKORDER] validate.js import error (dilewati):', valErr.message);
    }

    if (!isValid) {
      console.log('[CEKORDER] Data pesanan tidak valid:', product_id, jumlah_pesanan);
      return notifyCallback(bot, chat_id, data.id, "Data pesanan tidak valid.");
    }

    locked = processingLocks.lock(lockKey, 60000);
    if (!locked) {
      console.log('[CEKORDER] Lock gagal, sedang diproses:', lockKey);
      return notifyCallback(bot, chat_id, data.id, "Permintaan sedang diproses, mohon tunggu.", { show_alert: false, fallbackMessage: false });
    }

    console.log('[CEKORDER] Lock berhasil, mulai cek pembayaran...');
    await notifyCallback(bot, chat_id, data.id, "Sedang mengecek pembayaran, mohon tunggu...", { show_alert: false, fallbackMessage: false });
    msgCek = await bot.sendMessage(chat_id, "⏳ Sedang mengecek pembayaran QRIS, mohon tunggu...", { skip_keyboard: true }).catch((e) => {
      console.log('[CEKORDER] Gagal kirim pesan cek:', e.message);
      return null;
    });
    console.log('[CEKORDER] Pesan cek terkirim, msgCek:', msgCek?.message_id);

    let lunas = false;
    let nominalInt = parseInt(nominal);

    if (nominalInt === 0) {
      console.log('[CEKORDER] Nominal 0, skip cek PG');
      lunas = true;
    } else {
      try {
        console.log('[CEKORDER] Mulai cekTransaksi nominal:', nominal, 'ref:', ref_id_qris);
        lunas = await cekTransaksiWithRetry(nominal, ref_id_qris);
        console.log('[CEKORDER] Hasil cekTransaksi:', lunas);
      } catch (pgErr) {
        console.error('[CEKORDER] Payment gateway error:', pgErr.message, pgErr.stack);
        await safeDeleteMessage(bot, chat_id, msgCek?.message_id);
        await bot.sendMessage(chat_id, "⚠️ Gagal menghubungi payment gateway. Silakan coba klik Sudah Bayar lagi dalam beberapa detik.").catch(() => {});
        return;
      }
    }

    if (!lunas) {
      console.log('[CEKORDER] Pembayaran belum lunas');
      await safeDeleteMessage(bot, chat_id, msgCek?.message_id);
      await bot.sendMessage(chat_id, "Pembayaran belum terdeteksi ❗️\nSilahkan selesaikan pembayaran atau tunggu 30 detik terlebih dahulu.", { skip_keyboard: true }).catch(() => {});
      return;
    }

    console.log('[CEKORDER] Pembayaran LUNAS, mulai proses order...');

    if (global.orderPaymentContext) global.orderPaymentContext.delete(from);

    await safeDeleteMessage(bot, chat_id, message_id);
    await safeDeleteMessage(bot, chat_id, msgCek?.message_id);
    msgCek = null;
    let msgProses = await bot.sendMessage(chat_id, esc('_Pembayaran diterima, sedang memproses pesanan Anda..._'), { parse_mode: 'MarkdownV2' });

    console.log('[CEKORDER] getProductDetails bot_id:', bot_id, 'product_id:', product_id);
    let productDetails = await getProductDetails(bot_id, product_id);
    let productData = productDetails?.data;

    if (!productData) {
      console.log('[CEKORDER] productData null/undefined! productDetails:', JSON.stringify(productDetails));
      await safeDeleteMessage(bot, chat_id, msgProses?.message_id);
      await bot.sendMessage(chat_id, "⚠️ Data produk tidak ditemukan. Hubungi admin dengan Reff ID: " + reffId).catch(() => {});
      return;
    }
    console.log('[CEKORDER] Product ditemukan:', productData.name);

    let accountsResult = await takeProductAccount(
      bot_id,
      product_id,
      jumlah_pesanan,
      reffId
    );

    if (!accountsResult.success) {
      await safeDeleteMessage(bot, chat_id, msgProses?.message_id);
      await bot.sendMessage(chat_id, "Gagal mengambil stok, hubungi owner. Reff ID: " + reffId);
      return;
    }

    stockTaken = true;
    const takenAccounts = accountsResult.data;

    if (voucher_code) {
      try {
        const markResult = await markVoucherUsed(voucher_code, from);
        if (!markResult.success) {
          (await import('../lib/logger.js')).logger.warn(`[VOUCHER ERROR] ${markResult.error}`);
        }
      } catch (vErr) {
        (await import('../lib/logger.js')).logger.warn(`[VOUCHER ERROR] ${vErr.message}`);
      }
    }

    await addTransactionHistory(
      from,
      bot_id,
      product_id,
      productData.name,
      jumlah_pesanan,
      productData.price,
      "completed",
      "qris",
      productData.snk || "",
      reffId
    );

    await addUserTransaction(from, 1, jumlah_pesanan, nominalInt);
    await addBotTransaction(bot_id, 1, nominalInt);
    await addProductSold(bot_id, product_id, jumlah_pesanan);

    let dataAkun = "";
    takenAccounts.forEach((acc, index) => { dataAkun += `${index + 1}. ${acc}\n`; });

    let filePath = "./src/transaksi/terkirim/" + fileName(from) + ".txt";

    if (!fs.existsSync("./src/transaksi/terkirim")) {
      fs.mkdirSync("./src/transaksi/terkirim", { recursive: true });
    }

    fs.writeFileSync(filePath, dataAkun);

    let diskonTeks = voucher_code ? `\n— Diskon Voucher: Ya (${voucher_code})` : '';

    let caption = `*📜 Pembelian Berhasil*
_Terima kasih telah melakukan pembelian pada store kami._

*Informasi Pembelian:*
— Produk: ${productData.name}
— Harga Satuan: ${rupiah(productData.price)}
— Jumlah Pesanan: ${jumlah_pesanan}
— Total Pembayaran: ${rupiah(nominalInt)}${diskonTeks}
— Metode Pembayaran: *QRIS*
— Reff ID: \`${reffId}\`\n`;

    let sticker = global.sticker_id && global.sticker_id.terimakasih != "xxx"
      ? global.sticker_id.terimakasih
      : "./src/media/sticker/terimakasih.webp";

    await safeDeleteMessage(bot, chat_id, msgProses?.message_id);

    try {
      await bot.sendSticker(chat_id, sticker, { file_name: "terimakasih.webp", contentType: "image/webp" });
    } catch (stickerErr) {
      (await import('../lib/logger.js')).logger.warn('Gagal mengirim sticker: ' + (stickerErr.message || stickerErr));
    }

    await bot.sendDocument(chat_id, filePath, {
      caption: esc(caption),
      parse_mode: "MarkdownV2",
      file_name: "akun.txt",
    });

    orderDelivered = true;

    if (productData.snk && productData.snk !== "") {
      try {
        await bot.sendMessage(chat_id, esc(`📋 *Syarat & Ketentuan:*\n\n${productData.snk}`), { parse_mode: "MarkdownV2" });
      } catch (snkErr) {
        (await import('../lib/logger.js')).logger.warn('Gagal mengirim SNK: ' + (snkErr.message || snkErr));
      }
    }

    try {
      const notifCard = await generateNotifCard({
        bot, from, username, pushname: username,
        productName: productData.name,
        jumlah: jumlah_pesanan,
        hargaSatuan: rupiah(productData.price),
        totalBayar: rupiah(nominalInt),
        metode: 'QRIS',
        reffId,
        voucher: voucher_code,
        storeName: global.store_name
      });

      const ownerTarget = global.channel_id_owner.startsWith('@') || global.channel_id_owner.startsWith('-')
        ? global.channel_id_owner
        : `@${global.channel_id_owner}`;
      await bot.sendPhoto(ownerTarget, notifCard, {
        file_name: 'notif.png',
        contentType: 'image/png',
      });
    } catch (notifErr) {
      (await import('../lib/logger.js')).logger.warn('Gagal mengirim notifikasi owner: ' + (notifErr.stack || notifErr.message || notifErr));
    }

  } catch (e) {
    console.error('[CEKORDER] FATAL ERROR:', e.message, e.stack);
    try { (await import('../lib/logger.js')).logger.error('Order QR check failed: ' + (e.message || e)); } catch (_) {}
    await safeDeleteMessage(bot, chat_id, msgCek?.message_id);

    if (orderDelivered) {
      await bot.sendMessage(chat_id, 'Pesanan berhasil dikirim, tetapi ada proses tambahan yang gagal.').catch(() => {});
      return;
    }

    if (stockTaken) {
      try {
        await ProductStock.updateMany({ trxRefId: reffId }, { $set: { isSold: false, trxRefId: null } });
      } catch (cleanupErr) {
        (await import('../lib/logger.js')).logger.error("Cleanup error after failure: " + (cleanupErr.message || cleanupErr));
      }
    }

    await bot.sendMessage(chat_id, "❌ Terjadi kesalahan sistem saat memproses pesanan. Silakan coba lagi.").catch(() => {});
    await notifyCallback(bot, chat_id, data.id, "Terjadi kesalahan sistem, silakan coba lagi.");
  } finally {
    console.log('[CEKORDER] Selesai. delivered:', orderDelivered, 'stockTaken:', stockTaken, 'locked:', locked);
    if (locked) processingLocks.unlock(lockKey);
  }
};

handler.key = "cekorder";
export default handler;

function fileName(user_id) {
  return `${user_id}-${Date.now()}`;
}
