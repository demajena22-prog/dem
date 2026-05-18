import { deleteVoucher } from '../lib/voucher.js';

let handler = async ({ bot, chat_id, text, command, isAdmin }) => {
    if (!isAdmin) return bot.reply(global.mess.admin || global.mess.owner);

    if (!text) {
        return bot.sendMessage(chat_id, esc(`*Format Salah ❗*\nGunakan:\n\`/${command} KODE_VOUCHER\``), {
            parse_mode: "MarkdownV2"
        });
    }

    const code = text.trim().toUpperCase();

    const result = await deleteVoucher(code);

    if (!result.success) {
        return bot.sendMessage(chat_id, esc(`❌ ${result.error}`), {
            parse_mode: "MarkdownV2"
        });
    }

    await bot.sendMessage(chat_id, esc(`*✅ Voucher Berhasil Dihapus*\nKode: \`${code}\``), {
        parse_mode: "MarkdownV2"
    });
};

handler.command = ['delvcr'];
handler.admin = true;

export default handler;
