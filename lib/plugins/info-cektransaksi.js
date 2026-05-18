import fs from "fs";
import { getTransactionDetails } from "../lib/database.js";

let handler = async ({ bot, chat_id, text, command, from, isAdmin }) => {
  if (!text) {
    return bot.sendMessage(
      chat_id,
      esc(`*Format Penggunaan ❗️*\n\n/${command} *trx_id atau reff_id*`),
      { parse_mode: "MarkdownV2" }
    );
  }

  let reffId = text.trim();
  let result = await getTransactionDetails(reffId);

  if (!result.success) {
    return bot.sendMessage(
      chat_id,
      esc(`❌ Transaksi tidak ditemukan atau ID salah.`),
      { parse_mode: "MarkdownV2" }
    );
  }

  let trx = result.data;

  if (!isAdmin && trx.userId !== from) {
    return bot.sendMessage(
      chat_id,
      esc("❌ Anda tidak memiliki akses ke transaksi ini."),
      { parse_mode: "MarkdownV2" }
    );
  }

  let statusIcon =
    trx.status === "completed" ? "✅" : trx.status === "pending" ? "⏳" : "❌";

  let caption =
    `*📄 DETAIL TRANSAKSI*\n\n` +
    `*ID Reff:* \`${trx.reffId}\`\n` +
    `*Produk:* ${trx.productName}\n` +
    `*Harga:* ${rupiah(trx.price)}\n` +
    `*Jumlah:* ${trx.quantity}\n` +
    `*Total:* ${rupiah(trx.totalAmount)}\n` +
    `*Status:* ${trx.status.toUpperCase()} ${statusIcon}\n` +
    `*Tanggal:* ${new Date(trx.createdAt).toLocaleString("id-ID")}\n`;

  if (trx.snk) {
    caption += `\n*Catatan/SNK:*\n${trx.snk}\n`;
  }

  if (trx.status === "completed" && trx.accounts && trx.accounts.length > 0) {
    let dataAkun = ``;
    trx.accounts.forEach((acc, index) => {
      dataAkun += `${index + 1}. ${acc}\n`;
    });

    let fileNameTemp = `${trx.userId}-${trx.reffId}.txt`;
    let path = `./src/transaksi/terkirim/${fileNameTemp}`;

    try {
      if (!fs.existsSync("./src/transaksi/terkirim")) {
        fs.mkdirSync("./src/transaksi/terkirim", { recursive: true });
      }

      fs.writeFileSync(path, dataAkun);

      await bot.sendDocument(chat_id, path, {
        caption: esc(caption),
        parse_mode: "MarkdownV2",
        file_name: "akun.txt",
      });
    } catch (e) {
      console.error("Gagal membuat/mengirim file akun:", e);
      await bot.sendMessage(
        chat_id,
        esc(caption + "\n\n(Gagal memuat file akun)"),
        { parse_mode: "MarkdownV2" }
      );
    }
  } else {
    await bot.sendMessage(chat_id, esc(caption), {
      parse_mode: "MarkdownV2",
    });
  }
};

handler.command = ["cektrx"];

export default handler;
