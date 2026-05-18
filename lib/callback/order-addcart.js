import { getProductDetails, getCategory } from "../lib/database.js";
import { checkBulkPrice, getBulkRules } from "../lib/bulk_price.js";
import { isReseller, getResellerPrice } from "../lib/reseller.js";
import { rupiah, safeDeleteMessage } from "../lib/myfunc.js";
import { generateOrderCard, editWithCard } from "../lib/card-generator.js";
import buttonStyles from "../styles/index.js";

let handler = async ({ bot, data, bot_id, chat_id, message_id, from, pushname }) => {
  const parts = data.data.split(" ");
  const product_id = parts[1];
  let input_qty = parts[2];
  let voucher_code = parts[3] || null;
  let voucher_amount = parseInt(parts[4]) || 0;

  if (global.onInputVoucher && global.onInputVoucher[from] && global.onInputVoucher[from].status === "input_voucher") {
    await safeDeleteMessage(bot, chat_id, global.onInputVoucher[from].message_id);
    delete global.onInputVoucher[from];
  }

  const product = await getProductDetails(bot_id, product_id);
  if (!product.success)
    return bot.reply(`*Terjadi Kesalahan ❗️*\n\`${product.error}\``);

  const category = await getCategory(bot_id);
  const result = Object.keys(category.data).find((key) =>
    category.data[key].includes(product_id)
  );

  const stokTersedia = product.data.stock;

  if (stokTersedia < 1) {
    await bot.answerCallbackQuery(data.id, {
      text: `Stok produk ini sedang kosong ❗️`,
      show_alert: true,
    });
    return;
  }

  let jumlah_pesanan = 1;

  if (input_qty === 'max') {
    jumlah_pesanan = stokTersedia;
  } else {
    jumlah_pesanan = parseInt(input_qty);
    if (isNaN(jumlah_pesanan)) jumlah_pesanan = 1;
  }

  if (input_qty !== 'max' && parseInt(input_qty) < 1) {
    await bot.answerCallbackQuery(data.id, {
      text: `Minimal pembelian adalah 1 unit ❗️`,
      show_alert: true,
    });
    return;
  }

  if (jumlah_pesanan > stokTersedia) {
    jumlah_pesanan = stokTersedia;
    if (input_qty !== 'max') {
      await bot.answerCallbackQuery(data.id, {
        text: `Stok tersedia hanya ${stokTersedia} unit ❗️. Jumlah pesanan disesuaikan.`,
        show_alert: true,
      });
    }
  }

  if (jumlah_pesanan < 1) jumlah_pesanan = 1;

  const userIsReseller = isReseller(from);
  const resellerPrice = getResellerPrice(product_id);

  let hargaSatuan;
  let isResellerActive = false;
  let bulkData = { isBulk: false };

  if (userIsReseller && resellerPrice !== null) {
    hargaSatuan = resellerPrice;
    isResellerActive = true;
  } else {
    bulkData = checkBulkPrice(product_id, jumlah_pesanan, product.data.price);
    hargaSatuan = bulkData.finalPrice;
  }

  const subtotal = hargaSatuan * jumlah_pesanan;
  let diskon = voucher_amount;
  let totalBayar = subtotal - diskon;
  totalBayar = Math.max(0, totalBayar);

  if (global.onInputCart && global.onInputCart[from] && global.onInputCart[from].status === "input_jumlah") {
    await safeDeleteMessage(bot, chat_id, global.onInputCart[from].message2);
    delete global.onInputCart[from];
  }

  let caption = `*🛒 KONFIRMASI PESANAN*\n\n`;
  caption += `*— Produk:* ${result}\n`;
  caption += `*— Variasi:* ${product.data.name}\n`;

  if (isResellerActive) {
    caption += `*— Harga Normal:* ~${rupiah(product.data.price)}~\n`;
    caption += `*— Harga Reseller:* ${rupiah(hargaSatuan)} ✅\n`;
  } else if (bulkData.isBulk) {
    caption += `*— Harga Normal:* ~${rupiah(product.data.price)}~\n`;
    caption += `*— Harga Bulk:* ${rupiah(hargaSatuan)} (Min. ${bulkData.minQty}pcs) ✅\n`;
  } else {
    caption += `*— Harga Satuan:* ${rupiah(hargaSatuan)}\n`;
  }

  caption += `*— Stok Tersedia:* ${stokTersedia}\n`;
  caption += `*— Jumlah Pesanan:* ${jumlah_pesanan}\n`;
  caption += `*— Subtotal:* ${rupiah(subtotal)}\n`;

  if (voucher_code) {
    caption += `*— VOUCHER (${voucher_code}):* -${rupiah(diskon)}\n`;
  }

  caption += `*— Total Pembayaran:* ${rupiah(totalBayar)}\n`;

  caption += `\n${product.data.desc}`;

  if (!isResellerActive) {
    const bulkRules = getBulkRules(product_id);
    if (bulkRules.length > 0) {
      caption += `\n\n*Harga Bulk Tersedia:*\n`;
      bulkRules.forEach(rule => {
        let activeMarker = (bulkData.isBulk && bulkData.minQty === rule.min) ? "✅" : "";
        caption += `• Beli ${rule.min}+ : ${rupiah(rule.price)}/item ${activeMarker}\n`;
      });
    }
  }

  // Create quantity keyboard using button styles
  const keyboard = buttonStyles.telegram.createQuantityKeyboard(
    product_id,
    jumlah_pesanan,
    {
      voucherCode: voucher_code || "",
      voucherAmount: voucher_amount,
      showTakeAll: true,
      showVoucher: true,
      showBack: true
    }
  );

  // Add payment buttons
  const reffId = global.createReffIdd();
  const qrisCallback = `orderqr ${product_id} ${jumlah_pesanan} ${totalBayar} ${voucher_code || ''} ${reffId}`;
  const saldoCallback = `ordersaldo ${product_id} ${jumlah_pesanan} ${totalBayar} ${voucher_code || ''} ${reffId}`;
  if (!global.orderPaymentContext) global.orderPaymentContext = new Map();
  global.orderPaymentContext.set(from, { qris: qrisCallback, saldo: saldoCallback });

  const paymentKeyboard = buttonStyles.telegram.createPaymentKeyboard(
    qrisCallback,
    saldoCallback,
    null
  );

  // Insert payment buttons before the back button
  keyboard.splice(keyboard.length - 1, 0, ...paymentKeyboard);

  // Create reply keyboard for keyboard mode
  const replyKeyboard = [
    [{ text: "-1", style: "primary" }, { text: "Ketik Jumlah", style: "primary" }, { text: "+1", style: "primary" }],
    [{ text: "-10", style: "primary" }, { text: "-5", style: "primary" }, { text: "+5", style: "primary" }, { text: "+10", style: "primary" }],
    [{ text: "Take All 📦", style: "primary" }],
    voucher_code ? [{ text: "❌ Batalkan Voucher", style: "danger" }] : [{ text: "Use Voucher 🎫", style: "primary" }],
    [{ text: "Qris 1⃣", style: "success" }, { text: "Balance 2⃣", style: "success" }],
    [{ text: "↩️ Kembali", style: "danger" }]
  ];

  try {
    const cardBuf = await generateOrderCard({
      from, pushname: pushname || from,
      productName: result,
      variant: product.data.name,
      harga: rupiah(hargaSatuan),
      stok: String(stokTersedia),
      jumlah: jumlah_pesanan,
      subtotal: rupiah(subtotal),
      total: rupiah(totalBayar),
      voucher: voucher_code || null,
      diskon: voucher_code ? rupiah(diskon) : null,
      storeName: global.store_name
    });

    const reply_markup = global.use_reply_keyboard ? {
      keyboard: replyKeyboard,
      resize_keyboard: true,
      is_persistent: true,
    } : {
      inline_keyboard: keyboard,
    };

    await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), reply_markup);
  } catch (e) {
    if (!(e.message && e.message.includes("message is not modified"))) {
      (await import('../lib/logger.js')).logger.error('order-addcart error: ' + (e.message || e));
      console.debug(e.stack || e);
    }
  }
};

handler.key = ["addcart"];

export default handler;
