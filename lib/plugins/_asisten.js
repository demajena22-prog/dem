import { gemini } from "../lib/gemini.js";
import fs from "fs/promises";
import path, { parse } from "path";

const SESSIONS_FILE = path.join(
  process.cwd(),
  "src",
  "asisten",
  "sessionsId.json"
);

function isControlButtonText(text) {
  return [
    /batalkan|\bbatal\b|\bcancel\b/i,
    /sudah\s*bayar/i,
    /^qris\b/i,
    /^balance\b/i,
    /ketik\s*(jumlah|nominal)/i,
    /kembali|back/i,
    /refresh/i,
    /menu/i,
    /saldo/i,
    /riwayat\s*transaksi/i,
    /list\s*produk/i,
    /produk\s*(digital|populer)/i,
    /cara\s*order/i,
    /daftar\s*stok/i,
    /berikutnya|sebelumnya|next|previous|prev/i,
  ].some((pattern) => pattern.test(text));
}

export default async function ({ bot, from, chat_id, body }) {
  try {
    if (!body) return;
    const trimmed = String(body).trim();
    if (!trimmed) return;

    // only run for non-command messages (not starting with '/')
    if (trimmed.startsWith("/")) return;
    if (isControlButtonText(trimmed)) return;

    // require at least 5 letters (huruf)
    const letterCount = (trimmed.match(/\p{L}/gu) || []).length;
    if (letterCount < 5) return;

    // ensure sessions file exists and load it
    let sessions = [];
    try {
      const raw = await fs.readFile(SESSIONS_FILE, "utf8");
      sessions = JSON.parse(raw || "[]");
    } catch (err) {
      if (err.code === "ENOENT") {
        await fs.mkdir(path.dirname(SESSIONS_FILE), { recursive: true });
        await fs.writeFile(SESSIONS_FILE, "[]", "utf8");
        sessions = [];
      } else {
        console.error("_asisten: failed to read sessions file", err.message);
      }
    }

    const normalizedId = String(from);
    const existing = sessions.find((s) => String(s.id) === normalizedId);
    const sessionId = existing ? existing.sessionId : null;

    // call Gemini
    let reply;
    try {
      reply = await gemini({ message: trimmed, sessionId });
    } catch (err) {
      console.error("_asisten: gemini error", err.message);
      return;
    }

    if (!reply) return;

    const { text, sessionId: newSessionId } = reply;

    // persist new sessionId (if provided)
    if (newSessionId) {
      if (existing) {
        existing.sessionId = newSessionId;
      } else {
        sessions.push({ id: normalizedId, sessionId: newSessionId });
      }

      try {
        await fs.writeFile(
          SESSIONS_FILE,
          JSON.stringify(sessions, null, 2),
          "utf8"
        );
      } catch (err) {
        console.error("_asisten: failed to write sessions file", err.message);
      }
    }

    // send reply to user
    if (text) {
      try {
        await bot.sendMessage(chat_id, esc(String(text)), {
            parse_mode: "Markdown",
        });
      } catch (err) {
        console.error("_asisten: failed to send reply", err.message);
      }
    }
  } catch (e) {
    console.error("_asisten: unexpected error", e);
  }
}
