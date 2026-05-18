import { 
    addReseller, 
    removeReseller, 
    getResellerList, 
    setResellerPrice, 
    deleteResellerPrice,
    getResellerPrice 
} from "../lib/reseller.js";
import { getProductDetails } from "../lib/database.js";
import { rupiah } from "../lib/myfunc.js";

let handler = async ({ bot, args, chat_id, command, text, bot_id }) => {
    
    if (command === "setreseller") {
        if (!args[0]) return bot.reply(`*Format Salah!*
Gunakan: /setreseller ID_USER
Contoh: /setreseller 123456789`);

        let userId = args[0];
        let res = addReseller(userId);
        if (res) {
            // 1. Beritahu Admin
            await bot.reply(`✅ Berhasil menambahkan user ID \`${userId}\` sebagai Reseller.`);
            
            // 2. Beritahu User (Notifikasi Profesional)
            let userMsg = `🌟 *AKUN RESELLER AKTIF*\n\n` +
                          `Halo Kak,\n` +
                          `Selamat! Akun Anda telah berhasil diupgrade menjadi *RESELLER*.\n\n` +
                          `Nikmati penawaran eksklusif:\n` +
                          `✅ Harga Spesial Reseller\n` +
                          `✅ Prioritas Layanan\n\n` +
                          `Silakan cek kembali menu produk untuk melihat harga terbaru Anda. Terima kasih telah bergabung! 🤝`;
            
            try {
                await bot.sendMessage(userId, esc(userMsg), { parse_mode: "MarkdownV2" });
            } catch (e) {
                await bot.reply(`⚠️ Notifikasi gagal dikirim ke user (Mungkin bot diblokir atau ID salah).`);
            }
            return;
        } else {
            return bot.reply(`⚠️ User ID \`${userId}\` sudah menjadi Reseller.`);
        }
    }

    if (command === "delreseller") {
        if (!args[0]) return bot.reply(`*Format Salah!*
Gunakan: /delreseller ID_USER`);

        let userId = args[0];
        let res = removeReseller(userId);
        if (res) {
            // 1. Beritahu Admin
            await bot.reply(`✅ Berhasil menghapus status Reseller dari user ID \`${userId}\`.`);

            // 2. Beritahu User (Notifikasi Profesional)
            let userMsg = `ℹ️ *INFO STATUS AKUN*\n\n` +
                          `Halo Kak,\n` +
                          `Status *Reseller* pada akun Anda telah dinonaktifkan oleh Admin.\n\n` +
                          `Akun Anda sekarang kembali ke status *Member Regular*. Harga produk akan kembali normal.\n\n` +
                          `Hubungi admin jika Anda memiliki pertanyaan. Terima kasih.`;

            try {
                await bot.sendMessage(userId, esc(userMsg), { parse_mode: "MarkdownV2" });
            } catch (e) {
                await bot.reply(`⚠️ Notifikasi gagal dikirim ke user.`);
            }
            return;
        } else {
            return bot.reply(`⚠️ User ID \`${userId}\` bukan Reseller.`);
        }
    }

    if (command === "listreseller") {
        let list = getResellerList();
        if (list.length === 0) return bot.reply("Belum ada user yang terdaftar sebagai Reseller.");
        
        let caption = `*👥 DAFTAR RESELLER (${list.length})*\n\n`;
        list.forEach((id, index) => {
            caption += `${index + 1}. \`${id}\`\n`;
        });
        
        return bot.sendMessage(chat_id, esc(caption), { parse_mode: "MarkdownV2" });
    }

    if (command === "setprice") {
        if (args.length < 2) return bot.reply(`*Format Salah!*
Gunakan: /setprice KODE_PRODUK HARGA_RESELLER
Contoh: /setprice dmff 10000`);

        let productId = args[0];
        let price = parseInt(args[1]);

        if (isNaN(price)) return bot.reply("Harga harus berupa angka.");

        let checkProd = await getProductDetails(bot_id, productId);
        if (!checkProd.success) return bot.reply(`Produk dengan ID ${productId} tidak ditemukan.`);

        setResellerPrice(productId, price);
        return bot.reply(`✅ Berhasil mengatur harga Reseller untuk produk *${checkProd.data.name} (${productId})* menjadi *${rupiah(price)}*`);
    }

    if (command === "delsetprice") {
        if (!args[0]) return bot.reply(`*Format Salah!*
Gunakan: /delsetprice KODE_PRODUK`);

        let productId = args[0];
        let res = deleteResellerPrice(productId);
        
        if (res) {
            return bot.reply(`✅ Berhasil menghapus harga khusus Reseller untuk produk ${productId}.`);
        } else {
            return bot.reply(`⚠️ Tidak ada harga Reseller yang diatur untuk produk ${productId}.`);
        }
    }
};

handler.command = ["setreseller", "delreseller", "listreseller", "setprice", "delsetprice"];
handler.admin = true;

export default handler;