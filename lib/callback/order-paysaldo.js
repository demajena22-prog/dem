import {
  dbBot,
  dbUser,
  User,
  getDBData,
  getProductDetails,
  editBalance,
  deductBalanceIfEnough,
  refundBalance,
  takeProductAccount,
  addBotTransaction,
  addUserTransaction,
  addProductSold,
  addTransactionHistory,
} from "../lib/database.js";
import { processingLocks } from "../lib/locks.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { markVoucherUsed } from "../lib/voucher.js";
import { generateNotifCard } from '../lib/card-generator.js';
import { safeDeleteMessage } from "../lib/myfunc.js";

function resolveTelegramTarget(value) {
  const target = String(value || '').trim();
  if (!target) return null;
  if (target.startsWith('@') || target.startsWith('-') || /^\d+$/.test(target)) return target;
  return `@${target}`;
}

async function sendOwnerPurchaseLog(bot, target, payload) {
  const logger = (await import('../lib/logger.js')).logger;
  const safeBot = bot.__rawBot || bot.rawBot || bot;
  const fallbackText = [
    '🧾 Transaksi Baru',
    `Store: ${payload.storeName || '-'}`,
    `User: @${payload.username || '-'} (${payload.from})`,
    `Produk: ${payload.productName}`,
    `Jumlah: ${payload.jumlah} pcs`,
    `Harga Satuan: ${payload.hargaSatuan}`,
    `Total Bayar: ${payload.totalBayar}`,
    `Metode: ${payload.metode}`,
    payload.voucher ? `Voucher: ${payload.voucher}` : null,
    `Reff ID: ${payload.reffId}`,
  ].filter(Boolean).join('\n');

  try {
    const notifCard = await generateNotifCard(payload);
    await safeBot.sendPhoto(target, notifCard, {
      file_name: 'notif.png',
      contentType: 'image/png',
      skip_keyboard: true,
      clean_chat: false,
    });
    return;
  } catch (photoErr) {
    logger.warn(`[NOTIF SALDO] Gagal kirim card ke ${target}: ${photoErr.stack || photoErr.message || photoErr}`);
  }

  try {
    await safeBot.sendMessage(target, fallbackText, {
      disable_web_page_preview: true,
      skip_keyboard: true,
      clean_chat: false,
    });
  } catch (textErr) {
    logger.warn(`[NOTIF SALDO] Fallback teks juga gagal ke ${target}: ${textErr.stack || textErr.message || textErr}`);
  }
}

let handler = async ({
  bot,
  chat_id,
  from,
  body,
  bot_id,
  data,
  username,
  message_id,
}) => {
  let parts = data.data.split(" ");
  let product_id = parts[1];
  let jumlah_pesanan = parseInt(parts[2]);

  
  const { isValidProductId, isValidQuantity } = await import('../lib/validate.js');
  if (!isValidProductId(product_id) || !isValidQuantity(jumlah_pesanan)) {
    (await import('../lib/logger.js')).logger.warn(`Invalid order input from ${from}: ${product_id} x ${jumlah_pesanan}`);
    return bot.answerCallbackQuery(data.id, { text: "Data pesanan tidak valid.", show_alert: true });
  }

  
  const raw3 = parts[3];
  const raw4 = parts[4];
  const raw5 = parts[5];

  let total_harga_input = NaN;
  let voucher_code = null;
  let reffId = null;

  if (raw3 !== undefined) {
    if (!isNaN(parseInt(raw3))) {
      total_harga_input = parseInt(raw3);
      if (raw4 !== undefined) {
        if (raw5 !== undefined) {
          voucher_code = raw4;
          reffId = raw5;
        } else {
          
          if (raw4 && raw4.length === 10) reffId = raw4;
          else voucher_code = raw4;
        }
      }
    } else {
      
      reffId = raw3;
    }
  }

  if (!reffId) reffId = global.createReffIdd();

  let user = await getDBData(dbUser, from);
  let productDetailsResult = await getProductDetails(bot_id, product_id);
  let productData = productDetailsResult.data;

  if (!user || !productData) {
    return bot.sendMessage(chat_id, "Gagal memproses, data tidak ditemukan.");
  }

  let hargaFinal;
  if (
    total_harga_input !== undefined &&
    total_harga_input !== "" &&
    !isNaN(parseInt(total_harga_input))
  ) {
    hargaFinal = parseInt(total_harga_input);
  } else {
    hargaFinal = productData.price * jumlah_pesanan;
  }

  
  const lockKey = `${from}:${message_id}:${product_id}`;
  const locked = processingLocks.lock(lockKey, 20000);
  if (!locked) {
    return bot.answerCallbackQuery(data.id, {
      text: "Permintaan sudah diproses, mohon tunggu.",
      show_alert: false,
    });
  }

  let msgProses;
  let balanceDeducted = false;
  let stockTaken = false;
  let orderDelivered = false;
  try {
    
    let deductionRes = { success: true };
    if (hargaFinal > 0) {
      deductionRes = await deductBalanceIfEnough(from, hargaFinal);
      if (!deductionRes.success) {
        return bot.answerCallbackQuery(data.id, {
          text: "Saldo anda tidak mencukupi untuk melakukan pembelian ini ❗️",
          show_alert: true,
        });
      }
      balanceDeducted = true;
    }

    
    
    await safeDeleteMessage(bot, chat_id, message_id);
    msgProses = await bot.sendMessage(
      chat_id,
      esc("_Tunggu sebentar, sedang memproses pesanan Anda..._"),
      { parse_mode: "MarkdownV2" }
    );

    let accountsResult = await takeProductAccount(
      bot_id,
      product_id,
      jumlah_pesanan,
      reffId
    );

    if (!accountsResult.success) {
      if (hargaFinal > 0) {
        await refundBalance(from, hargaFinal);
        balanceDeducted = false;
      }
      await safeDeleteMessage(bot, chat_id, msgProses?.message_id);
      return bot.answerCallbackQuery(data.id, {
        text:
          accountsResult.error ||
          "Gagal mengambil stok produk, saldo dikembalikan.",
        show_alert: true,
      });
    }

    stockTaken = true;
  const takenAccounts = accountsResult.data;

  if (voucher_code) {
    const markResult = await markVoucherUsed(voucher_code, from);
    if (!markResult.success) {
      (await import('../lib/logger.js')).logger.warn(
        `[VOUCHER ERROR] Gagal menandai voucher ${voucher_code} sebagai USED: ${markResult.error}`
      );
    }
  }

  const recordedUnitPrice = jumlah_pesanan > 0 ? Math.round(hargaFinal / jumlah_pesanan) : productData.price;
  await addTransactionHistory(
    from,
    bot_id,
    product_id,
    productData.name,
    jumlah_pesanan,
    recordedUnitPrice,
    "completed",
    "balance",
    productData.snk || "",
    reffId
  );

  await addUserTransaction(from, 1, jumlah_pesanan, hargaFinal);
  await addBotTransaction(bot_id, 1, hargaFinal);
  await addProductSold(bot_id, product_id, jumlah_pesanan);

  let diskonTeks = voucher_code
    ? `\n— Diskon Voucher: Ya (${voucher_code})`
    : "";

  let caption = `*📜 Pembelian Berhasil*
_Terima kasih telah melakukan pembelian pada store kami._

*Informasi Pembelian:*
— Produk: ${productData.name}
— Harga Satuan: ${rupiah(productData.price)}
— Jumlah Pesanan: ${jumlah_pesanan}
— Total Pembayaran: ${rupiah(hargaFinal)}${diskonTeks}
— Metode Pembayaran: *Saldo*
— Reff ID: \`${reffId}\`\n`;

  let dataAkun = ``;
  takenAccounts.forEach((acc, index) => {
    dataAkun += `${index + 1}. ${acc}\n`;
  });

  let path = "./src/transaksi/terkirim/" + fileName(from) + ".txt";

  if (!fs.existsSync("./src/transaksi/terkirim")) {
    fs.mkdirSync("./src/transaksi/terkirim", { recursive: true });
  }

  fs.writeFileSync(path, dataAkun);

  let sticker;
  if (global.sticker_id && global.sticker_id.terimakasih != "xxx") {
    sticker = global.sticker_id.terimakasih;
  } else {
    sticker = "./src/media/sticker/terimakasih.webp";
  }

  await safeDeleteMessage(bot, chat_id, msgProses?.message_id);

  try {
    await bot.sendSticker(chat_id, sticker, { file_name: "terimakasih.webp" });
  } catch (stickerErr) {
    (await import('../lib/logger.js')).logger.warn('Gagal mengirim sticker saldo: ' + (stickerErr.message || stickerErr));
  }

  await bot.sendDocument(chat_id, path, {
    caption: esc(caption),
    parse_mode: "MarkdownV2",
    file_name: "akun.txt",
    contentType: "json/application",
  });
  orderDelivered = true;

  if (productData.snk && productData.snk !== "") {
    try {
      await bot.sendMessage(chat_id, esc(`📋 *Syarat & Ketentuan:*\n\n${productData.snk}`), {
        parse_mode: "MarkdownV2",
      });
    } catch (snkErr) {
      (await import('../lib/logger.js')).logger.warn('Gagal mengirim SNK saldo: ' + (snkErr.message || snkErr));
    }
  }

  try {
    const ownerChannel = resolveTelegramTarget(global.channel_id_owner);
    if (ownerChannel) {
      await sendOwnerPurchaseLog(bot, ownerChannel, {
        bot, from, username, pushname: username,
        productName: productData.name,
        jumlah: jumlah_pesanan,
        hargaSatuan: rupiah(productData.price),
        totalBayar: rupiah(hargaFinal),
        metode: 'Saldo',
        reffId,
        voucher: voucher_code,
        storeName: global.store_name
      });
    }
  } catch (notifErr) {
    (await import('../lib/logger.js')).logger.warn('Gagal mengirim notifikasi owner saldo: ' + (notifErr.stack || notifErr.message || notifErr));
  }
  } catch (e) {
    (await import('../lib/logger.js')).logger.error('Order saldo failed: ' + (e.message || e));
    console.debug(e.stack || e);

    if (orderDelivered) {
      await bot.sendMessage(chat_id, 'Pesanan berhasil dikirim, tetapi ada proses tambahan yang gagal. Saldo tidak dikembalikan karena produk sudah diterima.');
      return;
    }

    if (stockTaken) {
      try {
        const { ProductStock } = await import('../lib/database.js');
        await ProductStock.updateMany({ trxRefId: reffId }, { $set: { isSold: false, trxRefId: null } });
      } catch (cleanupErr) {
        (await import('../lib/logger.js')).logger.error('Cleanup stok saldo gagal: ' + (cleanupErr.message || cleanupErr));
      }
    }

    if (balanceDeducted && hargaFinal > 0) {
      try {
        await refundBalance(from, hargaFinal);
      } catch (refundErr) {
        (await import('../lib/logger.js')).logger.error('Refund saldo gagal: ' + (refundErr.message || refundErr));
      }
    }

    await safeDeleteMessage(bot, chat_id, msgProses?.message_id);

    await bot.sendMessage(chat_id, 'Terjadi kesalahan saat memproses pesanan. Jika saldo terpotong, saldo sudah dikembalikan otomatis.');
  } finally {
    
    processingLocks.unlock(lockKey);
  }
};

handler.key = "ordersaldo";
export default handler;

function fileName(user_id) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const hari = d.getDay();
  const tanggal = pad(d.getDate());
  const tahun = d.getFullYear();
  const jam = pad(d.getHours());
  const menit = pad(d.getMinutes());
  const detik = pad(d.getSeconds());
  const random2 = pad(Math.floor(Math.random() * 100));
  return `${user_id}-${hari}${tanggal}${tahun}-${jam}${menit}${detik}-${random2}`;
}
