import "../config.js";
import { safeDeleteMessage, stripEmoji } from "../lib/myfunc.js";
import { getDigiflazzQuantity, getDigiflazzTotal, validateDigiflazzCheckoutState } from "../lib/digiflazz-order.js";

var createQr;
if (global.paymentgateway.midtrans) {
  createQr = (await import("../lib/midtrans.js")).createQr;
} else if (global.paymentgateway.pakasir) {
  createQr = (await import("../lib/pakasir.js")).createQr;
} else if (global.paymentgateway.cashify) {
  createQr = (await import("../lib/cashify.js")).createQr;
} else if (global.paymentgateway.binancepay) {
  createQr = (await import("../lib/binancepay.js")).createQr;
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function getErrorText(e, fallback = "Terjadi kesalahan") {
  return String(e?.response?.data?.message || e?.response?.data?.data?.message || e?.message || fallback).slice(0, 180);
}

let handler = async ({ bot, from, chat_id, data, message_id }) => {
  try {
    if (!createQr) return bot.answerCallbackQuery(data.id, { text: "Payment gateway belum dikonfigurasi.", show_alert: true });

    const state = global.digiflazzInput?.[from];
    if (!state) return bot.answerCallbackQuery(data.id, { text: "Sesi telah berakhir, silakan mulai lagi", show_alert: true });
    if (state.step !== "checkout") return bot.answerCallbackQuery(data.id, { text: "Langkah tidak valid", show_alert: true });

    const stateError = validateDigiflazzCheckoutState(state);
    if (stateError) {
      delete global.digiflazzInput[from];
      return bot.answerCallbackQuery(data.id, { text: stateError, show_alert: true });
    }

    const quantity = getDigiflazzQuantity(data.data.split(" ")[1] || state.quantity || 1);
    const subtotal = getDigiflazzTotal(state.product, quantity);
    const payable = subtotal + Math.floor(Math.random() * 200) + 1;
    const orderRef = `DGFQR${Date.now()}${from}`;

    await bot.answerCallbackQuery(data.id, { text: "Membuat QRIS, mohon tunggu..." }).catch(() => {});
    const qris = await withTimeout(createQr(payable, orderRef), 30000);

    if (!qris) {
      return bot.answerCallbackQuery(data.id, { text: "Gagal membuat QRIS", show_alert: true });
    }

    const nextState = { ...state, quantity, step: "qris_waiting", qris_ref: orderRef, payable, subtotal };

    await safeDeleteMessage(bot, chat_id, message_id);

    const caption = `*Pembayaran QRIS Digiflazz ✅*\n\n` +
      `Silahkan bayar senilai *${rupiah(payable)}*\n\n` +
      `— Reff ID: \`${orderRef}\`\n` +
      `— Produk: *${stripEmoji(state.product.product_name)}*\n` +
      `— Nomor Tujuan: *${state.customer_no}*\n` +
      `— Jumlah: *${quantity}*\n` +
      `— Total Produk: *${rupiah(subtotal)}*`;

    const sentQris = await bot.sendPhoto(chat_id, qris, {
      caption: esc(caption),
      file_name: "digiflazz-qris.jpg",
      contentType: "image/jpeg",
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Sudah Bayar", callback_data: `dgf_qrcheck ${payable} ${orderRef}`, style: "success" }],
          [{ text: "❌ Batalkan", callback_data: "dgf_cancel", style: "danger" }],
        ],
      },
    });

    global.digiflazzInput[from] = {
      ...nextState,
      qris_chat_id: chat_id,
      qris_message_id: sentQris?.message_id || null,
    };

    await bot.answerCallbackQuery(data.id).catch(() => {});
  } catch (e) {
    console.error("Error in digiflazz-payqris:", e);
    await bot.answerCallbackQuery(data.id, { text: getErrorText(e), show_alert: true }).catch(() => {});
  }
};

handler.key = "dgf_payqris";
export default handler;