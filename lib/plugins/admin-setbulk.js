import { addBulkRule, deleteBulkRule, getBulkRules } from "../lib/bulk_price.js";
import { getProductDetails } from "../lib/database.js";
import { rupiah } from "../lib/myfunc.js";

let handler = async ({ bot, args, bot_id, command }) => {
    
    if (command === "delbulk") {
        if (!args[0]) return bot.reply("Format: /delbulk kode_produk");
        let res = deleteBulkRule(args[0]);
        if (res) return bot.reply(`✅ Sukses menghapus SEMUA settingan bulk price untuk produk: ${args[0]}`);
        return bot.reply(`Gagal: Produk ${args[0]} tidak memiliki settingan bulk price.`);
    }

    
    if (args.length < 3) return bot.reply(`*Format Salah!*
Gunakan: /setbulk kode_produk min_qty harga_satuan

Contoh Multi Level:
1. /setbulk am 10 1000
2. /setbulk am 20 800
3. /setbulk am 50 500

(Otomatis menyesuaikan harga berdasarkan jumlah beli)`);

    let productId = args[0];
    let minQty = parseInt(args[1], 10);
    let bulkPrice = parseInt(args[2], 10);

    if (isNaN(minQty) || isNaN(bulkPrice) || minQty <= 0 || bulkPrice <= 0) return bot.reply("Jumlah dan Harga harus berupa angka positif!");

    
    let checkProd = await getProductDetails(bot_id, productId);
    if (!checkProd.success) return bot.reply(`Produk dengan ID ${productId} tidak ditemukan di database.`);

    
    addBulkRule(productId, minQty, bulkPrice);

    
    let allRules = getBulkRules(productId);
    let listRules = allRules.map(r => `• Min ${r.min} pcs: ${rupiah(r.price)}/pcs`).join("\n");

    bot.reply(`✅ *Sukses Update Bulk Price*

📦 Produk: ${checkProd.data.name} (${productId})

📋 *Daftar Harga Grosir Saat Ini:*
${listRules}`);
};

handler.command = ["setbulk", "delbulk"];
handler.admin = true;

export default handler;