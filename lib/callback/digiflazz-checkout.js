import "../config.js";
import { dbUser } from "../lib/database.js";
import { safeDeleteMessage } from "../lib/myfunc.js";
import {
  buildDigiflazzCheckoutKeyboard,
  buildDigiflazzCheckoutMessage,
  getDigiflazzQuantity,
  validateDigiflazzCheckoutState,
} from "../lib/digiflazz-order.js";

let handler = async ({ bot, from, chat_id, data, message_id }) => {
  try {
    if (!global.digiflazzInput || !global.digiflazzInput[from]) {
      return bot.answerCallbackQuery(data.id, { text: "Sesi telah berakhir, silakan mulai lagi", show_alert: true });
    }

    const state = global.digiflazzInput[from];
    const parts = data.data.split(" ");
    const quantity = getDigiflazzQuantity(parts[2] || state.quantity || 1);

    const stateError = validateDigiflazzCheckoutState(state);
    if (stateError) {
      delete global.digiflazzInput[from];
      return bot.answerCallbackQuery(data.id, { text: stateError, show_alert: true });
    }

    global.digiflazzInput[from] = { ...state, quantity, step: "checkout" };

    const userResult = await dbUser(from);
    const user = userResult.success ? userResult.data : null;
    const { keyboard, replyKeyboard } = buildDigiflazzCheckoutKeyboard(global.digiflazzInput[from]);
    const reply_markup = global.use_reply_keyboard
      ? { keyboard: replyKeyboard, resize_keyboard: true, is_persistent: true }
      : { inline_keyboard: keyboard };

    const checkoutText = esc(buildDigiflazzCheckoutMessage(global.digiflazzInput[from], user));
    const targetMessageId = data.id ? message_id : state.checkout_message_id;

    if (!data.id) {
      await safeDeleteMessage(bot, chat_id, message_id);
    }

    let edited = false;
    if (targetMessageId) {
      try {
        await bot.editMessageText(checkoutText, {
          chat_id,
          message_id: targetMessageId,
          parse_mode: "MarkdownV2",
          reply_markup,
        });
        edited = true;
      } catch (e) {
        const msg = e.message || "";
        if (msg.includes("message is not modified")) {
          edited = true;
        } else if (!msg.includes("message can't be edited")) {
          console.error("Failed to edit Digiflazz checkout:", e.message || e);
        }
      }
    }

    if (!edited) {
      const sent = await bot.sendMessage(chat_id, checkoutText, {
        parse_mode: "MarkdownV2",
        reply_markup,
      });
      if (sent?.message_id) global.digiflazzInput[from].checkout_message_id = sent.message_id;
    } else if (targetMessageId) {
      global.digiflazzInput[from].checkout_message_id = targetMessageId;
    }

    await bot.answerCallbackQuery(data.id).catch(() => {});
  } catch (e) {
    console.error("Error in digiflazz-checkout:", e);
    const text = e?.response?.data?.message || e?.response?.data?.data?.message || e.message || "Terjadi kesalahan";
    await bot.answerCallbackQuery(data.id, { text: String(text).slice(0, 180), show_alert: true }).catch(() => {});
  }
};

handler.key = "dgf_checkout";
export default handler;