import "../config.js";
import { validateCustomerNumber } from "../lib/digiflazz.js";
import { dbUser } from "../lib/database.js";
import {
  buildDigiflazzCheckoutKeyboard,
  buildDigiflazzCheckoutMessage,
} from "../lib/digiflazz-order.js";

let handler = async ({ bot, from, chat_id, body, message_id, bot_id }) => {
  try {
    // Cek apakah user sedang dalam proses input nomor
    if (!global.digiflazzInput || !global.digiflazzInput[from]) {
      return;
    }

    const state = global.digiflazzInput[from];

    if (state.step !== "input_number") {
      return;
    }

    const customerNo = String(body || "").trim();
    const product = state.product;

    const normalizedInput = customerNo.replace(/\s+/g, " ").toLowerCase();
    const isCancelInput = /batalkan|\bbatal\b|\bcancel\b/.test(normalizedInput);

    if (isCancelInput) {
      const cancelHandler = global.cbFunction?.dgf_cancel;
      if (typeof cancelHandler === "function") {
        await cancelHandler({
          bot,
          from,
          chat_id,
          data: { id: null, data: "dgf_cancel" },
          message_id,
          bot_id,
        });
        return;
      }

      delete global.digiflazzInput[from];
      if (global.onInputDigiflazzQty && global.onInputDigiflazzQty[from]) delete global.onInputDigiflazzQty[from];
      if (global.digiflazzVariantContext) global.digiflazzVariantContext.delete(from);
      return bot.sendMessage(chat_id, esc("❌ *Transaksi Dibatalkan*\n\nAnda dapat memulai transaksi baru kapan saja."), {
        parse_mode: "MarkdownV2",
      });
    }

    if (!product || typeof product !== "object") {
      delete global.digiflazzInput[from];
      return bot.sendMessage(chat_id, esc("❌ Data produk tidak ditemukan. Silakan pilih produk Digiflazz ulang."), {
        parse_mode: "MarkdownV2",
      });
    }

    if (!customerNo) {
      return bot.sendMessage(chat_id, esc("❌ Nomor tujuan tidak boleh kosong. Silakan coba lagi."), {
        parse_mode: "MarkdownV2",
      });
    }

    // Validasi nomor
    const validation = validateCustomerNumber(customerNo, product.category);

    if (!validation.valid) {
      return bot.sendMessage(chat_id, esc(`❌ ${validation.error}\n\nSilakan coba lagi.`), {
        parse_mode: "MarkdownV2",
      });
    }

    // Cek saldo user
    const userResult = await dbUser(from);
    if (!userResult.success || !userResult.data) {
      delete global.digiflazzInput[from];
      return bot.sendMessage(chat_id, esc("Terjadi kesalahan saat mengambil data user."), {
        parse_mode: "MarkdownV2",
      });
    }

    const user = userResult.data;

    // Update state dengan nomor customer dan tampilkan checkout agar user bisa pilih QRIS/Balance.
    global.digiflazzInput[from] = {
      ...state,
      customer_no: validation.formatted,
      quantity: 1,
      step: "checkout",
    };

    const { keyboard, replyKeyboard } = buildDigiflazzCheckoutKeyboard(global.digiflazzInput[from]);
    const reply_markup = global.use_reply_keyboard
      ? { keyboard: replyKeyboard, resize_keyboard: true, is_persistent: true }
      : { inline_keyboard: keyboard };

    const checkoutMessage = await bot.sendMessage(chat_id, esc(buildDigiflazzCheckoutMessage(global.digiflazzInput[from], user)), {
      parse_mode: "MarkdownV2",
      reply_markup,
    });

    if (checkoutMessage?.message_id) {
      global.digiflazzInput[from].checkout_message_id = checkoutMessage.message_id;
    }
  } catch (e) {
    console.error("Error in digiflazz input handler:", e);
    console.error("Digiflazz input state:", global.digiflazzInput?.[from]);
    if (global.digiflazzInput && global.digiflazzInput[from]) {
      delete global.digiflazzInput[from];
    }
    await bot.sendMessage(
      chat_id,
      esc("❌ Terjadi kesalahan saat memproses nomor tujuan. Silakan pilih produk Digiflazz ulang."),
      { parse_mode: "MarkdownV2" }
    );
  }
};

// Ini adalah handler untuk semua pesan (bukan command)
// Akan dipanggil oleh pluginsAll
export default handler;
