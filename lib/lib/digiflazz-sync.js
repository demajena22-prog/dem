import "../config.js";
import cron from "node-cron";
import { getPriceList } from "./digiflazz.js";
import { syncDigiflazzProducts } from "./database.js";
import chalk from "./chalk.js";

let syncJob = null;

function log(type, msg) {
  const types = {
    info: `${chalk.blue("[")}${chalk.yellow("i")}${chalk.blue("]")}`,
    success: `${chalk.green("[")}${chalk.yellow("✓")}${chalk.green("]")}`,
    warn: `${chalk.yellow("[")}${chalk.green("!")}${chalk.yellow("]")}`,
    error: `${chalk.red("[")}${chalk.yellow("x")}${chalk.red("]")}`,
  };
  console.log(types[type] || "[ ]", chalk.whiteBright(msg));
}

/**
 * Sync produk dari Digiflazz
 */
async function syncProducts(botId) {
  try {
    log("info", "Memulai sync produk Digiflazz...");

    const priceListResult = await getPriceList();

    if (!priceListResult.success) {
      const isLimit = /limitasi|limit|too many|rate/i.test(String(priceListResult.error || ""));
      log(isLimit ? "warn" : "error", `Gagal ambil price list: ${priceListResult.error}`);
      return;
    }

    // Validate that we got data
    if (!priceListResult.data || !Array.isArray(priceListResult.data)) {
      log("error", `Format data tidak valid: expected array, got ${typeof priceListResult.data}`);
      return;
    }

    const products = priceListResult.data;

    if (products.length === 0) {
      log("warn", "Tidak ada produk dari Digiflazz untuk disync");
      return;
    }

    log("info", `Ditemukan ${products.length} produk dari API Digiflazz`);

    const syncResult = await syncDigiflazzProducts(botId, products);

    if (!syncResult.success) {
      log("error", `Gagal sync produk: ${syncResult.error}`);
      return;
    }

    log(
      "success",
      `Sync berhasil: ${syncResult.data.total} total, ${syncResult.data.inserted} baru, ${syncResult.data.updated} diupdate, ${syncResult.data.deactivated} dinonaktifkan`
    );
  } catch (error) {
    log("error", `Error saat sync produk: ${error.message}`);
    console.error(error.stack);
  }
}

/**
 * Start auto-sync job
 */
export function startDigiflazzSync(bot) {
  if (syncJob) {
    log("warn", "Digiflazz sync job sudah berjalan");
    return;
  }

  const interval = global.digiflazz.syncInterval || 3600000; // Default 1 jam
  const intervalMinutes = Math.floor(interval / 60000);

  // Jalankan sync pertama kali setelah 30 detik
  setTimeout(async () => {
    const info = await bot.getMe();
    await syncProducts(info.id);
  }, 30000);

  // Setup cron job untuk sync berkala
  // Konversi interval ke cron expression
  let cronExpression;
  if (intervalMinutes >= 60) {
    const hours = Math.floor(intervalMinutes / 60);
    cronExpression = `0 */${hours} * * *`; // Setiap X jam
  } else {
    cronExpression = `*/${intervalMinutes} * * * *`; // Setiap X menit
  }

  syncJob = cron.schedule(cronExpression, async () => {
    const info = await bot.getMe();
    await syncProducts(info.id);
  });

  log(
    "success",
    `Digiflazz auto-sync dijadwalkan setiap ${intervalMinutes} menit`
  );
}

/**
 * Stop auto-sync job
 */
export function stopDigiflazzSync() {
  if (syncJob) {
    syncJob.stop();
    syncJob = null;
    log("info", "Digiflazz sync job dihentikan");
  }
}

export default {
  startDigiflazzSync,
  stopDigiflazzSync,
};
