import "../config.js";

let handler = async ({ bot, from, chat_id, data, message_id }) => {
  try {
    if (!global.digiflazzInput || !global.digiflazzInput[from]) {
      return bot.answerCallbackQuery(data.id, { text: "Sesi telah berakhir, silakan mulai lagi", show_alert: true });
    }

    const state = global.digiflazzInput[from];
    if (state.step !== "checkout") {
      return bot.answerCallbackQuery(data.id, { text: "Langkah tidak valid", show_alert: true });
    }

    if (!global.onInputDigiflazzQty) global.onInputDigiflazzQty = {};
    const prompt = await bot.sendMessage(chat_id, esc("*Masukkan jumlah beli Digiflazz:*"), {
      parse_mode: "MarkdownV2",
      reply_markup: { force_reply: true },
    });

    global.onInputDigiflazzQty[from] = {
      status: "input_jumlah_digiflazz",
      message1: message_id,
      message2: prompt.message_id,
    };

    await bot.answerCallbackQuery(data.id).catch(() => {});
  } catch (e) {
    console.error("Error in digiflazz-input-qty:", e);
    const text = e?.response?.data?.message || e?.response?.data?.data?.message || e.message || "Terjadi kesalahan";
    await bot.answerCallbackQuery(data.id, { text: String(text).slice(0, 180), show_alert: true }).catch(() => {});
  }
};

handler.key = "dgf_inputqty";
export default handler;