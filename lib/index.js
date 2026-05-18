import "./config.js";
import chalk from "./lib/chalk.js";
let chokidar = null;
try {
  chokidar = (await import("chokidar")).default || (await import("chokidar"));
} catch {
  console.log("[!] chokidar tidak ditemukan, hot-reload dinonaktifkan.");
}
import fs from "fs";
import { fileURLToPath } from "url";
import TelegramBot from "node-telegram-bot-api";
import time from "./lib/datetime.js";
import { connectDB } from "./lib/database.js";
import connect from "tel-connect";
import path from "path";

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const botLockPath = path.join(baseDir, ".bot.pid");

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function releaseBotLock() {
  try {
    if (!fs.existsSync(botLockPath)) return;
    const currentPid = parseInt(fs.readFileSync(botLockPath, "utf8").trim(), 10);
    if (currentPid === process.pid) fs.unlinkSync(botLockPath);
  } catch (_) { }
}

function acquireBotLock() {
  try {
    if (fs.existsSync(botLockPath)) {
      const existingPid = parseInt(fs.readFileSync(botLockPath, "utf8").trim(), 10);
      const isPanel = Boolean(process.env.P_SERVER_UUID || process.env.P_SERVER_ALLOCATION_LIMIT || process.env.PTERODACTYL);

      if (existingPid && existingPid !== process.pid && isPidRunning(existingPid) && !isPanel) {
        log("error", `Bot sudah berjalan (PID ${existingPid}). Hentikan instance lama terlebih dahulu.`);
        return false;
      }

      if (existingPid && existingPid !== process.pid) {
        log("warn", `Lock lama ditemukan (PID ${existingPid}), menimpa dengan PID baru ${process.pid}.`);
      }
    }

    fs.writeFileSync(botLockPath, String(process.pid));
    return true;
  } catch (e) {
    log("error", `Gagal membuat lock bot: ${e.message}`);
    return false;
  }
}

function log(type, msg) {
  const types = {
    info: `${chalk.blue("[")}${chalk.yellow("i")}${chalk.blue("]")}`,
    success: `${chalk.green("[")}${chalk.yellow("✓")}${chalk.green("]")}`,
    warn: `${chalk.yellow("[")}${chalk.green("!")}${chalk.yellow("]")}`,
    error: `${chalk.red("[")}${chalk.yellow("x")}${chalk.red("]")}`,
  };
  console.log(types[type] || "[ ]", chalk.whiteBright(msg));
}

function prettyError(ctx, e) {
  log("error", `ERROR pada ${ctx}`);
  console.error(chalk.red(e.message));
  console.error(chalk.gray(e.stack));
}

async function dynamicImport(path) {
  return import(`${path}?update=${Date.now()}`);
}

async function loadPlugins() {
  global.plugins = {};
  global.pluginsAll = [];

  try {
    const files = fs.readdirSync("./plugins").filter((f) => f.endsWith(".js"));
    for (const file of files) {
      try {
        const mod = await dynamicImport(`./plugins/${file}`);
        const func = mod.default;

        if (func?.command) {
          for (const cmd of func.command) global.plugins[cmd] = func;
        } else if (typeof func === "function") {
          global.pluginsAll.push(func);
        }
      } catch (e) {
        prettyError(`./plugins/${file}`, e);
      }
    }
  } catch (e) {
    prettyError("loadPlugins", e);
  }
}

async function loadCallback() {
  global.cbFunction = {};

  try {
    const files = fs.readdirSync("./callback").filter((f) => f.endsWith(".js"));
    for (const file of files) {
      try {
        const mod = await dynamicImport(`./callback/${file}`);
        const key = mod.default?.key;

        if (key) {
          if (Array.isArray(key)) {
            for (const k of key) {
              global.cbFunction[k] = mod.default;
            }
          } else {
            global.cbFunction[key] = mod.default;
          }
        }
      } catch (e) {
        prettyError(`./callback/${file}`, e);
      }
    }
  } catch (e) {
    prettyError("file callback", e);
  }
}

async function reloadHandler(bot) {
  try {
    const mod = await dynamicImport("./handler.js");
    const handler = mod.default;
    const callback = mod.callback;

    bot.removeAllListeners("message");
    bot.removeAllListeners("callback_query");

    bot.on("message", (m) => handler(bot, m));
    bot.on("callback_query", (d) => callback(bot, d));



  } catch (e) {
    prettyError("reloadHandler", e);
  }
}

const configPath = path.join(baseDir, "config.js");

async function reloadConfig() {
  try {
    await import(`./config.js?update=${Date.now()}`);
    log("info", "File config.js diperbarui");
  } catch (err) {
    prettyError("reloadConfig", err);
  }
}

async function start() {
  if (!acquireBotLock()) return;

  try {
    if (chokidar) chokidar.watch(configPath).on("change", () => reloadConfig());

    try {
      await connectDB();
    } catch (e) {
      prettyError("MongoDB", e);
      log("error", "Startup dibatalkan karena MongoDB belum terhubung.");
      return;
    }

    const bot = new TelegramBot(global.botToken, {
      polling: {
        interval: 500,
        params: {
          timeout: 30,
        },
      },
      request: {
        agentOptions: {
          keepAlive: true,
          family: 4,
          rejectUnauthorized: true,
        },
        timeout: 60000,
        forever: true,
      },
    });

    let restartingPolling = false;
    let lastPollingRestart = 0;

    const transientNetworkPattern =
      /(ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|socket hang up|ETELEGRAM: 50[0-9])/i;

    async function restartPolling(reason) {
      const now = Date.now();
      if (restartingPolling || now - lastPollingRestart < 5000) return;

      restartingPolling = true;
      lastPollingRestart = now;
      log("warn", `Koneksi Telegram terganggu (${reason}), mencoba polling ulang...`);

      try {
        await bot.stopPolling({ cancel: true });
      } catch (_) { }

      await new Promise((resolve) => setTimeout(resolve, 2500));

      try {
        await bot.startPolling({ restart: true });
        log("success", "Koneksi Telegram tersambung kembali.");
      } catch (e) {
        prettyError("Restart polling", e);
      } finally {
        restartingPolling = false;
      }
    }

    bot.on("polling_error", async (err) => {
      const msg = err?.message || "Unknown polling error";

      if (/409 Conflict/i.test(msg)) {
        log("error", "Token bot sedang dipakai di instance lain. Jalankan hanya 1 bot aktif untuk token ini.");
        try {
          await bot.stopPolling({ cancel: true });
        } catch (_) { }
        process.exit(1);
        return;
      }

      if (/401 Unauthorized/i.test(msg)) {
        log("error", "Bot token tidak valid atau sudah di-reset. Periksa botToken di config.js.");
        try {
          await bot.stopPolling({ cancel: true });
        } catch (_) { }
        process.exit(1);
        return;
      }

      if (transientNetworkPattern.test(msg)) {
        await restartPolling(msg.split("\n")[0]);
        return;
      }

      prettyError("Koneksi", err);
    });

    try {
      let data = await bot.setMyCommands(global.command_bot, {
        scope: { type: "default" },
        language_code: "id",
      });
      log("success", "Command bot berhasil diset");
    } catch (e) {
      prettyError("Set command bot", e);
    }

    const info = await bot.getMe();

    log("success", "Starting bot...");
    await new Promise((r) => setTimeout(r, 1500));

    log("warn", "BOT INFO");
    log("info", `➜  Nama      : ${info.first_name}`);
    log("info", `➜  Username  : t.me/${info.username}`);
    log("info", `➜  ID        : ${info.id}`);
    log("info", `➜  Waktu     : ${time.tanggal} ${time.jam}`);
    log("warn", "Bot berhasil terhubung dan siap digunakan.");

    global.plugins = {};
    global.cbFunction = {};
    global.db = {};

    let mod = await dynamicImport("./handler.js");
    let handler = mod.default;
    let callback = mod.callback;

    await loadPlugins();
    await loadCallback();

    // Digiflazz auto sync
    if (global.digiflazz?.enabled && global.digiflazz?.autoSync) {
      const { startDigiflazzSync } = await import('./lib/digiflazz-sync.js');
      startDigiflazzSync(bot);
      log('success', 'Digiflazz auto-sync diaktifkan');
    }

    // Digiflazz transaction polling
    if (global.digiflazz?.enabled) {
      const { startDigiflazzPolling } = await import('./lib/digiflazz-polling.js');
      startDigiflazzPolling(bot);
      log('success', 'Digiflazz transaction polling diaktifkan');
    }

    if (chokidar) {
      chokidar.watch("./handler.js").on("change", async () => {
        log("warn", "Handler diupdate!");
        await reloadHandler(bot);
      });

      chokidar
        .watch(["./plugins", "./callback"], {
          ignored: (p, st) => st?.isFile() && !p.endsWith(".js"),
          persistent: true,
        })
        .on("change", async (path) => {
          log("info", `File ${path} diperbarui`);
          await loadPlugins();
          await loadCallback();
        });
    }

    bot.on("message", (m) => handler(bot, m));
    bot.on("callback_query", (d) => callback(bot, d));
  } catch (e) {
    prettyError("Main bot", e);
    releaseBotLock();
  }
}

process.on("SIGINT", () => {
  releaseBotLock();
  process.exit(0);
});

process.on("SIGTERM", () => {
  releaseBotLock();
  process.exit(0);
});

process.on("exit", () => {
  releaseBotLock();
});

start();
