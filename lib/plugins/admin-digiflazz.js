import "../config.js";
import { checkBalance, getPriceList } from "../lib/digiflazz.js";
import { syncDigiflazzProducts, getDigiflazzStats } from "../lib/database.js";

let handler = async ({ bot, from, chat_id, command, bot_id, isAdmin }) => {
  try {
    if (!isAdmin) {
      return bot.sendMessage(chat_id, esc(global.mess.owner), {
        parse_mode: "MarkdownV2",
      });
    }

    if (!global.digiflazz?.enabled) {
      return bot.sendMessage(
        chat_id,
        esc("Fitur Digiflazz belum diaktifkan.\n\nAktifkan di file .env dengan set DIGIFLAZZ_ENABLED=true"),
        { parse_mode: "MarkdownV2" }
      );
    }

    if (command === "digiflazz-balance" || command === "dgfbalance") {
      // Cek saldo Digiflazz
      await bot.sendMessage(chat_id, esc("⏳ Mengecek saldo Digiflazz..."), {
        parse_mode: "MarkdownV2",
      });

      const balanceResult = await checkBalance();

      if (!balanceResult.success) {
        return bot.sendMessage(
          chat_id,
          esc(`❌ *Gagal Cek Saldo*\n\n${balanceResult.error}`),
          { parse_mode: "MarkdownV2" }
        );
      }

      const balance = balanceResult.data;
      const message = `💰 *SALDO DIGIFLAZZ*

*Saldo:* ${rupiah(balance.deposit)}
*Mode:* ${global.digiflazz.mode === "development" ? "Development" : "Production"}

${global.digiflazz.mode === "development" ? "⚠️ _Mode development aktif. Transaksi tidak akan mengurangi saldo real._" : ""}`;

      return bot.sendMessage(chat_id, esc(message), {
        parse_mode: "MarkdownV2",
      });
    }

    if (command === "digiflazz-sync" || command === "dgfsync") {
      // Sync produk dari Digiflazz
      const msg = await bot.sendMessage(
        chat_id,
        esc("⏳ *Syncing produk dari Digiflazz...*\n\nProses ini mungkin memakan waktu beberapa menit."),
        { parse_mode: "MarkdownV2" }
      );

      const priceListResult = await getPriceList();

      if (!priceListResult.success) {
        return bot.editMessageText(
          esc(`❌ *Sync Gagal*\n\n${priceListResult.error}`),
          {
            chat_id,
            message_id: msg.message_id,
            parse_mode: "MarkdownV2",
          }
        );
      }

      const products = priceListResult.data;
      const syncResult = await syncDigiflazzProducts(bot_id, products);

      if (!syncResult.success) {
        return bot.editMessageText(
          esc(`❌ *Sync Gagal*\n\n${syncResult.error}`),
          {
            chat_id,
            message_id: msg.message_id,
            parse_mode: "MarkdownV2",
          }
        );
      }

      const message = `✅ *SYNC BERHASIL*

*Total Produk:* ${syncResult.data.total}
*Produk Baru:* ${syncResult.data.inserted}
*Produk Diupdate:* ${syncResult.data.updated}
*Produk Dinonaktifkan:* ${syncResult.data.deactivated}
*Produk Dilewati:* ${syncResult.data.skipped || 0}

*Markup:* ${global.digiflazz.markupType === "fixed" ? `Rp ${global.digiflazz.markupValue}` : `${global.digiflazz.markupValue}%`}

Produk siap dijual! 🎉`;

      return bot.editMessageText(esc(message), {
        chat_id,
        message_id: msg.message_id,
        parse_mode: "MarkdownV2",
      });
    }

    if (command === "digiflazz-stats" || command === "dgfstats") {
      // Tampilkan statistik
      await bot.sendMessage(chat_id, esc("⏳ Mengambil statistik..."), {
        parse_mode: "MarkdownV2",
      });

      const statsResult = await getDigiflazzStats(bot_id);

      if (!statsResult.success) {
        return bot.sendMessage(
          chat_id,
          esc(`❌ *Gagal Ambil Statistik*\n\n${statsResult.error}`),
          { parse_mode: "MarkdownV2" }
        );
      }

      const stats = statsResult.data;
      const message = `📊 *STATISTIK DIGIFLAZZ*

*Produk:*
• Total Produk Aktif: ${stats.totalProducts}

*Transaksi:*
• Total Transaksi: ${stats.totalTransactions}
• Sukses: ${stats.successTransactions}
• Pending: ${stats.pendingTransactions}
• Gagal: ${stats.failedTransactions}

*Revenue:*
• Total Penjualan: ${rupiah(stats.totalSales)}
• Total Profit: ${rupiah(stats.totalRevenue)}

*Konfigurasi:*
• Markup: ${global.digiflazz.markupType === "fixed" ? `Rp ${global.digiflazz.markupValue}` : `${global.digiflazz.markupValue}%`}
• Auto Sync: ${global.digiflazz.autoSync ? "Aktif" : "Nonaktif"}
• Mode: ${global.digiflazz.mode}`;

      return bot.sendMessage(chat_id, esc(message), {
        parse_mode: "MarkdownV2",
      });
    }

    if (command === "digiflazz-config" || command === "dgfconfig") {
      // Tampilkan konfigurasi
      const message = `⚙️ *KONFIGURASI DIGIFLAZZ*

*Status:* ${global.digiflazz.enabled ? "✅ Aktif" : "❌ Nonaktif"}
*Username:* ${global.digiflazz.username || "-"}
*Mode:* ${global.digiflazz.mode}

*Pricing:*
• Tipe Markup: ${global.digiflazz.markupType === "fixed" ? "Fixed (Tetap)" : "Percentage (Persentase)"}
• Nilai Markup: ${global.digiflazz.markupType === "fixed" ? `Rp ${global.digiflazz.markupValue}` : `${global.digiflazz.markupValue}%`}

*Auto Sync:*
• Status: ${global.digiflazz.autoSync ? "✅ Aktif" : "❌ Nonaktif"}
• Interval: ${global.digiflazz.syncInterval / 1000 / 60} menit

*Webhook:*
• URL: ${global.digiflazz.webhookUrl || "Tidak diset"}

_Untuk mengubah konfigurasi, edit file .env dan restart bot._`;

      return bot.sendMessage(chat_id, esc(message), {
        parse_mode: "MarkdownV2",
      });
    }
  } catch (e) {
    console.error("Error in admin-digiflazz:", e);
    bot.sendMessage(chat_id, esc(global.mess.error), {
      parse_mode: "MarkdownV2",
    });
  }
};

handler.command = [
  "digiflazz-balance",
  "dgfbalance",
  "digiflazz-sync",
  "dgfsync",
  "digiflazz-stats",
  "dgfstats",
  "digiflazz-config",
  "dgfconfig",
];
handler.admin = true;

export default handler;
