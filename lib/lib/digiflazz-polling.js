import "../config.js";
import {
  claimDigiflazzFinalProcessing,
  getPendingDigiflazzTransactions,
  updateDigiflazzTransaction,
  refundBalance,
  incrementDigiflazzProductSold,
} from "./database.js";
import { checkTransactionStatus } from "./digiflazz.js";
import { stripEmoji } from "./myfunc.js";
import chalk from "./chalk.js";

let pollingInterval = null;
let pollingInProgress = false;

function log(type, msg) {
  const types = {
    info: `${chalk.blue("[")}${chalk.yellow("i")}${chalk.blue("]")}`,
    success: `${chalk.green("[")}${chalk.yellow("✓")}${chalk.green("]")}`,
    warn: `${chalk.yellow("[")}${chalk.green("!")}${chalk.yellow("]")}`,
    error: `${chalk.red("[")}${chalk.yellow("x")}${chalk.red("]")}`,
  };
  console.log(types[type] || "[ ]", chalk.whiteBright(msg));
}

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function isSuccessStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === "success" || normalized === "sukses";
}

function isPendingStatus(status) {
  return normalizeStatus(status) === "pending";
}

/**
 * Poll status transaksi pending
 */
async function pollPendingTransactions(bot) {
  if (pollingInProgress) {
    log("warn", "Digiflazz polling sebelumnya masih berjalan, skip cycle ini");
    return;
  }

  pollingInProgress = true;

  try {
    const pendingResult = await getPendingDigiflazzTransactions(50);

    if (!pendingResult.success || pendingResult.data.length === 0) {
      return;
    }

    const transactions = pendingResult.data;
    log("info", `Polling ${transactions.length} transaksi pending...`);

    for (const trx of transactions) {
      try {
        // Cek status ke Digiflazz
        const statusResult = await checkTransactionStatus(
          trx.buyer_sku_code,
          trx.customer_no,
          trx.ref_id
        );

        if (!statusResult.success) {
          // Increment retry count dan update lastChecked
          await updateDigiflazzTransaction(trx.ref_id, {
            retryCount: trx.retryCount + 1,
            lastChecked: new Date(),
          });
          continue;
        }

        const status = statusResult.data;

        // Update transaksi
        await updateDigiflazzTransaction(trx.ref_id, {
          trx_id: status.trx_id,
          status: status.status,
          rc: status.rc,
          message: status.message,
          sn: status.sn,
          buyer_last_saldo: status.buyer_last_saldo,
          retryCount: trx.retryCount + 1,
          lastChecked: new Date(),
        });

        // Kirim final status hanya sekali agar tidak spam/refund dobel.
        if (!isPendingStatus(status.status)) {
          if (trx.statusNotifiedAt) {
            log("warn", `Transaksi ${trx.ref_id} sudah pernah dinotifikasi, skip`);
            continue;
          }

          const claim = await claimDigiflazzFinalProcessing(trx.ref_id, {
            trx_id: status.trx_id,
            status: status.status,
            rc: status.rc,
            message: status.message,
            sn: status.sn,
            buyer_last_saldo: status.buyer_last_saldo,
            retryCount: trx.retryCount + 1,
          });

          if (!claim.success) {
            if (!claim.skipped) log("error", `Gagal klaim transaksi ${trx.ref_id}: ${claim.error}`);
            continue;
          }

          // Jika sukses, increment sold count
          if (isSuccessStatus(status.status)) {
            await incrementDigiflazzProductSold(trx.botId, trx.buyer_sku_code);
            log("success", `Transaksi ${trx.ref_id} berhasil`);
          } else {
            // Jika gagal, refund saldo
            await refundBalance(trx.userId, trx.sellPrice);
            log("warn", `Transaksi ${trx.ref_id} gagal, saldo dikembalikan`);
          }

          const notification = await sendStatusNotification(bot, claim.data, status);
          if (notification.success && notification.messageId) {
            await updateDigiflazzTransaction(trx.ref_id, {
              statusNotificationMessageId: notification.messageId,
            });
          }
        }

        // Delay untuk menghindari rate limit
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        log("error", `Error polling transaksi ${trx.ref_id}: ${error.message}`);
      }
    }
  } catch (error) {
    log("error", `Error saat polling transaksi: ${error.message}`);
  } finally {
    pollingInProgress = false;
  }
}

/**
 * Kirim notifikasi status ke user
 */
async function sendStatusNotification(bot, trx, status) {
  try {
    let message = "";

    if (isSuccessStatus(status.status)) {
      message = `✅ *TRANSAKSI BERHASIL*

*Produk:* ${stripEmoji(trx.product_name)}
*Nomor Tujuan:* ${trx.customer_no}
*Harga:* ${rupiah(trx.sellPrice)}

*Status:* Sukses
*Pesan:* ${status.message}
${status.sn ? `*SN/Kode:* \`${status.sn}\`` : ""}

*ID Transaksi:* \`${trx.ref_id}\`

Terima kasih! 🎉`;
    } else {
      message = `❌ *TRANSAKSI GAGAL*

*Produk:* ${stripEmoji(trx.product_name)}
*Nomor Tujuan:* ${trx.customer_no}

*Status:* Gagal
*Pesan:* ${status.message}

*ID Transaksi:* \`${trx.ref_id}\`

Saldo Anda telah dikembalikan.`;
    }

    const text = esc(message);
    const chatId = trx.statusChatId || trx.userId;

    const editableMessageId = trx.statusNotificationMessageId || trx.statusMessageId;

    log("info", `Mengirim notifikasi untuk ${trx.ref_id} ke chat ${chatId}, message ${editableMessageId}`);

    if (trx.statusChatId && editableMessageId) {
      try {
        await bot.editMessageText(text, {
          chat_id: trx.statusChatId,
          message_id: editableMessageId,
          parse_mode: "MarkdownV2",
          reply_markup: { inline_keyboard: [] },
        });
        log("success", `Berhasil edit pesan status ${trx.ref_id}`);
        return { success: true, messageId: editableMessageId, edited: true };
      } catch (editError) {
        const editMessage = editError.message || "";
        if (editMessage.includes("message is not modified")) {
          return { success: true, messageId: editableMessageId, edited: true };
        }
        log("warn", `Gagal edit pesan status ${trx.ref_id}, kirim pesan baru: ${editMessage}`);
      }
    }

    const sent = await bot.sendMessage(chatId, text, {
      parse_mode: "MarkdownV2",
    });
    log("success", `Berhasil kirim pesan baru status ${trx.ref_id}`);
    return { success: true, messageId: sent?.message_id || null, edited: false };
  } catch (error) {
    log("error", `Gagal kirim notifikasi ke user ${trx.userId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Start polling job
 */
export function startDigiflazzPolling(bot) {
  if (pollingInterval) {
    log("warn", "Digiflazz polling job sudah berjalan");
    return;
  }

  // Poll setiap 30 detik untuk realtime update
  pollingInterval = setInterval(() => {
    pollPendingTransactions(bot);
  }, 30 * 1000);

  // Jalankan polling pertama kali setelah 10 detik
  setTimeout(() => {
    pollPendingTransactions(bot);
  }, 10000);

  log("success", "Digiflazz polling job dimulai (setiap 30 detik)");
}

/**
 * Stop polling job
 */
export function stopDigiflazzPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    log("info", "Digiflazz polling job dihentikan");
  }
}

export default {
  startDigiflazzPolling,
  stopDigiflazzPolling,
};
