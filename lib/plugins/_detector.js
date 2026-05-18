import { dbUser, updateUserProfile } from "../lib/database.js";

let handler = async ({ bot, m, from, pushname, username, chat_id }) => {
    if (m.from.is_bot) return;

    let userRes = await dbUser(from);
    if (!userRes.success || !userRes.data) return;

    let user = userRes.data;
    let dbName = user.name;
    let dbUsername = user.username;
    let newUsername = username === "None" ? null : username;
    
    let isChanged = false;

    
    if (newUsername && dbUsername !== newUsername) {
        let before = dbUsername ? `@${dbUsername}` : '(Tidak ada)';
        let after = `@${newUsername}`;
        await bot.sendMessage(chat_id, esc(`Pengguna \`${from}\` telah mengubah Username dari \`${before}\` menjadi \`${after}\``), { parse_mode: "MarkdownV2" });
        isChanged = true;
    }

    
    if (pushname && dbName !== pushname) {
        let before = dbName;
        let after = pushname;
        await bot.sendMessage(chat_id, esc(`Pengguna \`${from}\` telah mengubah Nama dari \`${before}\` menjadi \`${after}\``), { parse_mode: "MarkdownV2" });
        isChanged = true;
    }

    
    if (isChanged) {
        await updateUserProfile(from, pushname, newUsername);
    }
};

export default handler;
