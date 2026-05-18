import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { editBalance } from "../lib/database.js";
import { safeDeleteMessage } from "../lib/myfunc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOUCHER_FILE = path.join(__dirname, "../src/vouchers.json");

async function loadVouchers() {
  try {
    const data = await fs.readFile(VOUCHER_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    return [];
  }
}

export default async function ({ bot, chat_id, from, body, bot_id, m }) {
  global.onInputVoucher = global.onInputVoucher || {};

  const session = global.onInputVoucher[from];

  if (
    session &&
    session.status === "input_voucher" &&
    m?.reply_to_message?.message_id === session.message_id
  ) {
    const code = body.trim().toUpperCase();
    const now = new Date();

    delete global.onInputVoucher[from];

    const allVouchers = await loadVouchers();
    const voucherIndex = allVouchers.findIndex((v) => v.code === code);

    let errorReplyMarkup = {
      inline_keyboard: [
        [
          {
            text: "Coba Lagi 🔄",
            callback_data: `inputvcr ${session.product_id} ${session.jumlah_pesanan}`,
            style: "primary",
          },
        ],
        [
          {
            text: "Kembali ke Konfirmasi ↩️",
            callback_data: `addcart ${session.product_id} ${session.jumlah_pesanan}`,
            style: "danger",
          },
        ],
      ],
    };

    if (voucherIndex === -1) {
      await bot.sendMessage(
        chat_id,
        esc("❌ Kode voucher *tidak ditemukan*."),
        { parse_mode: "MarkdownV2", reply_markup: errorReplyMarkup }
      );
      return;
    }

    let voucher = allVouchers[voucherIndex];
    if (voucher.used) {
      await bot.sendMessage(
        chat_id,
        esc(
          `❌ Voucher sudah digunakan oleh orang lain.`
        ),
        { parse_mode: "MarkdownV2", reply_markup: errorReplyMarkup }
      );
      return;
    }

    const expiredDate = new Date(voucher.expiredAt);
    if (expiredDate <= now) {
      await bot.sendMessage(
        chat_id,
        esc(
          `❌ Voucher sudah *kedaluwarsa* sejak ${expiredDate.toLocaleDateString(
            "id-ID"
          )}.`
        ),
        { parse_mode: "MarkdownV2", reply_markup: errorReplyMarkup }
      );
      return;
    }

    let successMessage = `✅ KODE VOUCHER *${code}* berhasil diterapkan! Anda mendapatkan diskon sebesar *${rupiah(
      voucher.amount
    )}*.`;
    await bot.sendMessage(chat_id, esc(successMessage), {
      parse_mode: "MarkdownV2",
    });

    await safeDeleteMessage(bot, chat_id, m?.message_id);
    await safeDeleteMessage(bot, chat_id, m?.reply_to_message?.message_id);

    const callbackData = `addcart ${session.product_id} ${session.jumlah_pesanan} ${code} ${voucher.amount}`;
    const targetMessageId = session.message_addcart_id;

    if (targetMessageId) {
      try {
        await bot.editMessageCaption(
          esc(`*Tekan tombol dibawah ini untuk melanjutkan.*`),
          {
            chat_id,
            message_id: targetMessageId,
            parse_mode: "MarkdownV2",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Lanjutkan Konfirmasi Pesanan ✅",
                    callback_data: callbackData,
                    style: "success",
                  },
                ],
              ],
            },
          }
        );
      } catch (e) {
        await bot.sendMessage(
          chat_id,
          esc(`Tekan tombol di bawah untuk melanjutkan konfirmasi pesanan Anda.`),
          {
            parse_mode: "MarkdownV2",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Lanjutkan Konfirmasi Pesanan ✅",
                    callback_data: callbackData,
                    style: "success",
                  },
                ],
              ],
            },
          }
        );
      }
    } else {
      await bot.sendMessage(
        chat_id,
        esc(`Tekan tombol di bawah untuk melanjutkan konfirmasi pesanan Anda.`),
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Lanjutkan Konfirmasi Pesanan ✅",
                  callback_data: callbackData,
                  style: "success",
                },
              ],
            ],
          },
        }
      );
    }
  }
}
