import "./config.js";
import chalk from "./lib/chalk.js";
import { processingLocks } from "./lib/locks.js";
import { safeDeleteMessage } from "./lib/myfunc.js";
import handleDepositInput from "./plugins/deposit-input.js";
import handleDigiflazzInput from "./plugins/_digiflazz-input.js";
import handleDigiflazzQtyInput from "./plugins/_digiflazz-qty-input.js";
import buttonStyles from "./styles/index.js";
import {
  userRegister,
  checkUser,
  checkDbBot,
  createDbBot,
  dbUser,
  getProductList
} from "./lib/database.js";

const commandRateLimit = new Map();
const userBanTemp = new Map();
const cleanChatMessages = new Map();
const userDataCache = new Map();
const CACHE_TTL = 30000; // 30 detik cache

// Cache bot info agar tidak panggil API setiap pesan
let botInfoCache = null;
async function getCachedBotInfo(bot) {
  if (!botInfoCache) botInfoCache = await bot.getMe();
  return botInfoCache;
}

// Cleanup interval untuk Maps yang tidak punya TTL (setiap 10 menit)
setInterval(() => {
  const maxSize = 5000;
  if (cleanChatMessages.size > maxSize) cleanChatMessages.clear();
  if (keyboardContext.size > maxSize) keyboardContext.clear();
  if (commandRateLimit.size > maxSize) commandRateLimit.clear();
  if (userDataCache.size > maxSize) userDataCache.clear();
  if (global.productButtonContext?.size > maxSize) global.productButtonContext.clear();
  if (global.digiflazzVariantContext?.size > maxSize) global.digiflazzVariantContext.clear();
  if (global.orderPaymentContext?.size > maxSize) global.orderPaymentContext.clear();
  if (global.depositPaymentContext?.size > maxSize) global.depositPaymentContext.clear();

  // Cleanup expired userDataCache entries
  const now = Date.now();
  for (const [key, val] of userDataCache.entries()) {
    if (now - val.timestamp > CACHE_TTL * 10) userDataCache.delete(key);
  }

  // Cleanup stale input states (lebih dari 15 menit)
  if (global.onCustomDeposit) {
    const keys = Object.keys(global.onCustomDeposit);
    if (keys.length > 500) global.onCustomDeposit = {};
  }
  if (global.onInputCart) {
    const keys = Object.keys(global.onInputCart);
    if (keys.length > 500) global.onInputCart = {};
  }
  if (global.onInputVoucher) {
    const keys = Object.keys(global.onInputVoucher);
    if (keys.length > 500) global.onInputVoucher = {};
  }
  if (global.digiflazzInput) {
    const keys = Object.keys(global.digiflazzInput);
    if (keys.length > 500) global.digiflazzInput = {};
  }
  if (global.onInputDigiflazzQty) {
    const keys = Object.keys(global.onInputDigiflazzQty);
    if (keys.length > 500) global.onInputDigiflazzQty = {};
  }
}, 10 * 60 * 1000);



const MAX_COMMANDS = 8;
const TIME_WINDOW = 3000;
const BAN_DURATION = 5000;


const keyboardContext = new Map();
const keyboardHidden = new Set();
const orderContext = global.orderContext || new Map();
global.orderContext = orderContext;
if (!global.orderPaymentContext) global.orderPaymentContext = new Map();
if (!global.depositPaymentContext) global.depositPaymentContext = new Map();
if (!global.digiflazzVariantContext) global.digiflazzVariantContext = new Map();
if (!global.productButtonContext) global.productButtonContext = new Map();

const isRegister = new Set();

// Batasi isRegister agar tidak tumbuh tanpa batas
setInterval(() => {
  if (isRegister.size > 10000) isRegister.clear();
}, 60 * 60 * 1000); // Setiap 1 jam

const keyboardCallbackMap = new Map([
  ["List Produk 🛒", "listproduk"],
  ["List Produk", "listproduk"],
  ["💰 Saldo", "ceksaldo"],
  ["📂 Riwayat Transaksi", "riwayattransaksi"],
  ["Riwayat Transaksi", "riwayattransaksi"],
  ["Produk Populer ✨", "produkpopuler"],
  ["Produk Populer", "produkpopuler"],
  ["Menu Lain ⏩", "menulain"],
  ["Cara Order ❓", "caraorder"],
  ["Cara Order", "caraorder"],
  ["Daftar Stok 📦", "checkstok"],
  ["Sewa Bot 🤖", "infobot"],
  ["Kembali ke Menu ↩️", "main_menu"],
  ["↩️ Kembali ke Menu", "main_menu"],
  ["Menu Utama", "main_menu"],
  ["Menu Admin 👑", "menuadmin"],
  ["🛠️ Kelola Bot", "openadmin"],
  ["🔴 Aktifkan Maintenance", "togglemaintenance"],
  ["🟢 Matikan Maintenance", "togglemaintenance"],
  ["⌨️ Pakai Inline Button", "togglekeyboard"],
  ["🔘 Pakai Keyboard Bawah", "togglekeyboard"],
]);

const mainKeyboard = [
  [{ text: "List Produk 🛒", style: "primary" }, { text: "💰 Saldo", style: "primary" }],
  [{ text: "📂 Riwayat Transaksi", style: "primary" }, { text: "Produk Populer ✨", style: "primary" }],
  [{ text: "Menu Lain ⏩", style: "primary" }],
];

function makeInlineMainKeyboard() {
  return buttonStyles.telegram.createMenuKeyboard([
    { text: "List Produk", icon: "🛒", callback: "listproduk" },
    { text: "Saldo", icon: "💰", callback: "ceksaldo" },
    { text: "Riwayat Transaksi", icon: "📂", callback: "riwayattransaksi" },
    { text: "Produk Populer", icon: "✨", callback: "produkpopuler" },
    { text: "Menu Lain", icon: "⏩", callback: "menulain" }
  ], 2);
}

function normalizeKeyboardRows(rows = []) {
  return rows
    .map((row) => row
      .map((button) => {
        if (typeof button === "string") return { text: button };
        if (!button || !button.text) return null;
        return { text: button.text };
      })
      .filter(Boolean))
    .filter((row) => row.length);
}

function replyToInlineKeyboard(rows = []) {
  const inline = rows
    .map((row) => row
      .map((button) => {
        const text = typeof button === "string" ? button : button?.text;
        if (!text) return null;
        const callbackData = keyboardCallbackMap.get(text);
        if (!callbackData) return null;
        const btn = { text, callback_data: callbackData, style: "primary" };
        if (button?.style) btn.style = button.style;
        return btn;
      })
      .filter(Boolean))
    .filter((row) => row.length);

  return inline.length ? inline : makeInlineMainKeyboard();
}

function inlineToReplyKeyboard(rows = []) {
  return rows
    .map((row) => row
      .map((button) => {
        if (!button?.text) return null;
        if (button.url || button.web_app || button.login_url || button.switch_inline_query) return null;
        const btn = { text: button.text };
        if (button.style) btn.style = button.style;
        return btn;
      })
      .filter(Boolean))
    .filter((row) => row.length);
}

function clearOrderState(from) {
  orderContext.delete(from);
  if (global.orderPaymentContext) global.orderPaymentContext.delete(from);
  if (global.depositPaymentContext) global.depositPaymentContext.delete(from);
  if (global.onInputCart) delete global.onInputCart[from];
  if (global.onInputVoucher) delete global.onInputVoucher[from];
  if (global.onCustomDeposit) delete global.onCustomDeposit[from];
  if (global.onInputDigiflazzQty) delete global.onInputDigiflazzQty[from];
  if (global.digiflazzVariantContext) global.digiflazzVariantContext.delete(from);
}

function readContextCallback(context, label) {
  if (!context) return null;
  if (context instanceof Map) return context.get(label) || null;
  if (context.buttons?.has(label)) return context.buttons.get(label);
  if (context.navigation?.has(label)) return context.navigation.get(label);
  return null;
}

async function resolveKeyboardCallback(body, bot_id, from) {
  const label = String(body || "").trim();
  const normalizedLabel = label.replace(/\s+/g, " ").toLowerCase();
  const isCancelLabel = /batalkan|\bbatal\b|\bcancel\b/.test(normalizedLabel);
  const isTopUpCancel = isCancelLabel && /top\s*-?\s*up|deposit/.test(normalizedLabel);
  if (keyboardCallbackMap.has(label)) return keyboardCallbackMap.get(label);

  if (label === "✅ Sudah Bayar" || label === "Sudah Bayar") {
    const depositCtx = global.depositPaymentContext?.get(from);
    if (depositCtx) {
      return `cekdeposit ${depositCtx.payableAmount} ${depositCtx.refId} ${depositCtx.balanceAmount}`;
    }
    const orderCtx = global.orderPaymentContext?.get(from);
    if (orderCtx?.callbackData) {
      return orderCtx.callbackData;
    }
    return null;
  }

  if (isTopUpCancel) return "canceldeposit";
  if (isCancelLabel && !/voucher/.test(normalizedLabel)) {
    const hasDigiflazzPayment = global.digiflazzInput && ["checkout", "qris_waiting"].includes(global.digiflazzInput[from]?.step);
    if (hasDigiflazzPayment) return "dgf_cancel";
    const hasOrderState = orderContext.has(from) || Boolean(global.orderPaymentContext && global.orderPaymentContext.has(from));
    if (hasOrderState) return "order_cancel";
  }
  const paymentData = global.orderPaymentContext && global.orderPaymentContext.get(from);
  if (paymentData) {
    if (label === "Qris 1⃣" && paymentData.qris) return paymentData.qris;
    if (label === "Balance 2⃣" && paymentData.saldo) return paymentData.saldo;
  }
  const orderData = orderContext.get(from);
  if (orderData) {
    const [key, productId, qtyRaw, voucherCode = "", voucherAmount = "0"] = orderData.split(" ");
    const qty = qtyRaw === "max" ? 1 : Math.max(1, parseInt(qtyRaw) || 1);
    const voucherParam = `${voucherCode || ""} ${voucherAmount || 0}`;
    if (["-1", "+1", "-10", "-5", "+5", "+10"].includes(label)) {
      const nextQty = Math.max(1, qty + parseInt(label));
      return `addcart ${productId} ${nextQty} ${voucherParam}`;
    }
    if (label === "Ketik Jumlah") return `inputcart ${productId}`;
    if (label === "Take All 📦") return `addcart ${productId} max ${voucherParam}`;
    if (label === "Use Voucher 🎫") return `inputvcr ${productId} ${qty}`;
    if (label === "❌ Batalkan Voucher") return `addcart ${productId} ${qty}`;
    if (label === "Qris 1⃣") return null;
    if (label === "Balance 2⃣") return null;
    // Hanya redirect ke selectproduct jika key adalah 'addcart' (sedang proses order aktif)
    if ((label === "Back ↩️" || label === "↩️ Kembali") && key === "addcart") return `selectproduct ${productId}`;
    if (label === "« Back to Order") return `addcart ${productId}`;
  }
  const digiflazzState = global.digiflazzInput && global.digiflazzInput[from];
  if (digiflazzState && ["checkout", "qris_waiting"].includes(digiflazzState.step)) {
    const quantity = Math.max(1, parseInt(digiflazzState.quantity) || 1);
    if (digiflazzState.step === "checkout") {
      if (["-1", "+1", "-10", "-5", "+5", "+10"].includes(label)) {
        return `dgf_checkout current ${Math.max(1, quantity + parseInt(label))}`;
      }
      if (label === "Ketik Jumlah") return "dgf_inputqty";
      if (label === "Qris 1⃣") return `dgf_payqris ${quantity}`;
      if (label === "Balance 2⃣") return `dgf_paybalance ${quantity}`;
    }
    if (label === "↩️ Kembali" || label === "Back ↩️") {
      const product = digiflazzState.product || {};
      return product.category && product.brand ? `dgf_brand ${product.category}|${product.brand}` : "digiflazz";
    }
  }
  const digiflazzVariants = global.digiflazzVariantContext && global.digiflazzVariantContext.get(from);
  if (digiflazzVariants) {
    if (digiflazzVariants.products?.has(label)) return digiflazzVariants.products.get(label);
    if (digiflazzVariants.navigation?.has(label)) return digiflazzVariants.navigation.get(label);
    if (label === "↩️ Kembali" || label === "Back ↩️") return digiflazzVariants.back || "digiflazz";
  }
  const productButtonData = readContextCallback(global.productButtonContext?.get(from), label);
  if (productButtonData) return productButtonData;
  if (/^Saldo\s*:/i.test(label)) return "ceksaldo";
  if (/^Rp\.\s*10,?000$/i.test(label)) return "deposit 10000";
  if (/^Rp\.\s*25,?000$/i.test(label)) return "deposit 25000";
  if (/^Rp\.\s*50,?000$/i.test(label)) return "deposit 50000";
  if (/^Rp\.\s*100,?000$/i.test(label)) return "deposit 100000";
  if (label === "Ketik Nominal Lain") return "customdeposit";
  if (label === "🔄 Refresh") return keyboardContext.get(from) || "listproduk";
  if (label === "Back ↩️") return "listproduk";
  if (label === "↩️ Kembali") return "listproduk";
  const isWaitingOrderQty = global.onInputCart && global.onInputCart[from]?.status === "input_jumlah";
  const isWaitingDeposit = global.onCustomDeposit && (from in global.onCustomDeposit);
  const isWaitingDigiflazzInput = global.digiflazzInput && global.digiflazzInput[from]?.step === "input_number";
  if (/^\d+$/.test(label) && !isWaitingOrderQty && !isWaitingDeposit && !isWaitingDigiflazzInput) return `selcat ${label}`;

  // Cek product name dari productButtonContext (sudah di-cache per user)
  const productData = readContextCallback(global.productButtonContext?.get(from), label);
  if (productData) return productData;

  return null;
}

function normalizeRole(roleInput) {
  const value = String(roleInput == null ? "" : roleInput).trim().toLowerCase();

  if (["admin", "administrator", "owner", "superadmin", "super_admin"].includes(value)) {
    return "admin";
  }

  if (["vip", "premium", "gold"].includes(value)) {
    return "vip";
  }

  return "member";
}

function hasAdminAccess(userData) {
  if (!userData) return false;
  if (userData.isAdmin === true) return true;
  const roleCandidate = userData.role == null ? userData.status : userData.role;
  return normalizeRole(roleCandidate) === "admin";
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

async function safeAnswerCallback(bot, callbackId, options = {}) {
  if (!callbackId) return;
  await bot.answerCallbackQuery(callbackId, options).catch(() => {});
}

function normalizeReplyKeyboardMarkup(replyMarkup, from, { allowReplyKeyboard = true } = {}) {
  if (replyMarkup?.force_reply || replyMarkup?.remove_keyboard) return replyMarkup;

  if (global.use_reply_keyboard) {
    if (!allowReplyKeyboard) return replyMarkup?.inline_keyboard ? replyMarkup : undefined;
    if (replyMarkup?.keyboard) {
      return {
        ...replyMarkup,
        keyboard: normalizeKeyboardRows(replyMarkup.keyboard),
        resize_keyboard: true,
        is_persistent: false,
        one_time_keyboard: false,
      };
    }
    if (replyMarkup?.inline_keyboard) {
      const paymentPattern = /^(cekorder|cekdeposit|dgf_qrcheck|canceldeposit|order_cancel|dgf_cancel)\b/;
      const hasPaymentBtn = replyMarkup.inline_keyboard.some(row =>
        row.some(btn => btn.callback_data && paymentPattern.test(btn.callback_data))
      );
      if (hasPaymentBtn) return replyMarkup;

      const keyboard = inlineToReplyKeyboard(replyMarkup.inline_keyboard);
      if (keyboard.length) {
        return {
          keyboard,
          resize_keyboard: true,
          is_persistent: false,
          one_time_keyboard: false,
        };
      }
      return replyMarkup;
    }
    return {
      keyboard: mainKeyboard,
      resize_keyboard: true,
      is_persistent: false,
      one_time_keyboard: false,
    };
  }

  if (replyMarkup?.inline_keyboard) return replyMarkup;
  if (replyMarkup?.keyboard) return { inline_keyboard: replyToInlineKeyboard(replyMarkup.keyboard) };
  return replyMarkup;
}

function cleanChatKey(chatId, from) {
  return `${chatId}:${from}`;
}

function getCallbackKeys(rows = []) {
  return rows.flatMap((row) => row
    .map((button) => String(button?.callback_data || "").split(" ")[0])
    .filter(Boolean));
}

function getButtonTexts(rows = []) {
  return rows.flatMap((row) => row
    .map((button) => String(button?.text || "").trim())
    .filter(Boolean));
}

function isProtectedCleanKey(key) {
  return new Set([
    "orderqr", "ordersaldo", "cekorder", "order_cancel", "batalorder", "cancelorder",
    "deposit", "cekdeposit", "canceldeposit", "dgf_payqris", "dgf_paybalance",
    "dgf_qrcheck", "dgf_cancel", "dgf_confirm", "order_payqris", "order_paysaldo",
    "deposit_create", "deposit_check", "deposit_cancel", "order_qrcheck",
    "dgf_payqris", "dgf_paybalance", "dgf_qrcheck", "dgf_cancel",
    "riwayattransaksi", "listproduk", "selcat", "checkstok", "listvcr",
    "broadcast", "bc",
  ]).has(key);
}

function shouldDeleteIncomingMessage({ body = "", key = "" } = {}) {
  if (isProtectedCleanKey(key)) return false;
  if (key === "start") return false;
  const text = String(body || "").trim();
  if (!text) return true;
  return !/(status\s*(topup|deposit|transaksi)|trx|txr|produk\s*(dikirim|terkirim)|akun\s*(produk|pesanan))/i.test(text);
}

function shouldTrackCleanMessage(options = {}, originalOptions = options, contextKey = "") {
  if (options.clean_chat === false || originalOptions.clean_chat === false) return false;
  if (isProtectedCleanKey(contextKey)) return false;
  if (contextKey === "start") return false;

  const markup = options.reply_markup;
  const originalMarkup = originalOptions.reply_markup;
  if (markup?.force_reply || markup?.remove_keyboard) return false;

  const keys = [
    ...getCallbackKeys(markup?.inline_keyboard || []),
    ...getCallbackKeys(originalMarkup?.inline_keyboard || []),
  ];
  const labels = [
    ...getButtonTexts(markup?.keyboard || []),
    ...getButtonTexts(originalMarkup?.keyboard || []),
    ...getButtonTexts(markup?.inline_keyboard || []),
    ...getButtonTexts(originalMarkup?.inline_keyboard || []),
  ];
  const protectedLabels = [/qris/i, /bayar/i, /payment/i, /cek\s*(order|deposit|pembayaran)/i, /cancel|batal/i];

  return !keys.some(isProtectedCleanKey) && !labels.some((label) => protectedLabels.some((pattern) => pattern.test(label)));
}

async function trackCleanMessage(bot, from, chatId, messageId, currentMessageId = null) {
  if (!chatId || !messageId) return;

  const key = cleanChatKey(chatId, from);
  const previousMessageId = cleanChatMessages.get(key);
  if (previousMessageId && previousMessageId !== messageId && previousMessageId !== currentMessageId) {
    await safeDeleteMessage(bot, chatId, previousMessageId);
  }
  cleanChatMessages.set(key, messageId);
}

function withConsistentKeyboard(bot, from, cleanContext = {}) {
  const keyboardBot = Object.create(bot);
  keyboardBot.__rawBot = bot.__rawBot || bot;

  const prepareOptions = (options = {}, allowReplyKeyboard = true) => {
    const { skip_keyboard: skipKeyboard, ...cleanOptions } = options || {};
    if (skipKeyboard) return cleanOptions;
    return {
      ...cleanOptions,
      reply_markup: normalizeReplyKeyboardMarkup(cleanOptions.reply_markup, from, { allowReplyKeyboard }),
    };
  };

  keyboardBot.sendMessage = async (chatId, text, options = {}, ...rest) => {
    const nextOptions = prepareOptions(options);
    const result = await bot.sendMessage(chatId, text, nextOptions, ...rest);
    if (cleanContext.enabled && shouldTrackCleanMessage(nextOptions, options, cleanContext.key)) {
      await trackCleanMessage(bot, from, chatId, result?.message_id, cleanContext.currentMessageId);
    }
    return result;
  };

  keyboardBot.sendPhoto = async (chatId, photo, options = {}, ...rest) => {
    const nextOptions = prepareOptions(options);
    const result = await bot.sendPhoto(chatId, photo, nextOptions, ...rest);
    if (cleanContext.enabled && shouldTrackCleanMessage(nextOptions, options, cleanContext.key)) {
      await trackCleanMessage(bot, from, chatId, result?.message_id, cleanContext.currentMessageId);
    }
    return result;
  };

  keyboardBot.editMessageText = async (text, options = {}, ...rest) => {
    const nextOptions = prepareOptions(options, false);
    const result = await bot.editMessageText(text, nextOptions, ...rest);
    if (cleanContext.enabled && shouldTrackCleanMessage(nextOptions, options, cleanContext.key)) {
      await trackCleanMessage(bot, from, nextOptions.chat_id, nextOptions.message_id, cleanContext.currentMessageId);
    }
    return result;
  };

  keyboardBot.editMessageCaption = (caption, options = {}, ...rest) => bot.editMessageCaption(caption, prepareOptions(options, false), ...rest);
  keyboardBot.reply = (text, options = {}) => bot.sendMessage(
    cleanContext.chatId || from,
    esc(text),
    prepareOptions({ parse_mode: "MarkdownV2", ...options })
  );

  return keyboardBot;
}

export default async function (bot, m) {
  try {
    const from = m.from.id;
    const chat_id = m.chat.id;

    const isOwner = global.owner.includes(from);
    let userData = null;

    if (userBanTemp.has(from)) return;

    // Cek cache dulu sebelum query database
    const cachedData = userDataCache.get(from);
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
      userData = cachedData.data;
      if (userData && userData.isBanned) {
        return;
      }
    } else {
      try {
        let userCheck = await dbUser(from);
        if (userCheck.success && userCheck.data) {
          userData = userCheck.data;
          // Simpan ke cache
          userDataCache.set(from, { data: userData, timestamp: Date.now() });
        }
        if (userData && userData.isBanned) {
          return;
        }
      } catch (e) { }
    }

    const isAdmin = isOwner || hasAdminAccess(userData);

    if (global.maintenance && !isAdmin) {
      const body = m.text || m.caption || "";
      if (body.startsWith("/")) {
        return bot.sendMessage(chat_id, esc(`⚠️ *MODE MAINTENANCE*\n\nBot sedang dalam perbaikan, silakan coba lagi nanti.`), { parse_mode: "MarkdownV2" });
      }
      return;
    }

    // Skip rate limit untuk user yang sedang input (deposit/voucher/digiflazz)
    const isInInputState = (global.onCustomDeposit && from in global.onCustomDeposit) ||
      (global.onInputCart && global.onInputCart[from]) ||
      (global.onInputVoucher && global.onInputVoucher[from]) ||
      (global.digiflazzInput && global.digiflazzInput[from]?.step === "input_number") ||
      (global.onInputDigiflazzQty && global.onInputDigiflazzQty[from]);

    if (!isInInputState) {
      let userHistory = commandRateLimit.get(from) || [];
      const now = Date.now();
      userHistory = userHistory.filter(
        (timestamp) => now - timestamp < TIME_WINDOW
      );

    if (userHistory.length >= MAX_COMMANDS) {
      userBanTemp.set(from, now + BAN_DURATION);
      commandRateLimit.delete(from);

      bot.sendMessage(
        chat_id,
        esc(
          `⚠️ *SPAM DETECTED*\n\nAnda mengirim perintah terlalu cepat. Bot tidak akan merespon Anda selama 5 detik.`
        ),
        { parse_mode: "MarkdownV2" }
      );

      setTimeout(async () => {
        userBanTemp.delete(from);
        await bot.sendMessage(
          chat_id,
          esc(`Sekarang Anda sudah bisa mengirim perintah kembali.`),
          { parse_mode: "MarkdownV2" }
        );
      }, BAN_DURATION);

      return;
    }

    userHistory.push(now);
    commandRateLimit.set(from, userHistory);
    } // end rate limit check

    const pushname = m.from.last_name
      ? m.from.first_name + " " + m.from.last_name
      : m.from.first_name;
    const chatname = m.chat.title ? m.chat.title : "-";
    const username = m.from.username ? m.from.username : "None";
    const body = m.text || m.caption || " ";
    const args = body.split(" ").slice(1);
    const text = body.split(" ").slice(1).join(" ");
    const command = body.slice(1).split(" ")[0].toLowerCase();
    const isGroup = m.chat.type ? m.chat.type == "supergroup" : false;
    const message_id = m.message_id;

    if (command === "start") keyboardHidden.delete(from);

    const info_bot = await getCachedBotInfo(bot);
    const bot_username = info_bot.username;
    const bot_id = info_bot.id;
    const bot_name = info_bot.first_name;

    try {
      if (!isRegister.has(from)) {
        const exist = await checkUser(from);
        if (!exist.success) {
          console.log("Error saat cek user: " + exist.error);
        } else if (exist.data) {
          isRegister.add(from);
        } else {

          const create = await userRegister(
            from,
            pushname,
            username === "None" ? null : username
          );
          if (!create.success)
            console.log(
              "Error saat memasukkan User ke database:\n" + create.error
            );
          else isRegister.add(from);
        }
      }

      if (!isRegister.has(bot_id)) {
        const exist = await checkDbBot(bot_id);
        if (!exist.success) {
          console.log("Error saat cek db bot: " + exist.error);
        } else if (exist.data) {
          isRegister.add(bot_id);
        } else {
          const create = await createDbBot(bot_id, bot_name);
          if (!create.success)
            console.log(
              "Error saat menambahkan Bot ke database:\n" + create.error
            );
          else isRegister.add(bot_id);
        }
      }
    } catch (e) {
      (await import("./lib/logger.js")).logger.error("Error in user data handling: " + (e.message || e));
      console.debug(e.stack || e);
    }

    console.log(
      chalk.green("[") + chalk.yellow("i") + chalk.green("]"),
      chalk.whiteBright("MSG"),
      chalk.blue(`${pushname} (${from})`),
      chalk.white(`${body.substring(0, 50)}${body.length > 50 ? '...' : ''}`)
    );

    bot = withConsistentKeyboard(bot, from, {
      enabled: true,
      key: command,
      currentMessageId: message_id,
      chatId: chat_id,
    });

    if (shouldDeleteIncomingMessage({ body, key: command })) {
      await safeDeleteMessage(bot, chat_id, message_id);
    }

    bot.reply = (text) => {
      return bot.sendMessage(chat_id, esc(text), { parse_mode: "MarkdownV2" });
    };

    if (global.onCustomDeposit && (from in global.onCustomDeposit)) {
      await handleDepositInput({
        m,
        bot,
        from,
        isOwner,
        isAdmin,
        chat_id,
        pushname,
        chatname,
        body,
        text,
        args,
        command,
        message_id,
        username,
        bot_id,
        bot_name,
        bot_username,
      });
      return;
    }

    if (global.digiflazzInput && global.digiflazzInput[from]?.step === "input_number") {
      await handleDigiflazzInput({
        m,
        bot,
        from,
        isOwner,
        isAdmin,
        chat_id,
        pushname,
        chatname,
        body,
        text,
        args,
        command,
        message_id,
        username,
        bot_id,
        bot_name,
        bot_username,
      });
      return;
    }

    if (global.onInputDigiflazzQty && global.onInputDigiflazzQty[from]?.status === "input_jumlah_digiflazz") {
      await handleDigiflazzQtyInput({
        m,
        bot,
        from,
        isOwner,
        isAdmin,
        chat_id,
        pushname,
        chatname,
        body,
        text,
        args,
        command,
        message_id,
        username,
        bot_id,
        bot_name,
        bot_username,
      });
      return;
    }

    const keyboardCallbackData = await resolveKeyboardCallback(body, bot_id, from);
    if (keyboardCallbackData) {
      await safeDeleteMessage(bot, chat_id, message_id);
      const callbackData = keyboardCallbackData;
      const key = callbackData.split(" ")[0];
      if (key === "openadmin") {
        const rawBot = Object.getPrototypeOf(bot) || bot;
        await rawBot.sendMessage(chat_id, esc("Klik tombol dibawah untuk membuka panel admin."), {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [[{ text: "🛠️ Kelola Bot", web_app: { url: global.url_admin }, style: "primary" }]],
          },
        });
        return;
      }
      if (global.cbFunction && key in global.cbFunction) {
        if (["listproduk", "selcat", "main_menu", "menulain", "ceksaldo"].includes(key)) keyboardContext.set(from, callbackData);
        if (key === "addcart") orderContext.set(from, callbackData);
        if (["listproduk", "selcat", "selectproduct", "main_menu", "menulain", "ceksaldo", "start"].includes(key)) clearOrderState(from);
        const keyboardBot = withConsistentKeyboard(bot, from, {
          enabled: true,
          key,
          currentMessageId: message_id,
          chatId: chat_id,
        });
        keyboardBot.answerCallbackQuery = async () => true;
        await global.cbFunction[key]({
          bot: keyboardBot,
          from,
          isOwner,
          isAdmin,
          pushname,
          username,
          isGroup,
          nameGc: chatname,
          chat_id,
          data: { id: null, data: callbackData },
          message_id,
          bot_id,
          bot_name,
          bot_username,
          user_id: from,
        });
        if (["ordersaldo", "cekorder"].includes(key)) clearOrderState(from);
      } else if (global.plugins && key in global.plugins) {
        const plugin = global.plugins[key];
        if (plugin.owner && !isOwner) return bot.reply(global.mess.owner);
        if (plugin.admin && !isAdmin) return bot.reply(global.mess.admin || global.mess.owner);
        const keyboardBot = withConsistentKeyboard(bot, from, {
          enabled: true,
          key,
          currentMessageId: message_id,
          chatId: chat_id,
        });
        await plugin({
          m,
          bot: keyboardBot,
          from,
          isOwner,
          isAdmin,
          chat_id,
          pushname,
          chatname,
          body,
          text,
          args,
          command: key,
          message_id,
          username,
          bot_id,
          bot_name,
          bot_username,
        });
      } else {
        await bot.sendMessage(chat_id, esc("⚠️ Tombol ini sudah tidak aktif\. Silakan kembali ke menu utama\."), {
          parse_mode: "MarkdownV2",
          reply_markup: { inline_keyboard: makeInlineMainKeyboard() },
        });
      }
      return;
    }

    if (global.plugins && command in global.plugins) {
      let handlers = global.plugins[command];
      if (handlers.owner && !isOwner) return bot.reply(global.mess.owner);
      if (handlers.admin && !isAdmin) return bot.reply(global.mess.admin || global.mess.owner);
      await handlers({
        m,
        bot,
        from,
        isOwner,
        isAdmin,
        chat_id,
        pushname,
        chatname,
        body,
        text,
        args,
        command,
        message_id,
        username,
        bot_id,
        bot_name,
        bot_username,
      });
    }

    for (let func of global.pluginsAll) {
      if (typeof func == "function") {
        await func({
          m,
          bot,
          from,
          isOwner,
          isAdmin,
          chat_id,
          pushname,
          chatname,
          body,
          text,
          args,
          command,
          message_id,
          username,
          bot_id,
          bot_name,
          bot_username,
        });
      }
    }
  } catch (e) {
    log("error", "Error Plugin");
    console.log(
      chalk.white(`${e.message}\n`) + chalk.yellow(`➜ `),
      chalk.redBright(e.stack)
    );
  }
}

export async function callback(bot, data) {
  const from = data?.from?.id;
  const callbackData = String(data?.data || "");
  const key = callbackData.split(" ")[0];
  const msg = data?.message ? data.message.chat : null;
  const message_id = data?.message ? data.message.message_id : null;
  const processKey = `${from}:${message_id}:${callbackData}`;
  const callbackKeysWithOwnResponse = new Set([
    "cekorder",
    "cekdeposit",
    "dgf_qrcheck",
  ]);

  // Ack seawal mungkin agar tombol Telegram tidak loading saat proses DB/API lambat.
  if (!callbackKeysWithOwnResponse.has(key)) {
    await safeAnswerCallback(bot, data?.id);
  }

  const isOwner = global.owner.includes(from);
  let userData = null;
  let locked = false;

  // Cek cache dulu sebelum query database
  const cachedData = userDataCache.get(from);
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    userData = cachedData.data;
    if (userData && userData.isBanned) {
      return;
    }
  } else {
    try {
      let userCheck = await dbUser(from);
      if (userCheck.success && userCheck.data) {
        userData = userCheck.data;
        // Simpan ke cache
        userDataCache.set(from, { data: userData, timestamp: Date.now() });
      }
      if (userData && userData.isBanned) {
        return;
      }
    } catch (e) { }
  }

  const isAdmin = isOwner || hasAdminAccess(userData);

  if (global.maintenance && !isAdmin) {
    return safeAnswerCallback(bot, data.id, {
      text: "⚠️ Bot sedang dalam maintenance, silakan coba lagi nanti.",
      show_alert: true,
    });
  }

  const isRefresh = callbackData.includes("refresh");

  const isGroup = msg && msg.type ? msg.type == "supergroup" : false;
  const lockTtl = callbackKeysWithOwnResponse.has(key) ? 65000 : 15000;
  locked = processingLocks.lock(processKey, lockTtl);
  if (!locked) {
    return safeAnswerCallback(bot, data.id, {
      text: "Permintaan sedang diproses, mohon tunggu sebentar.",
      show_alert: false,
    });
  }

  const pushname = data.from.last_name
    ? `${data.from.first_name} ${data.from.last_name}`
    : data.from.first_name;
  const username = data.from.username ? data.from.username : "None";


  const nameGc = isGroup ? (msg && msg.title ? msg.title : "Personal Chat") : "Personal Chat";
  const chat_id = msg ? msg.id : null;
  const user_id = data.from.id;

  const info_bot = await getCachedBotInfo(bot);
  const bot_username = info_bot.username;
  const bot_id = info_bot.id;
  const bot_name = info_bot.first_name;

  bot = withConsistentKeyboard(bot, from, {
    enabled: true,
    key,
    currentMessageId: message_id,
    chatId: chat_id,
  });

  console.log(
    chalk.blue("[") + chalk.yellow("i") + chalk.blue("]"),
    chalk.whiteBright("CB"),
    chalk.green(`${pushname} (${from})`),
    chalk.white(`${data.data.substring(0, 40)}${data.data.length > 40 ? '...' : ''}`)
  );

  try {
    if (global.cbFunction && key in global.cbFunction) {
      if (["listproduk", "selcat", "main_menu", "menulain", "ceksaldo"].includes(key)) keyboardContext.set(from, data.data);
      if (key === "addcart") orderContext.set(from, data.data);
      if (["listproduk", "selcat", "selectproduct", "main_menu", "menulain", "ceksaldo", "start"].includes(key)) clearOrderState(from);
      await global.cbFunction[key]({
        bot,
        from,
        isOwner,
        isAdmin,
        pushname,
        username,
        isGroup,
        nameGc,
        chat_id,
        data,
        message_id,
        bot_id,
        bot_name,
        bot_username,
        user_id,
      });
      if (["ordersaldo", "cekorder"].includes(key)) clearOrderState(from);
    } else if (global.plugins && key in global.plugins) {
      const plugin = global.plugins[key];
      if (plugin.owner && !isOwner) {
        return bot.answerCallbackQuery(data.id, { text: global.mess.owner, show_alert: true });
      }
      if (plugin.admin && !isAdmin) {
        return bot.answerCallbackQuery(data.id, { text: global.mess.admin || global.mess.owner, show_alert: true });
      }
      await bot.answerCallbackQuery(data.id).catch(() => {});
      await plugin({
        m: data.message,
        bot,
        from,
        isOwner,
        isAdmin,
        chat_id,
        pushname,
        chatname: nameGc,
        body: `/${key}`,
        text: data.data.split(" ").slice(1).join(" "),
        args: data.data.split(" ").slice(1),
        command: key,
        message_id,
        username,
        bot_id,
        bot_name,
        bot_username,
      });
    } else {
      await safeAnswerCallback(bot, data.id, {
        text: "Tombol ini sudah tidak aktif. Silakan ulangi dari menu.",
        show_alert: true,
      });
    }
  } catch (e) {
    log("error", "Error Callback");
    console.log(
      chalk.white(`${e.message}\n`) + chalk.yellow(`➜ `),
      chalk.redBright(e.stack)
    );
    if (callbackKeysWithOwnResponse.has(key)) {
      await bot.sendMessage(chat_id, "❌ Terjadi kesalahan saat memproses. Silakan coba lagi.").catch(() => {});
    }
    await safeAnswerCallback(bot, data.id, {
      text: "Terjadi kesalahan saat memproses tombol. Silakan coba lagi.",
      show_alert: true,
    });
  } finally {

    if (locked) processingLocks.unlock(processKey);
  }
}
