// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

// ============================================
// ALL CONFIGURATION IS IN .env FILE
// Edit .env file to change any settings
// ============================================

// Bot Configuration
global.botToken = process.env.BOT_TOKEN;

// MongoDB Configuration
global.url_mongodb = process.env.MONGODB_URL;
global.url_mongodb_direct = process.env.MONGODB_URL_DIRECT || "";
global.mongo_dns_servers = ["8.8.8.8", "1.1.1.1"];
global.mongo_dbname = process.env.MONGODB_DBNAME;
global.mongo_pool_size = 20;

// Owner Configuration (parse comma-separated IDs)
global.owner = process.env.OWNER_IDS 
  ? process.env.OWNER_IDS.split(',').map(id => parseInt(id.trim(), 10))
  : [];
global.username_owner = process.env.USERNAME_OWNER;
global.channel_id_owner = process.env.CHANNEL_ID_OWNER;
global.gc_id_owner = process.env.GC_ID_OWNER;

// Store Configuration
global.store_name = process.env.STORE_NAME;
global.zone = process.env.TIMEZONE;
global.url_admin = process.env.URL_ADMIN;
global.url_keyboard_webapp = global.url_admin;

// Payment Gateway Settings
global.paymentgateway = {
  midtrans: process.env.MIDTRANS_ENABLED === 'true',
  pakasir: process.env.PAKASIR_ENABLED === 'true',
  cashify: process.env.CASHIFY_ENABLED === 'true',
  binancepay: process.env.BINANCEPAY_ENABLED === 'true'
};

// PAKASIR
global.pakasir_project = process.env.PAKASIR_PROJECT;
global.pakasir_apikey = process.env.PAKASIR_APIKEY;

// MIDTRANS
global.midtrans_server_key = process.env.MIDTRANS_SERVER_KEY;
global.midtrans_is_production = process.env.MIDTRANS_IS_PRODUCTION === 'true';

// CASHIFY
global.cashify_license_key = process.env.CASHIFY_LICENSE_KEY;
global.cashify_qris_id = process.env.CASHIFY_QRIS_ID;
global.cashify_package_ids = process.env.CASHIFY_PACKAGE_IDS 
  ? process.env.CASHIFY_PACKAGE_IDS.split(',')
  : [];

// BINANCE PAY
global.binancepay_api_key = process.env.BINANCEPAY_API_KEY;
global.binancepay_secret_key = process.env.BINANCEPAY_SECRET_KEY;
global.binancepay_currency = process.env.BINANCEPAY_CURRENCY;
global.binancepay_use_fiat = process.env.BINANCEPAY_USE_FIAT === 'true';
global.binancepay_fiat_currency = process.env.BINANCEPAY_FIAT_CURRENCY;

// DIGIFLAZZ
global.digiflazz = {
  enabled: process.env.DIGIFLAZZ_ENABLED === 'true',
  username: process.env.DIGIFLAZZ_USERNAME,
  apiKey: process.env.DIGIFLAZZ_API_KEY,
  mode: process.env.DIGIFLAZZ_MODE || 'development',
  markupType: process.env.DIGIFLAZZ_MARKUP_TYPE || 'fixed',
  markupValue: parseFloat(process.env.DIGIFLAZZ_MARKUP_VALUE) || 500,
  autoSync: process.env.DIGIFLAZZ_AUTO_SYNC === 'true',
  syncInterval: parseInt(process.env.DIGIFLAZZ_SYNC_INTERVAL) || 3600000,
  webhookUrl: process.env.DIGIFLAZZ_WEBHOOK_URL || '',
};



global.sticker_id = {
  terimakasih: "CAACAgUAAxkBAAIBkmlcuRVWLLUl7wlF56HUveu_k586AAKRDAACD7phVoapfBHQbXkVOAQ",
};

global.command_bot = [
  { command: "start", description: "Mulai Bot" },
  { command: "stok", description: "Daftar Stok" },
  { command: "bot", description: "Info Bot" },
];

global.mess = {
  wait: "_*Tunggu, sedang diproses ...*_",
  done: `𝖣𝗈𝗇𝖾 ✅`,
  grup: "Perintah ini hanya dapat digunakan didalam *Grup*.",
  error: "Terjadi Kesalahan",
  url: "*Link nya mana kak?*",
  owner: `You don't have access to this feature.`,
  admin: "Perintah ini hanya bisa digunakan oleh *Admin.*",
  botAdmin: "Bot harus menjadi admin terlebih dahulu.",
};

global.esc = (text) => {
  if (typeof text !== "string") return "input harus berupa string";
  let char = ["[", "]", "(", ")", "#", "+", "-", "=", "|", "{", "}", ".", "!"];
  let block = ["||"];
  let chatV2 = ["_"];
  text = text.replace(/\\/g, "\\\\");
  const placeholder = "<<BLOCK>>";
  block.forEach((b) => { text = text.replaceAll(b, placeholder); });
  char.forEach((c) => {
    const re = new RegExp(`\\${c}`, "g");
    text = text.replace(re, `\\${c}`);
  });
  chatV2.forEach((c) => {
    const re = new RegExp(`([A-Za-z0-9])\\${c}([A-Za-z0-9])`, "g");
    text = text.replace(re, `$1\\${c}$2`);
  });
  block.forEach((b) => { text = text.replaceAll(placeholder, b); });
  return text;
};

global.rupiah = (data) => {
  return "Rp. " + new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
  }).format(parseInt(data));
};

global.sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

global.createReffIdd = () => {
  let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let reffId = "";
  for (let i = 0; i < 10; i++) {
    reffId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return reffId;
};

global.maintenance = process.env.MAINTENANCE_MODE === 'true' || false;
global.use_reply_keyboard = process.env.USE_REPLY_KEYBOARD === 'true' ? true : false;

global.onAddProduct = {};

// Validation: Check if critical environment variables are set
if (!global.botToken || global.botToken === "REPLACE_BOT_TOKEN") {
  console.error("⚠️  CRITICAL: BOT_TOKEN tidak ditemukan di .env file!");
  console.error("⚠️  Copy .env.example ke .env dan isi dengan token bot Anda.");
}

if (!global.url_mongodb) {
  console.error("⚠️  WARNING: MONGODB_URL tidak ditemukan di .env file!");
}

