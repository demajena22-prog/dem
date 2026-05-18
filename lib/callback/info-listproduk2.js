import {
  dbBot,
  dbUser,
  User,
  getDBData,
  getCategory,
} from "../lib/database.js";
import time from "../lib/datetime.js";
import { generateListProdukCard } from "../lib/card-generator.js";
import { rupiah } from "../lib/myfunc.js";


const PER_PAGE = 15;

let handler = async ({
  bot,
  chat_id,
  message_id,
  pushname,
  bot_id,
  data,
  from,
  username = "user",
}) => {
  let get = await getCategory(bot_id);
  let user = await getDBData(dbUser, from);
  let data_bot = await getDBData(dbBot, bot_id);
  if (!user || !data_bot)
    return bot.reply("Gagal memproses perintah, silahkan hubungi owner.");
  if (!get.success) {
    return bot.reply(`*Terjadi Kesalahan ❗️*\n\`${get.error}\``);
  }

  const categories = get.data || {};
  let keys = Object.keys(categories);


  keys.sort((a, b) => {
    const matchA = a.match(/\d+$/);
    const matchB = b.match(/\d+$/);
    const na = parseInt(matchA ? matchA[0] : -1, 10);
    const nb = parseInt(matchB ? matchB[0] : -1, 10);

    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;

    return a.localeCompare(b, "id");
  });


  let page = 1;
  const match = data.data.match(/listproduk\s+(\d+)/i);
  if (match) page = Math.max(1, parseInt(match[1]));

  const totalItems = keys.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));
  if (page > totalPages) page = totalPages;

  const startIndex = (page - 1) * PER_PAGE;
  const endIndex = Math.min(startIndex + PER_PAGE, totalItems);
  const pageKeys = keys.slice(startIndex, endIndex);

  let capt;
  if (totalItems < 1) {
    capt = `*Selamat ${time.salam}, ${pushname} 👋*\n\nKami memohon maaf, saat ini belum terdapat produk yang dapat kami tawarkan karena *Owner* belum melakukan pengisian ulang produk. 😔🙏`;
  } else {
    capt = `*Selamat ${time.salam}, ${pushname}* 👋🏻\n\nBerikut adalah daftar kategori produk yang tersedia:\n`;
    capt += `╭ - - - - - - - - - - - - - - - - - - - ╮\n`;
    let num = startIndex + 1;
    for (let key of pageKeys) {
      capt += `┊ [*${num++}] ${key}*\n`;
    }
    capt += `╰ - - - - - - - - - - - - - - - - - - - ╯`;
  }


  const navRow = [];
  if (page > 1)
    navRow.push({
      text: "‹ Sebelumnya",
      callback_data: `listproduk ${page - 1}`,
      style: "primary",
    });

  if (page < totalPages)
    navRow.push({
      text: "Berikutnya ›",
      callback_data: `listproduk ${page + 1}`,
      style: "primary",
    });

  const keyboardRows = [];
  const cols = 5;
  keyboardRows.push([
    { text: "List Produk" },
    { text: "Saldo: " + rupiah(user.balance) },
  ]);

  for (let i = 0; i < totalItems; i += cols) {
    const row = keys.slice(i, i + cols).map((k, idx) => {
      const globalIndex = i + idx + 1;
      return { text: `${globalIndex}` };
    });
    keyboardRows.push(row);
  }

  keyboardRows.push([{ text: "Riwayat Transaksi" }]);
  keyboardRows.push([{ text: "Produk Populer" }, { text: "Cara Order" }]);


  await bot.sendMessage(chat_id, esc(`*Halo* @${username}`), {
    parse_mode: "MarkdownV2",
    reply_markup: {
      keyboard: keyboardRows,
      resize_keyboard: true,
      is_persistent: true,
      one_time_keyboard: false,
      input_field_placeholder: "Pilih fitur dari tombol keyboard",
    },
  });
  const cardBuf = await generateListProdukCard({
    bot, from,
    pushname,
    storeName: global.store_name,
    salam: time.salam,
    categories: pageKeys.map((k, i) => ({ num: startIndex + i + 1, name: k })),
    page,
    totalPages
  });

  const photoOptions = {
    caption: esc(capt),
    parse_mode: "MarkdownV2",
    file_name: 'card.png',
    contentType: 'image/png',
  };
  if (navRow.length > 0) photoOptions.reply_markup = { inline_keyboard: [navRow] };

  await bot.sendPhoto(chat_id, cardBuf, photoOptions);
};

handler.key = "listproduk2";

export default handler;
