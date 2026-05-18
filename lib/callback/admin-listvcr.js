import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import moment from "moment-timezone";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOUCHER_FILE = path.join(__dirname, "../src/vouchers.json");
const ITEMS_PER_PAGE = 5;

let handler = async ({ bot, chat_id, message_id, data, isAdmin }) => {
    if (!isAdmin)
        return bot.reply(global.mess.admin || global.mess.owner);

    let vouchers = [];
    try {
        const file = await fs.readFile(VOUCHER_FILE, "utf-8");
        vouchers = JSON.parse(file).sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
    } catch {}

    if (!vouchers.length)
        return bot.sendMessage(chat_id, "Daftar voucher kosong.");

    const page = Math.max(1, parseInt(data.data.split(" ")[1]) || 1);
    const totalItems = vouchers.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    const start = (page - 1) * ITEMS_PER_PAGE;
    const list = vouchers.slice(start, start + ITEMS_PER_PAGE);

    let caption = `*🎫 DAFTAR VOUCHER (${totalItems} Total)*\n\n`;

    list.forEach((v, i) => {
        const num = start + i + 1;
        const status = v.used ? `*Digunakan ⭕️*\n➜  ID Pengguna : \`${v.usedBy}\`` : `*Tersedia ✅*`;

        const expired = moment(v.expiredAt).tz(global.zone);
        const isExpired = expired.isBefore(moment().tz(global.zone));

        caption += `*${num}. \`${v.code}\`*\n`;
        caption += `➜ Nilai: ${rupiah(v.amount)}\n`;
        caption += `➜ Status: ${status}\n`;
        caption += `➜ ${
            isExpired
                ? `Sudah Kadaluarsa (${expired.format("DD/MM HH:mm")}) ❌`
                : `Berlaku Hingga ${expired.format("DD/MM HH:mm")} 🟢`
        }\n\n`;
    });

    caption += `_Halaman ${page} dari ${totalPages}_`;

    const rows = [];
    if (page > 1) rows.push({ text: "◀️ Sebelumnya", callback_data: `listvcr ${page - 1}`, style: "primary" });
    if (page < totalPages) rows.push({ text: "Berikutnya ▶️", callback_data: `listvcr ${page + 1}`, style: "primary" });

    const markup = { inline_keyboard: rows.length ? [rows] : [] };

    const payload = {
        chat_id,
        parse_mode: "MarkdownV2",
        reply_markup: markup
    };

    if (message_id)
        return bot.editMessageText(esc(caption), { ...payload, message_id });

    return bot.sendMessage(chat_id, esc(caption), payload);
};

handler.key = "listvcr";
handler.admin = true;

export default handler;
