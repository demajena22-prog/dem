var cekTransaksi
if (global.paymentgateway.midtrans) {
  cekTransaksi = (await import("../lib/midtrans.js")).cekTransaksi;
} else if (global.paymentgateway.pakasir) {
  cekTransaksi = (await import("../lib/pakasir.js")).cekTransaksi;
} else if (global.paymentgateway.cashify) {
  cekTransaksi = (await import("../lib/cashify.js")).cekTransaksi;
} else if (global.paymentgateway.binancepay) {
  cekTransaksi = (await import("../lib/binancepay.js")).cekTransaksi;
}

import time from "../lib/datetime.js";
import { editBalance } from "../lib/database.js";
import { safeDeleteMessage } from "../lib/myfunc.js";

if (!global.processedDeposits) global.processedDeposits = new Set();

// Cleanup processedDeposits setiap 30 menit (max 1000 entries)
setInterval(() => {
  if (global.processedDeposits && global.processedDeposits.size > 1000) {
    global.processedDeposits.clear();
  }
}, 30 * 60 * 1000);

let handler = async ({ bot, chat_id, from, bot_id, data, message_id }) => {
  let nominal = Number(data.data.split(" ")[1]);
  let ref_id = data.data.split(" ")[2];
  let creditAmount = Number(data.data.split(" ")[3] || nominal);
  try {
    if (!cekTransaksi) {
      return bot.answerCallbackQuery(data.id, {
        text: "Payment gateway belum dikonfigurasi.",
        show_alert: true,
      });
    }

    if (!Number.isFinite(nominal) || !Number.isInteger(nominal) || nominal < 1000 ||
        !Number.isFinite(creditAmount) || !Number.isInteger(creditAmount) || creditAmount < 1000 || !ref_id) {
      return bot.answerCallbackQuery(data.id, {
        text: "Data top-up tidak valid.",
        show_alert: true,
      });
    }

    if (global.processedDeposits.has(ref_id)) {
      return bot.answerCallbackQuery(data.id, {
        text: "Top-up ini sudah diproses sebelumnya.",
        show_alert: true,
      });
    }

    let cekQris = await cekTransaksi(nominal, ref_id);
    if (cekQris) {
      global.processedDeposits.add(ref_id);
      const update = await editBalance(from, creditAmount);
      if (!update.success) {
        global.processedDeposits.delete(ref_id);
        return bot.answerCallbackQuery(data.id, {
          text: "Gagal menambahkan saldo, silakan hubungi admin.",
          show_alert: true,
        });
      }

      if (global.depositPaymentContext) global.depositPaymentContext.delete(from);

      await safeDeleteMessage(bot, chat_id, message_id);
      const nowTime = await time();
      await bot.sendMessage(
        chat_id,
        esc(`*TOP-UP BERHASIL ✅*

*Saldo Masuk :* ${rupiah(creditAmount)}
*Total Bayar :* ${rupiah(nominal)}
*Waktu :* ${nowTime.tanggal} ${nowTime.jam}
*ID Transaksi :*
\`${ref_id}\`

Saldo sebesar *${rupiah(creditAmount)}* telah ditambahkan ke akunmu.`),
        {
          parse_mode: "MarkdownV2",
          clean_chat: false,
          skip_keyboard: true,
          reply_markup: {
            inline_keyboard: [[{ text: "Menu Utama", callback_data: "main_menu", style: "primary" }]],
          },
        }
      );
    } else {
      await bot.answerCallbackQuery(data.id, {
        text: `Pembayaran belum terkonfirmasi ❗️\nSilahkan selesaikan pembayaran terlebih dahulu.`,
        show_alert: true,
      });
    }
  } catch (e) {
    console.log(e);
    await bot.sendMessage(from, esc(global.mess.error), {
      parse_mode: "MarkdownV2",
    });
    return;
  }
};

handler.key = "cekdeposit";
export default handler;
