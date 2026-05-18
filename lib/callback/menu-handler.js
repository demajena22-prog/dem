import {
  dbUser,
  getProdukPopuler,
  dbBot,
  getBotSimple,
  User,
  getAdminStats,
} from "../lib/database.js";
import time from "../lib/datetime.js";
import { getDailyStats } from "../lib/daily_stats.js";
import { generateStartCard, generateSaldoCard, generateMenuCard, generateInfoCard, generateAdminCard, generateCaraOrderCard, generatePopulerCard, editWithCard } from "../lib/card-generator.js";
import buttonStyles from "../styles/index.js";

const mainKeyboard = [
  [{ text: "List Produk 🛒", style: "primary" }, { text: "💰 Saldo", style: "primary" }],
  [{ text: "📂 Riwayat Transaksi", style: "primary" }, { text: "Produk Populer ✨", style: "primary" }],
  [{ text: "Menu Lain ⏩", style: "primary" }],
];

const mainInlineKeyboard = buttonStyles.telegram.createMenuKeyboard([
  { text: "List Produk", icon: "🛒", callback: "listproduk" },
  { text: "Saldo", icon: "💰", callback: "ceksaldo" },
  { text: "Riwayat Transaksi", icon: "📂", callback: "riwayattransaksi" },
  { text: "Produk Populer", icon: "✨", callback: "produkpopuler" },
  { text: "Menu Lain", icon: "⏩", callback: "menulain" }
], 2);

const otherMenuKeyboard = (isAdmin = false) => {
  const keyboard = [
    [{ text: "Cara Order ❓", style: "primary" }, { text: "Daftar Stok 📦", style: "primary" }],
    [{ text: "Sewa Bot 🤖", style: "primary" }, { text: "Kembali ke Menu ↩️", style: "danger" }],
  ];
  if (isAdmin) keyboard.push([{ text: "Menu Admin 👑", style: "primary" }]);
  return keyboard;
};

const otherMenuInlineKeyboard = (isAdmin = false) => {
  const menuItems = [
    { text: "Cara Order", icon: "❓", callback: "caraorder" },
    { text: "Daftar Stok", icon: "📦", callback: "checkstok" },
    { text: "Sewa Bot", icon: "🤖", callback: "infobot" }
  ];

  const keyboard = buttonStyles.telegram.createMenuKeyboard(menuItems, 2);
  keyboard.push([buttonStyles.telegram.backButton("Kembali ke Menu", "main_menu")]);

  if (isAdmin) {
    keyboard.push([{ text: "👑 Menu Admin", callback_data: "menuadmin", style: "primary" }]);
  }

  return keyboard;
};

const depositKeyboard = [
  [{ text: "Rp. 10,000", style: "success" }, { text: "Rp. 25,000", style: "success" }],
  [{ text: "Rp. 50,000", style: "success" }, { text: "Rp. 100,000", style: "success" }],
  [{ text: "Ketik Nominal Lain", style: "primary" }],
  [{ text: "Kembali ke Menu ↩️", style: "danger" }],
];

const depositInlineKeyboard = [
  [
    { text: "Rp. 10,000", callback_data: "deposit 10000", style: "success" },
    { text: "Rp. 25,000", callback_data: "deposit 25000", style: "success" }
  ],
  [
    { text: "Rp. 50,000", callback_data: "deposit 50000", style: "success" },
    { text: "Rp. 100,000", callback_data: "deposit 100000", style: "success" }
  ],
  [{ text: "Ketik Nominal Lain", callback_data: "customdeposit", style: "primary" }],
  [buttonStyles.telegram.backButton("Kembali ke Menu", "main_menu")]
];

function modeMarkup(replyKeyboard, inlineKeyboard) {
  return global.use_reply_keyboard
    ? { keyboard: replyKeyboard, resize_keyboard: true, is_persistent: false, one_time_keyboard: false }
    : { inline_keyboard: inlineKeyboard };
}

const keyboardToggleButton = () => ({
  text: global.use_reply_keyboard ? "⌨️ Pakai Inline Button" : "🔘 Pakai Keyboard Bawah",
});

function adminKeyboard() {
  return [
    [{ text: "🛠️ Kelola Bot", web_app: { url: global.url_admin }, style: "primary" }],
    [{ text: global.maintenance ? "🟢 Matikan Maintenance" : "🔴 Aktifkan Maintenance", style: "danger" }],
    [{ ...keyboardToggleButton(), style: "primary" }],
    [{ text: "Menu Lain ⏩", style: "primary" }],
  ];
}

function adminInlineKeyboard() {
  return [
    [{ text: "🛠️ Kelola Bot", web_app: { url: global.url_admin }, style: "primary" }],
    [{
      text: global.maintenance ? "🟢 Matikan Maintenance" : "🔴 Aktifkan Maintenance",
      callback_data: "togglemaintenance",
      style: global.maintenance ? "success" : "danger"
    }],
    [{ text: keyboardToggleButton().text, callback_data: "togglekeyboard", style: "primary" }],
    [{ text: "⏩ Menu Lain", callback_data: "menulain", style: "primary" }],
  ];
}

let handler = async ({
  bot,
  chat_id,
  message_id,
  from,
  isAdmin,
  data,
  pushname,
  bot_id,
  username,
  bot_username,
}) => {
  const type = data.data;

  if (type === "main_menu") {
    let userResult = await dbUser(from);
    let botResult = await dbBot(bot_id);
    if (!userResult.success || !userResult.data || !botResult.success || !botResult.data) {
      return bot.sendMessage(chat_id, esc("⚠️ Gagal memuat menu utama\. Silakan coba /start lagi\."), {
        parse_mode: "MarkdownV2",
        reply_markup: modeMarkup(mainKeyboard, mainInlineKeyboard),
      });
    }
    let user = userResult.data;
    let data_bot = botResult.data;
    const nowTime = await time();
    let total_user = await User.countDocuments();
    const totalPcs = data_bot.terjual || 0;
    const totalRevenue = data_bot.total_nominal_transaksi || 0;

    const cardBuf = await generateStartCard({
      bot, from, pushname, username,
      balance: rupiah(user.balance),
      totalBeli: user.membeli,
      totalTransaksi: rupiah(user.total_nominal_transaksi),
      botTerjual: totalPcs,
      botRevenue: rupiah(totalRevenue),
      totalUsers: total_user,
      storeName: global.store_name,
      tanggal: nowTime.tanggal,
      jam: nowTime.jam
    });

    let caption = `*Sortcuts :*
/start – Mulai Bot
/stok – Cek Stok Produk
/info – Info Bot`;

    await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), modeMarkup(mainKeyboard, mainInlineKeyboard));
  } else if (type === "ceksaldo") {
    let user = await dbUser(from);
    if (!user.success)
      return bot.answerCallbackQuery(data.id, {
        text: "Gagal mengambil data user.",
        show_alert: true,
      });

    let res = user.data;

    const cardBuf = await generateSaldoCard({
      bot, from, pushname,
      balance: rupiah(res.balance),
      totalBeli: res.membeli || 0,
      totalTransaksi: rupiah(res.total_nominal_transaksi || 0),
      storeName: global.store_name
    });

    let caption = `Pilih nominal top\-up dibawah ini:`;

    await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), modeMarkup(depositKeyboard, depositInlineKeyboard));
  } else if (type === "produkpopuler") {
    let dataProd = await getProdukPopuler(bot_id, 10);
    if (!dataProd.success)
      return bot.answerCallbackQuery(data.id, {
        text: "Gagal mengambil data produk populer.",
        show_alert: true,
      });

    let items = dataProd.data;

    const cardBuf = await generatePopulerCard({
      from,
      storeName: global.store_name,
      items: items.map(it => ({
        name: it.productName, sold: it.totalSold, revenue: rupiah(it.totalRevenue)
      }))
    });

    let caption = `Produk paling populer berdasarkan penjualan`;

    await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), modeMarkup(
      [[{ text: "List Produk 🛒" }], [{ text: "Kembali ke Menu ↩️" }]],
      [[{ text: "List Produk 🛒", callback_data: "listproduk", style: "primary" }], [{ text: "Kembali ke Menu ↩️", callback_data: "main_menu", style: "danger" }]]
    ));
  } else if (type === "caraorder") {
    const cardBuf = await generateCaraOrderCard({ from, storeName: global.store_name });

    let caption = `Hubungi kami jika ada pertanyaan`;

    await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), modeMarkup(
      [[{ text: "List Produk 🛒" }], [{ text: "Menu Lain ⏩" }]],
      [[{ text: "List Produk 🛒", callback_data: "listproduk", style: "primary" }], [{ text: "Menu Lain ⏩", callback_data: "menulain", style: "primary" }]]
    ));
  } else if (type === "menulain") {
    const cardBuf = await generateMenuCard({ bot, from, pushname, storeName: global.store_name });

    let caption = `Pilih menu dibawah ini`;

    let buttons = [
      [
        { text: "Cara Order ❓", callback_data: "caraorder", style: "primary" },
        { text: "Daftar Stok 📦", callback_data: "checkstok", style: "primary" },
      ],
      [
        { text: "Sewa Bot 🤖", callback_data: "infobot", style: "primary" },
        { text: "Kembali ke Menu ↩️", callback_data: "main_menu", style: "danger" },
      ],
    ];

    if (isAdmin) {
      buttons.push([{ text: "Menu Admin 👑", callback_data: "menuadmin", style: "primary" }]);
    }

    await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), modeMarkup(otherMenuKeyboard(isAdmin), otherMenuInlineKeyboard(isAdmin)));
  } else if (type === "infobot") {
    const cardBuf = await generateInfoCard({
      from,
      owner: global.username_owner,
      channel: global.channel_id_owner,
      developer: 'rifalosid',
      price: 'Rp35.000/bulan',
      storeName: global.store_name
    });

    let caption = `Hubungi owner untuk info lebih lanjut`;

    await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), modeMarkup(
      [[{ text: "Menu Lain ⏩" }], [{ text: "Kembali ke Menu ↩️" }]],
      [[{ text: "Menu Lain ⏩", callback_data: "menulain", style: "primary" }], [{ text: "Kembali ke Menu ↩️", callback_data: "main_menu", style: "danger" }]]
    ));
  } else if (type === "menuadmin") {
    if (!isAdmin)
      return bot.answerCallbackQuery(data.id, {
        text: global.mess.admin || global.mess.owner,
        show_alert: true,
      });

    try {
      let statsRes = await getAdminStats(bot_id);
      let stats = statsRes.success
        ? statsRes.data
        : {
          totalUsers: 0,
          totalTransactions: 0,
          totalProducts: 0,
          totalRevenue: 0,
          totalProductsSold: 0,
        };

      let dailyStats = getDailyStats();
      const nowTime = await time();

      const cardBuf = await generateAdminCard({
        bot, from, pushname,
        botId: bot_id,
        botUsername: bot_username,
        tanggal: nowTime.tanggal,
        jam: nowTime.jam,
        maintenance: global.maintenance,
        dailyPcs: dailyStats.pcs,
        dailyRevenue: rupiah(dailyStats.revenue),
        totalSold: stats.totalProductsSold,
        totalRevenue: rupiah(stats.totalRevenue),
        totalUsers: stats.totalUsers,
        totalProducts: stats.totalProducts,
        storeName: global.store_name
      });

      let caption = `*Menu Admin :*
└ /addsaldo – Tambah Saldo User
└ /cutsaldo – Potong Saldo User
└ /listvcr – Daftar Voucher
└ /buatvcr – Buat Voucher Baru
└ /ban · /unban · /cektrx
└ /setbulk · /delbulk
└ /setreseller · /delreseller
└ /listreseller · /setprice · /delsetprice
`;

      await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), modeMarkup(adminKeyboard(), adminInlineKeyboard()));
    } catch (e) {
      (await import("../lib/logger.js")).logger.error(
        "Error menu admin: " + (e.message || e)
      );
      console.debug(e.stack || e);
      bot.answerCallbackQuery(data.id, {
        text: "Terjadi kesalahan saat memuat menu admin.",
        show_alert: true,
      });
    }
  } else if (type === "togglemaintenance") {
    if (!isAdmin)
      return bot.answerCallbackQuery(data.id, {
        text: global.mess.admin || global.mess.owner,
        show_alert: true,
      });

    global.maintenance = !global.maintenance;

    await bot.answerCallbackQuery(data.id, {
      text: global.maintenance
        ? "⚠️ Maintenance mode AKTIF. User tidak bisa menggunakan bot."
        : "✅ Maintenance mode NONAKTIF. Bot kembali normal.",
      show_alert: true,
    });

    // Refresh admin menu to update button text
    try {
      let statsRes = await getAdminStats(bot_id);
      let stats = statsRes.success
        ? statsRes.data
        : { totalUsers: 0, totalTransactions: 0, totalProducts: 0, totalRevenue: 0, totalProductsSold: 0 };

      let dailyStats = getDailyStats();
      const nowTime = await time();

      const cardBuf2 = await generateAdminCard({
        bot, from, pushname,
        botId: bot_id, botUsername: bot_username,
        tanggal: nowTime.tanggal, jam: nowTime.jam,
        maintenance: global.maintenance,
        dailyPcs: dailyStats.pcs, dailyRevenue: rupiah(dailyStats.revenue),
        totalSold: stats.totalProductsSold, totalRevenue: rupiah(stats.totalRevenue),
        totalUsers: stats.totalUsers, totalProducts: stats.totalProducts,
        storeName: global.store_name
      });

      let caption = `*Menu Admin :*
└ /addsaldo · /cutsaldo · /listvcr · /buatvcr
└ /ban · /unban · /cektrx · /setbulk · /delbulk
`;

      await editWithCard(bot, chat_id, message_id, cardBuf2, esc(caption), modeMarkup(adminKeyboard(), adminInlineKeyboard()));
    } catch (e) {
      console.error("Error refresh after toggle maintenance:", e);
    }
  } else if (type === "togglekeyboard") {
    if (!isAdmin)
      return bot.answerCallbackQuery(data.id, {
        text: global.mess.admin || global.mess.owner,
        show_alert: true,
      });

    global.use_reply_keyboard = !global.use_reply_keyboard;

    await bot.answerCallbackQuery(data.id, {
      text: global.use_reply_keyboard
        ? "✅ Mode keyboard bawah aktif."
        : "✅ Mode inline button aktif.",
      show_alert: true,
    });

    if (global.use_reply_keyboard) {
      // Switch ke keyboard bawah: langsung tampilkan reply keyboard
      await bot.sendMessage(
        chat_id,
        esc(`✅ Mode keyboard bawah aktif.\nKeyboard sudah ditampilkan dibawah.`),
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            keyboard: mainKeyboard,
            resize_keyboard: true,
            is_persistent: true,
            one_time_keyboard: false,
          },
        }
      );
    } else {
      // Switch ke inline button: hapus reply keyboard dulu, lalu tampilkan inline
      await bot.sendMessage(
        chat_id,
        esc(`✅ Mode inline button aktif.\nKeyboard bawah sudah dihapus.`),
        {
          parse_mode: "MarkdownV2",
          reply_markup: { remove_keyboard: true },
        }
      );
      await bot.sendMessage(
        chat_id,
        esc(`Silahkan pilih menu:`),
        {
          parse_mode: "MarkdownV2",
          reply_markup: { inline_keyboard: mainInlineKeyboard },
        }
      );
    }
  }
};

handler.key = [
  "ceksaldo",
  "produkpopuler",
  "caraorder",
  "main_menu",
  "menulain",
  "infobot",
  "menuadmin",
  "togglemaintenance",
  "togglekeyboard",
];

export default handler;
