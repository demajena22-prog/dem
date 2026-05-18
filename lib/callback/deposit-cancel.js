import { safeDeleteMessage } from "../lib/myfunc.js";

const safeEsc = (text) => (typeof global.esc === "function" ? global.esc(text) : String(text));

async function answerCancel(bot, data) {
    if (!data?.id) return;
    await bot.answerCallbackQuery(data.id, {
        text: "Top-up berhasil dibatalkan.",
        show_alert: true,
    }).catch(() => {});
}

async function deleteOrNotify(bot, chat_id, message_id) {
    const text = safeEsc("❌ *Top-Up Dibatalkan*\n\nAnda dapat membuat top-up baru kapan saja.");

    await safeDeleteMessage(bot, chat_id, message_id, { logUnexpected: false });

    if (chat_id) {
        await bot.sendMessage(chat_id, text, { parse_mode: "MarkdownV2" }).catch(() => {});
    }
}

function clearDepositState(from) {
    if (global.onCustomDeposit && from in global.onCustomDeposit) delete global.onCustomDeposit[from];
    if (global.depositPaymentContext) global.depositPaymentContext.delete(from);
}

function getStoredDepositMessage(from) {
    const paymentData = global.depositPaymentContext?.get(from);
    return {
        chatId: paymentData?.chatId,
        messageId: paymentData?.messageId,
    };
}

let handler = async ({ bot, message_id, chat_id, data, from }) => {
    try {
        const targetChatId = chat_id || from;
        const storedPayment = getStoredDepositMessage(from);
        clearDepositState(from);

        await answerCancel(bot, data);
        if (storedPayment.chatId && storedPayment.messageId) {
            await deleteOrNotify(bot, storedPayment.chatId, storedPayment.messageId);
        } else {
            await deleteOrNotify(bot, targetChatId, message_id);
        }
    } catch (e) {
        console.error("Error in deposit-cancel:", e);
        const text = e?.response?.data?.message || e?.message || "Terjadi kesalahan saat membatalkan top-up.";
        if (data?.id) {
            await bot.answerCallbackQuery(data.id, {
                text: String(text).slice(0, 180),
                show_alert: true,
            }).catch(() => {});
        }
        if (chat_id || from) {
            await bot.sendMessage(chat_id || from, safeEsc("Gagal membatalkan top-up. Silakan coba lagi."), {
                parse_mode: "MarkdownV2",
            }).catch(() => {});
        }
    }
}

handler.key = ["canceldeposit", "deposit_cancel"];

export default handler;