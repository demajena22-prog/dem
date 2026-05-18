import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOUCHER_FILE = path.join(__dirname, '../src/vouchers.json');

async function loadVouchers() {
    try {
        const data = await fs.readFile(VOUCHER_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        console.error("Gagal membaca file voucher:", error);
        return [];
    }
}

async function saveVouchers(vouchers) {
    try {
        await fs.writeFile(VOUCHER_FILE, JSON.stringify(vouchers, null, 2), 'utf-8');
    } catch (error) {
        console.error("Gagal menulis file voucher:", error);
    }
}

let handler = async ({ bot, text, chat_id, command, isAdmin }) => {
    if (!isAdmin) return bot.reply(global.mess.admin || global.mess.owner);

    if (!text) return bot.sendMessage(chat_id, esc(`*Format Voucher Generator ❗*
/${command} _PREFIX, JUMLAH, AMOUNT, EXPIRED_HARI_

*Contoh (10 voucher Rp5000, expired 30 hari):*
/${command} PROMO, 10, 5000, 30`), { parse_mode: "MarkdownV2" });
    
    let parts = text.split(",");
    
    if (parts.length < 4) return bot.sendMessage(chat_id, esc(`*Format Salah ❗*
/${command} _PREFIX, JUMLAH, AMOUNT, EXPIRED_HARI_

*Format harus memiliki 4 parameter (Prefix, Jumlah, Amount, Expired_Hari).*`), { parse_mode: "MarkdownV2" });

    let [prefix, jumlahStr, amountStr, expiredDaysStr] = parts.map(p => p.trim());
    
    const jumlah = parseInt(jumlahStr, 10);
    const amount = parseInt(amountStr, 10);
    const expiredDays = parseInt(expiredDaysStr, 10);

    if (isNaN(jumlah) || jumlah <= 0 || isNaN(amount) || amount <= 0 || isNaN(expiredDays) || expiredDays <= 0) {
        return bot.sendMessage(chat_id, esc(`*Input Angka Tidak Valid ❗*\nJumlah, Nilai (Amount), dan Hari Kedaluwarsa harus berupa angka positif.`), { parse_mode: "MarkdownV2" });
    }

    if (jumlah > 1000) {
        return bot.sendMessage(chat_id, esc(`*Jumlah Terlalu Banyak ❗*\nMaksimal 1000 voucher per generate.`), { parse_mode: "MarkdownV2" });
    }

    const allVouchers = await loadVouchers();
    let newVouchers = [];
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiredDays);

    for (let i = 0; i < jumlah; i++) {
        let code = prefix.toUpperCase() + Math.floor(10000000 + Math.random() * 90000000);
        
        while (allVouchers.some(v => v.code === code)) {
            code = prefix.toUpperCase() + Math.floor(10000000 + Math.random() * 90000000);
        }

        newVouchers.push({
            code: code,
            prefix: prefix.toUpperCase(),
            amount: amount,
            used: false,
            usedBy: null,
            createdAt: new Date().toISOString(),
            expiredAt: expiryDate.toISOString(),
        });
    }

    allVouchers.push(...newVouchers);
    await saveVouchers(allVouchers);

    const voucherList = newVouchers.map(v => `\`${v.code}\``).join('\n');
    
    let caption = `*✅ SUKSES GENERATE VOUCHER*\n\n`;
    caption += `*Jumlah:* ${jumlah} voucher\n`;
    caption += `*Nilai:* ${rupiah(amount)}\n`;
    caption += `*Expired:* ${expiredDays} hari (${expiryDate.toLocaleDateString('id-ID')})\n\n`;
    caption += `*Kode Voucher (${jumlah}x):*\n${voucherList}\n\n`;
    caption += `*Status:* Voucher berhasil disimpan ke database.`;

    await bot.sendMessage(chat_id, esc(caption), { parse_mode: "MarkdownV2" });
};

handler.command = ['buatvcr'];
handler.admin = true;

export default handler;
