import "../config.js";
import {
  deductBalanceIfEnough,
  createDigiflazzTransaction,
  updateDigiflazzTransaction,
  incrementDigiflazzProductSold,
  refundBalance,
} from "../lib/database.js";
import { createTransaction } from "../lib/digiflazz.js";
import { stripEmoji } from "../lib/myfunc.js";

async function safeAnswerCallback(bot, data, options = {}) {
  if (!data?.id) return;
  try {
    await bot.answerCallbackQuery(data.id, options);
  } catch (e) {
    console.error("Failed to answer Digiflazz callback:", e.message || e);
  }
}

async function safeEditMessage(bot, chat_id, message_id, text, options = {}) {
  if (!chat_id || !message_id) return false;
  try {
    await bot.editMessageText(esc(text), {
      chat_id,
      message_id,
      parse_mode: "MarkdownV2",
      ...options,
    });
    return true;
  } catch (e) {
    console.error("Failed to edit Digiflazz message:", e.message || e);
    return false;
  }
}

async function notifyFailure(bot, chat_id, message_id, text) {
  const edited = await safeEditMessage(bot, chat_id, message_id, text);
  if (!edited && chat_id) {
    await bot.sendMessage(chat_id, esc(text), { parse_mode: "MarkdownV2" });
  }
}

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function validateConfirmState(state) {
  const product = state?.product;
  const sellPrice = Number(product?.sellPrice);

  if (!product || typeof product !== "object") return "Data produk tidak ditemukan. Silakan pilih produk ulang.";
  if (!product.buyer_sku_code) return "Kode SKU produk tidak valid. Silakan sync produk Digiflazz ulang.";
  if (!product.product_name) return "Nama produk tidak valid. Silakan pilih produk ulang.";
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) return "Harga produk tidak valid. Silakan sync produk Digiflazz ulang.";
  if (!state.customer_no) return "Nomor tujuan belum terisi. Silakan mulai ulang transaksi.";

  return null;
}

let handler = async ({ bot, from, chat_id, data, message_id, bot_id }) => {
  let deductedAmount = 0;
  let ref_id = null;
  let stateDeleted = false;

  try {
    // Cek state
    if (!global.digiflazzInput || !global.digiflazzInput[from]) {
      return bot.answerCallbackQuery(data.id, {
        text: "Sesi telah berakhir, silakan mulai lagi",
        show_alert: true,
      });
    }

    const state = global.digiflazzInput[from];

    if (state.step !== "confirm") {
      return bot.answerCallbackQuery(data.id, {
        text: "Langkah tidak valid",
        show_alert: true,
      });
    }

    const stateError = validateConfirmState(state);
    if (stateError) {
      delete global.digiflazzInput[from];
      stateDeleted = true;
      await safeAnswerCallback(bot, data, {
        text: "Data transaksi tidak valid",
        show_alert: true,
      });
      return notifyFailure(bot, chat_id, message_id, `❌ *Transaksi Gagal*\n\n${stateError}`);
    }

    const { product, customer_no } = state;
    const sellPrice = Number(product.sellPrice);

    // Hapus state
    delete global.digiflazzInput[from];
    stateDeleted = true;

    await safeAnswerCallback(bot, data, {
      text: "Transaksi sedang diproses...",
    });

    // Update message menjadi processing
    await safeEditMessage(bot, chat_id, message_id, "⏳ *Memproses transaksi...*\n\nMohon tunggu sebentar.");

    // Generate ref_id unik
    ref_id = `DGF${Date.now()}${from}`;

    // Deduct saldo user
    const deductResult = await deductBalanceIfEnough(from, sellPrice);

    if (!deductResult.success) {
      return notifyFailure(bot, chat_id, message_id, `❌ *Transaksi Gagal*\n\n${deductResult.error}`);
    }

    deductedAmount = sellPrice;

    // Simpan transaksi ke database
    const trxData = {
      botId: bot_id,
      userId: from,
      ref_id,
      buyer_sku_code: product.buyer_sku_code,
      customer_no,
      product_name: product.product_name,
      price: product.price,
      sellPrice,
      status: "pending",
      paymentMethod: "balance",
      statusChatId: chat_id,
      statusMessageId: message_id,
      lastChecked: new Date(0), // Set ke epoch agar polling bisa langsung cek
    };

    const createTrxResult = await createDigiflazzTransaction(trxData);

    if (!createTrxResult.success) {
      // Refund saldo jika gagal simpan transaksi
      await refundBalance(from, deductedAmount);
      deductedAmount = 0;
      return notifyFailure(bot, chat_id, message_id, `❌ *Transaksi Gagal*\n\nGagal menyimpan transaksi: ${createTrxResult.error}\n\nSaldo Anda telah dikembalikan.`);
    }

    // Kirim request ke Digiflazz
    const digiflazzResult = await createTransaction({
      buyer_sku_code: product.buyer_sku_code,
      customer_no,
      ref_id,
      testing: global.digiflazz.mode === "development",
    });

    if (!digiflazzResult.success) {
      // Update status transaksi
      await updateDigiflazzTransaction(ref_id, {
        status: "failed",
        message: digiflazzResult.error,
        rc: digiflazzResult.data?.rc || "99",
      });

      // Refund saldo
      await refundBalance(from, deductedAmount);
      deductedAmount = 0;

      return notifyFailure(bot, chat_id, message_id, `❌ *Transaksi Gagal*\n\n${digiflazzResult.error}\n\nSaldo Anda telah dikembalikan.`);
    }

    const result = digiflazzResult.data;

    // Update transaksi dengan response dari Digiflazz
    await updateDigiflazzTransaction(ref_id, {
      trx_id: result.trx_id,
      status: result.status,
      rc: result.rc,
      message: result.message,
      sn: result.sn,
      buyer_last_saldo: result.buyer_last_saldo,
    });

    // Jika sukses, increment sold count
    const status = normalizeStatus(result.status);

    if (status === "success" || status === "sukses") {
      await incrementDigiflazzProductSold(bot_id, product.buyer_sku_code);
      deductedAmount = 0;
      // Mark sebagai sudah dinotifikasi agar polling tidak proses ulang
      await updateDigiflazzTransaction(ref_id, { statusNotifiedAt: new Date() });
    }

    // Format message berdasarkan status
    let statusMessage = "";
    let statusIcon = "";

    if (status === "success" || status === "sukses") {
      statusIcon = "✅";
      statusMessage = `*${statusIcon} TRANSAKSI BERHASIL*

*Produk:* ${stripEmoji(product.product_name)}
*Nomor Tujuan:* ${customer_no}
*Harga:* ${rupiah(sellPrice)}

*Status:* Sukses
*Pesan:* ${result.message}
${result.sn ? `*SN/Kode:* \`${result.sn}\`` : ""}

*ID Transaksi:* \`${ref_id}\`

Terima kasih telah menggunakan layanan kami!`;
    } else if (status === "pending") {
      statusIcon = "⏳";
      deductedAmount = 0; // Jangan refund saat pending, saldo sudah benar terpotong
      statusMessage = `*${statusIcon} TRANSAKSI DIPROSES*

*Produk:* ${stripEmoji(product.product_name)}
*Nomor Tujuan:* ${customer_no}
*Harga:* ${rupiah(sellPrice)}

*Status:* Sedang Diproses
*Pesan:* ${result.message}

*ID Transaksi:* \`${ref_id}\`

⚡ *Pesan ini akan diupdate otomatis* saat status transaksi berubah (maks 2 menit).

Anda juga dapat cek status manual dengan command:
/dgf_status ${ref_id}`;
    } else {
      statusIcon = "❌";
      statusMessage = `*${statusIcon} TRANSAKSI GAGAL*

*Produk:* ${stripEmoji(product.product_name)}
*Nomor Tujuan:* ${customer_no}

*Status:* Gagal
*Pesan:* ${result.message}

*ID Transaksi:* \`${ref_id}\`

Saldo Anda telah dikembalikan.`;

      // Refund jika gagal
      await refundBalance(from, deductedAmount);
      deductedAmount = 0;
      await updateDigiflazzTransaction(ref_id, { status: "failed", statusNotifiedAt: new Date() });
    }

    await notifyFailure(bot, chat_id, message_id, statusMessage);
  } catch (e) {
    console.error("Error in digiflazz-confirm:", e);

    if (deductedAmount > 0) {
      const refundResult = await refundBalance(from, deductedAmount);
      if (!refundResult.success) {
        console.error(`Gagal refund Digiflazz ${ref_id || "unknown"}:`, refundResult.error);
      }
    }
    
    // Cleanup state
    if (!stateDeleted && global.digiflazzInput && global.digiflazzInput[from]) {
      delete global.digiflazzInput[from];
    }

    await safeAnswerCallback(bot, data, {
      text: "Terjadi kesalahan saat memproses transaksi",
      show_alert: true,
    });

    await notifyFailure(
      bot,
      chat_id,
      message_id,
      `❌ *Transaksi Gagal*\n\nTerjadi kesalahan saat memproses transaksi. ${deductedAmount > 0 ? "Saldo Anda sudah dicoba dikembalikan." : "Saldo Anda tidak terpotong."}`
    );
  }
};

handler.key = "dgf_confirm";

export default handler;
