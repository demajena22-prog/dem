import { editBalance, dbUser } from '../lib/database.js';

let handler = async ({ bot, chat_id, body, command }) => {
    let parts = body.split(' ');
    let [id_user, amount] = parts.slice(1);
    amount = parseInt(amount, 10);

    if (!id_user || !amount) {
        return bot.sendMessage(
            chat_id,
            esc('*Format salah* ❗️\nGunakan:\n`/addsaldo user_id jumlah`\n`/cutsaldo user_id jumlah`'),
            { parse_mode: 'MarkdownV2' }
        );
    }

    if (isNaN(amount) || amount <= 0) {
        return bot.sendMessage(chat_id, 'Jumlah saldo tidak valid ❗️', {
            parse_mode: 'MarkdownV2'
        });
    }

    let userResult = await dbUser(+id_user);
    if (!userResult.success || !userResult.data) {
        return bot.sendMessage(chat_id, 'User tidak ditemukan ❗️', {
            parse_mode: 'MarkdownV2'
        });
    }

    let user = userResult.data;

    let isCut = command === 'cutsaldo';
    if (isCut && user.balance < amount) {
        return bot.sendMessage(chat_id, '❗️ Saldo user tidak mencukupi untuk dipotong.', {
            parse_mode: 'MarkdownV2'
        });
    }

    let finalAmount = isCut ? -amount : amount;
    let result = await editBalance(+id_user, finalAmount);

    if (!result.success) {
        return bot.sendMessage(chat_id, `❗️ ${result.error}`, { parse_mode: "MarkdownV2" });
    }

    let text = isCut
        ? `*✅ Berhasil mengurangi saldo*\n\n— *User ID:* \`${id_user}\`\n— *Jumlah Dikurangi:* ${rupiah(amount)}\n— *Saldo Sekarang:* ${rupiah(result.data.balance)}`
        : `*✅ Berhasil menambahkan saldo*\n\n— *User ID:* \`${id_user}\`\n— *Jumlah Ditambahkan:* ${rupiah(amount)}\n— *Saldo Sekarang:* ${rupiah(result.data.balance)}`;

    return bot.sendMessage(chat_id, esc(text), {
        parse_mode: 'MarkdownV2'
    });
};

handler.command = ['addsaldo', 'cutsaldo'];
handler.admin = true;

export default handler;
