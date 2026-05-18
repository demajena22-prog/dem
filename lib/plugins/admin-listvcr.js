import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import moment from "moment-timezone";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOUCHER_FILE = path.join(__dirname, "../src/vouchers.json");

const ITEMS_PER_PAGE = 5;

async function loadVouchers() {
    try {
        const data = await fs.readFile(VOUCHER_FILE, "utf-8");
        const vouchers = JSON.parse(data);
        return vouchers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (err) {
        if (err.code === "ENOENT") return [];
        return [];
    }
}

let handler = async ({ bot, text, chat_id, isAdmin }) => {
    if (!isAdmin)
        return bot.reply(global.mess.admin || global.mess.owner);

    const allVouchers = await loadVouchers();
    if (!allVouchers.length)
        return bot.reply("Daftar voucher kosong.");

    const page = Math.max(1, parseInt(text?.trim()) || 1);
    const totalItems = allVouchers.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

    const vouchersPage = allVouchers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    let caption = `*🎫 DAFTAR VOUCHER (${totalItems} Total)*\n\n`;

    vouchersPage.forEach((v, i) => {
        const num = startIndex + i + 1;
        const status = v.used
            ? `*Digunakan ⭕️*\n➜ ID Pengguna : \`${v.usedBy}\``
            : `*Tersedia ✅*`;

        caption += `*${num}. \`${v.code}\`*\n`;
        caption += `➜ Nilai: ${rupiah(v.amount)}\n`;
        caption += `➜ Status: ${status}\n`;

        
        if (!v.used) {
            const expiredDate = moment(v.expiredAt).tz(global.zone);
            const isExpired = expiredDate.isBefore(moment().tz(global.zone));

            caption += `➜ ${
                isExpired
                    ? `Sudah Kadaluarsa (${expiredDate.format("DD/MM HH:mm")}) ❌`
                    : `_Berlaku Hingga ${expiredDate.format("DD/MM HH:mm")}_`
            }\n`;
        }

        caption += `\n`;
    });

    caption += `_Halaman ${currentPage} dari ${totalPages}_`;

    const rows = [];
    if (currentPage > 1)
        rows.push({ text: "◀️ Sebelumnya", callback_data: `listvcr ${currentPage - 1}`, style: "primary" });
    if (currentPage < totalPages)
        rows.push({ text: "Berikutnya ▶️", callback_data: `listvcr ${currentPage + 1}`, style: "primary" });

    const markup = {
        inline_keyboard: rows.length ? [rows] : []
    };

    return bot.sendMessage(chat_id, esc(caption), {
        parse_mode: "MarkdownV2",
        reply_markup: markup
    });
};

handler.command = ["listvcr"];
handler.admin = true;

export default handler;
