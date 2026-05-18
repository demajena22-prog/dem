import fs from 'fs';
import path from 'path';
import { safeDeleteMessage } from './myfunc.js';

let canvasModule;
const FALLBACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

async function getCanvas() {
  if (!canvasModule) {
    canvasModule = import('@napi-rs/canvas').then((mod) => mod).catch((err) => {
      console.warn(`[card-generator] @napi-rs/canvas tidak tersedia: ${err.message}`);
      return null;
    });
  }
  return canvasModule;
}

const TMP_DIR = './src/tmp/cards';
const W = 800;
const CARD_H = 400;

function ensureDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ─── COLOR PALETTE ───
const COLORS = {
  bg: '#0B0E14',
  cardBg: '#12161F',
  accent1: '#5B8EF0',
  accent2: '#3ECFA4',
  text: '#E8EAF0',
  textMuted: '#7B8099',
  statBg: '#1A1F2C',
  warning: '#F0B95B',
  danger: '#F07070',
  border: 'rgba(255,255,255,0.06)',
};

// ─── CANVAS DRAWING HELPERS ───
function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBackground(ctx, w, h) {
  // Outer background
  drawRoundedRect(ctx, 0, 0, w, h, 20);
  ctx.fillStyle = COLORS.bg;
  ctx.fill();

  // Inner card
  drawRoundedRect(ctx, 16, 16, w - 32, h - 32, 14);
  ctx.fillStyle = COLORS.cardBg;
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Gradient accent line at top
  const grad = ctx.createLinearGradient(16, 16, w - 16, 16);
  grad.addColorStop(0, COLORS.accent1);
  grad.addColorStop(1, COLORS.accent2);
  ctx.fillStyle = grad;
  ctx.fillRect(16, 16, w - 32, 3);
}

function drawTitle(ctx, title, y = 50) {
  ctx.font = '11px Arial';
  ctx.fillStyle = COLORS.textMuted;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '3px';
  ctx.fillText(title.toUpperCase(), W / 2, y);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
}

function drawSection(ctx, label, y) {
  ctx.font = '10px Arial';
  ctx.fillStyle = COLORS.accent1;
  ctx.textAlign = 'left';
  ctx.letterSpacing = '2px';
  ctx.fillText(label.toUpperCase(), 50, y);
  ctx.letterSpacing = '0px';
}

function drawRow(ctx, label, value, y, valueColor = COLORS.text) {
  ctx.font = '14px Arial';
  ctx.fillStyle = COLORS.textMuted;
  ctx.textAlign = 'left';
  ctx.fillText(label, 50, y);
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = valueColor;
  ctx.fillText(String(value || ''), 300, y);
}

function drawLine(ctx, y) {
  ctx.beginPath();
  ctx.moveTo(50, y);
  ctx.lineTo(W - 50, y);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawStatBox(ctx, x, y, w, value, label) {
  drawRoundedRect(ctx, x, y, w, 70, 10);
  ctx.fillStyle = COLORS.statBg;
  ctx.fill();

  ctx.font = 'bold 20px Arial';
  ctx.fillStyle = COLORS.accent2;
  ctx.textAlign = 'center';
  ctx.fillText(String(value || ''), x + w / 2, y + 30);

  ctx.font = '10px Arial';
  ctx.fillStyle = COLORS.textMuted;
  ctx.letterSpacing = '1px';
  ctx.fillText(label.toUpperCase(), x + w / 2, y + 55);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
}

// ─── AVATAR HELPERS ───
const AVATAR_SIZE = 60;
const AVATAR_CX = 80;
const AVATAR_CY = 90;
const AVATAR_TTL = 10 * 60 * 1000;
const avatarCache = new Map();

export async function fetchAvatar(bot, userId) {
  const cached = avatarCache.get(userId);
  if (cached && Date.now() - cached.ts < AVATAR_TTL) return cached.buf;
  try {
    ensureDir();
    const photos = await bot.getUserProfilePhotos(userId, { limit: 1 });
    if (!photos || !photos.photos || !photos.photos.length) {
      avatarCache.set(userId, { buf: null, ts: Date.now() });
      return null;
    }
    const best = photos.photos[0];
    const fileId = best[best.length - 1].file_id;
    const dlPath = await bot.downloadFile(fileId, TMP_DIR);
    const raw = fs.readFileSync(dlPath);
    try { fs.unlinkSync(dlPath); } catch { }

    const canvasMod = await getCanvas();
    if (!canvasMod) {
      avatarCache.set(userId, { buf: null, ts: Date.now() });
      return null;
    }

    // Resize and make circular using canvas
    const img = await canvasMod.loadImage(raw);
    const c = canvasMod.createCanvas(AVATAR_SIZE, AVATAR_SIZE);
    const cx = c.getContext('2d');
    cx.beginPath();
    cx.arc(AVATAR_SIZE / 2, AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
    cx.closePath();
    cx.clip();
    cx.drawImage(img, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const buf = c.toBuffer('image/png');

    avatarCache.set(userId, { buf, ts: Date.now() });
    return buf;
  } catch {
    avatarCache.set(userId, { buf: null, ts: Date.now() });
    return null;
  }
}

function drawAvatarPlaceholder(ctx, cx = AVATAR_CX, cy = AVATAR_CY) {
  // Ring
  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR_SIZE / 2 + 2, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.statBg;
  ctx.fill();
  const grad = ctx.createLinearGradient(cx - 32, cy, cx + 32, cy);
  grad.addColorStop(0, COLORS.accent1);
  grad.addColorStop(1, COLORS.accent2);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Placeholder icon
  ctx.font = '22px Arial';
  ctx.fillStyle = '#3B3F52';
  ctx.textAlign = 'center';
  ctx.fillText('\u{1F464}', cx, cy + 7);
  ctx.textAlign = 'left';
}

async function createCard(width, height, drawFn, avatarBuf = null) {
  const canvasMod = await getCanvas();
  if (!canvasMod) return FALLBACK_PNG;

  const canvas = canvasMod.createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, width, height);
  await drawFn(ctx, canvasMod);

  // Composite avatar if available
  if (avatarBuf) {
    try {
      const avatarImg = await canvasMod.loadImage(avatarBuf);
      ctx.drawImage(avatarImg, AVATAR_CX - AVATAR_SIZE / 2, AVATAR_CY - AVATAR_SIZE / 2, AVATAR_SIZE, AVATAR_SIZE);
    } catch { }
  }

  return canvas.toBuffer('image/png');
}

// Delete old message + send new photo
export async function editWithCard(bot, chat_id, message_id, cardBuffer, caption, reply_markup) {
  await safeDeleteMessage(bot, chat_id, message_id);
  return bot.sendPhoto(chat_id, cardBuffer, {
    caption,
    file_name: 'card.png',
    contentType: 'image/png',
    parse_mode: 'MarkdownV2',
    reply_markup: normalizeReplyMarkup(reply_markup)
  });
}

function normalizeReplyMarkup(reply_markup) {
  if (!reply_markup) return undefined;
  if (reply_markup.keyboard) {
    return {
      ...reply_markup,
      resize_keyboard: true,
      is_persistent: true,
      one_time_keyboard: false,
    };
  }
  if (reply_markup.inline_keyboard || reply_markup.remove_keyboard) {
    return reply_markup;
  }
  return { inline_keyboard: reply_markup };
}


// ─── START / MAIN MENU CARD ───
export async function generateStartCard(d) {
  const { bot, from, pushname, username, balance, totalBeli, totalTransaksi,
    botTerjual, botRevenue, totalUsers, storeName, tanggal, jam } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;

  const H = CARD_H;
  return createCard(W, H, (ctx) => {
    drawTitle(ctx, (storeName || 'STORE') + ' \u00B7 DIGITAL STORE');
    drawAvatarPlaceholder(ctx);

    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`Halo, ${pushname || ''}`, 125, 82);

    ctx.font = '13px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(`@${username || ''} \u00B7 ${from}`, 125, 100);

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.accent1;
    ctx.fillText(`${tanggal || ''} \u00B7 ${jam || ''}`, 125, 115);

    drawLine(ctx, 130);
    drawSection(ctx, 'PROFIL KAMU', 150);
    drawRow(ctx, 'Saldo', balance, 172, COLORS.accent2);
    drawRow(ctx, 'Total Beli', (totalBeli || 0) + ' pcs', 197);
    drawRow(ctx, 'Total Transaksi', totalTransaksi, 222);
    drawLine(ctx, 245);
    drawSection(ctx, 'STATISTIK TOKO', 270);
    drawStatBox(ctx, 50, 285, 220, (botTerjual || 0) + ' pcs', 'TERJUAL');
    drawStatBox(ctx, 290, 285, 220, botRevenue, 'REVENUE');
    drawStatBox(ctx, 530, 285, 220, totalUsers, 'PENGGUNA');
  }, avatarBuf);
}

// ─── SALDO CARD ───
export async function generateSaldoCard(d) {
  const { bot, from, pushname, balance, totalBeli, totalTransaksi, storeName } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;

  const H = CARD_H;
  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F4B0} SALDO \u2014 ' + (storeName || 'STORE').toUpperCase());
    drawAvatarPlaceholder(ctx);

    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(pushname || '', 125, 85);

    ctx.font = '12px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Saldo saat ini', 125, 107);

    drawLine(ctx, 130);

    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = COLORS.accent2;
    ctx.textAlign = 'center';
    ctx.fillText(String(balance || ''), W / 2, 180);

    ctx.font = '12px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Pilih nominal top-up dibawah', W / 2, 210);
    ctx.textAlign = 'left';

    drawLine(ctx, 230);
    drawSection(ctx, 'PENGGUNAAN', 255);
    drawStatBox(ctx, 50, 270, 340, (totalBeli || 0) + ' pcs', 'TOTAL PEMBELIAN');
    drawStatBox(ctx, 410, 270, 340, totalTransaksi, 'TOTAL TRANSAKSI');
  }, avatarBuf);
}

// ─── MENU CARD ───
export async function generateMenuCard(d) {
  const { bot, from, pushname, storeName } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;

  const H = CARD_H;
  return createCard(W, H, (ctx) => {
    drawTitle(ctx, (storeName || 'STORE').toUpperCase() + ' \u00B7 MENU');
    drawAvatarPlaceholder(ctx);

    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(pushname || '', 125, 85);

    ctx.font = '13px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Pilih menu dibawah ini', 125, 107);
  }, avatarBuf);
}

// ─── INFO BOT CARD ───
export async function generateInfoCard(d) {
  const { from, owner, channel, developer, price, storeName } = d;

  const H = CARD_H;
  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F916} ' + (storeName || 'STORE').toUpperCase() + ' \u00B7 INFO');
    drawSection(ctx, 'DETAIL BOT', 80);
    drawRow(ctx, 'Owner', '@' + (owner || ''), 105);
    drawRow(ctx, 'Channel', '@' + (channel || ''), 130);
    drawLine(ctx, 150);
    drawSection(ctx, 'DEVELOPER', 175);
    drawRow(ctx, 'Contact', '@' + (developer || ''), 200);
    drawLine(ctx, 220);
    drawSection(ctx, 'SEWA BOT', 245);

    ctx.font = '13px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Pembayaran otomatis \u00B7 Multi metode bayar \u00B7 Panel admin', 50, 270);
    ctx.fillText('Statistik lengkap \u00B7 Pengiriman otomatis', 50, 292);

    // Price box
    drawRoundedRect(ctx, 50, 308, 700, 30, 6);
    ctx.fillStyle = 'rgba(62,207,164,0.1)';
    ctx.fill();

    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = COLORS.accent2;
    ctx.textAlign = 'center';
    ctx.fillText('Harga: ' + (price || ''), W / 2, 328);
    ctx.textAlign = 'left';
  });
}

// ─── ADMIN CARD ───
export async function generateAdminCard(d) {
  const { bot, from, pushname, botId, botUsername, tanggal, jam, maintenance,
    dailyPcs, dailyRevenue, totalSold, totalRevenue, totalUsers, totalProducts } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;

  const H = CARD_H;
  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F451} ADMIN PANEL');
    drawAvatarPlaceholder(ctx);

    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`Halo, ${pushname || 'Admin'}`, 125, 82);

    ctx.font = '12px Arial';
    ctx.fillStyle = maintenance ? COLORS.danger : COLORS.accent2;
    ctx.fillText(maintenance ? '\u25CF MAINTENANCE' : '\u25CF AKTIF', 125, 100);

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.accent1;
    ctx.fillText(`${tanggal || ''} \u00B7 ${jam || ''}`, 125, 115);

    drawLine(ctx, 130);
    drawSection(ctx, 'BOT INFO', 150);
    drawRow(ctx, 'ID', botId, 172);
    drawRow(ctx, 'Username', '@' + (botUsername || ''), 197);
    drawLine(ctx, 215);
    drawSection(ctx, 'DATA HARIAN', 235);
    drawRow(ctx, 'Terjual', (dailyPcs || 0) + ' pcs', 258, COLORS.accent2);
    drawRow(ctx, 'Pendapatan', dailyRevenue, 281, COLORS.accent2);
    drawLine(ctx, 298);
    drawStatBox(ctx, 50, 310, 165, (totalSold || 0) + ' pcs', 'TERJUAL');
    drawStatBox(ctx, 230, 310, 185, totalRevenue, 'REVENUE');
    drawStatBox(ctx, 430, 310, 165, totalUsers, 'USER');
    drawStatBox(ctx, 610, 310, 140, totalProducts, 'PRODUK');
  }, avatarBuf);
}


// ─── ORDER CONFIRMATION CARD ───
export async function generateOrderCard(d) {
  const { from, pushname, productName, variant, harga, stok, jumlah, subtotal, total,
    voucher, diskon, storeName } = d;

  const hasVoucher = !!voucher;
  let y = 80;
  const rowHeight = 25;
  const rows = [];
  rows.push({ type: 'section', label: 'DETAIL PESANAN', y });
  y += 28;
  rows.push({ type: 'row', label: 'Produk', value: productName, y });
  y += rowHeight;
  rows.push({ type: 'row', label: 'Variasi', value: variant, y });
  y += rowHeight;
  rows.push({ type: 'row', label: 'Harga', value: harga, y });
  y += rowHeight;
  rows.push({ type: 'row', label: 'Stok', value: stok, y });
  y += rowHeight;
  rows.push({ type: 'row', label: 'Jumlah', value: (jumlah || 0) + ' pcs', y });
  y += rowHeight;
  if (hasVoucher) {
    rows.push({ type: 'row', label: 'Voucher', value: voucher + ' (-' + diskon + ')', y, color: COLORS.warning });
    y += rowHeight;
  }
  rows.push({ type: 'line', y: y + 5 });
  y += 25;
  rows.push({ type: 'total', y, value: total });
  y += 30;

  const H = Math.max(CARD_H, y + 20);
  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F6D2} KONFIRMASI PESANAN \u2014 ' + (storeName || 'STORE'));
    for (const r of rows) {
      if (r.type === 'section') drawSection(ctx, r.label, r.y);
      else if (r.type === 'row') drawRow(ctx, r.label, r.value, r.y, r.color);
      else if (r.type === 'line') drawLine(ctx, r.y);
      else if (r.type === 'total') {
        ctx.font = '16px Arial';
        ctx.fillStyle = COLORS.textMuted;
        ctx.fillText('TOTAL', 50, r.y);
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = COLORS.accent2;
        ctx.fillText(String(r.value || ''), 300, r.y);
      }
    }
  });
}

// ─── CARA ORDER CARD ───
export async function generateCaraOrderCard(d) {
  const { from, storeName } = d;
  const steps = [
    'Buka List Produk dan pilih kategori',
    'Pilih varian yang ingin dibeli',
    'Atur jumlah dengan tombol +/- atau ketik manual',
    'Pilih metode pembayaran',
    'Scan QRIS atau bayar via Saldo',
    'Produk otomatis dikirim setelah bayar',
  ];

  let y = 90;
  const H = Math.max(CARD_H, y + steps.length * 38 + 20);

  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u2753 CARA ORDER \u2014 ' + (storeName || 'STORE').toUpperCase());

    steps.forEach((s, i) => {
      // Circle
      ctx.beginPath();
      ctx.arc(65, y - 4, 12, 0, Math.PI * 2);
      ctx.fillStyle = i === 5 ? COLORS.accent2 : COLORS.statBg;
      ctx.fill();

      // Number
      ctx.font = 'bold 11px Arial';
      ctx.fillStyle = i === 5 ? COLORS.bg : COLORS.accent1;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), 65, y);
      ctx.textAlign = 'left';

      // Text
      ctx.font = '13px Arial';
      ctx.fillStyle = COLORS.text;
      ctx.fillText(s, 90, y);
      y += 38;
    });
  });
}

// ─── PRODUK POPULER CARD ───
export async function generatePopulerCard(d) {
  const { from, storeName, items } = d;
  let y = 80;
  const itemList = (items || []).slice(0, 10);
  const H = Math.max(CARD_H, y + itemList.length * 38 + 20);

  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u2728 PRODUK POPULER \u2014 ' + (storeName || 'STORE').toUpperCase());

    itemList.forEach((item, i) => {
      const num = i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : `${i + 1}.`;
      ctx.font = '14px Arial';
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText(num, 50, y);

      ctx.font = 'bold 14px Arial';
      ctx.fillStyle = COLORS.text;
      ctx.fillText(String(item.name || ''), 90, y);

      ctx.font = '13px Arial';
      ctx.fillStyle = COLORS.accent2;
      ctx.fillText((item.sold || 0) + ' pcs', 550, y);

      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText(String(item.revenue || ''), 650, y);
      y += 38;
    });
  });
}

// ─── VOUCHER INPUT CARD ───
export async function generateVoucherCard(d) {
  const { from, productName, variant, harga, jumlah, storeName } = d;

  const H = CARD_H;
  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F3AB} INPUT VOUCHER \u2014 ' + (storeName || 'STORE'));
    drawSection(ctx, 'DETAIL', 80);
    drawRow(ctx, 'Produk', productName, 105);
    drawRow(ctx, 'Variasi', variant, 130);
    drawRow(ctx, 'Harga', harga, 155);
    drawRow(ctx, 'Jumlah', (jumlah || 0) + ' pcs', 180);
  });
}

// ─── LIST PRODUK CARD ───
export async function generateListProdukCard(d) {
  const { bot, from, pushname, storeName, salam, categories, page, totalPages } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;
  const items = categories || [];

  let y = 145;
  const contentHeight = 145 + 25 + (items.length > 0 ? items.length * 28 : 30) + 57;
  const H = Math.max(CARD_H, contentHeight);

  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F6D2} ' + (storeName || 'STORE').toUpperCase() + ' \u00B7 LIST PRODUK');
    drawAvatarPlaceholder(ctx);

    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(pushname || '', 125, 85);

    ctx.font = '12px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Selamat ' + (salam || ''), 125, 105);

    drawSection(ctx, 'KATEGORI PRODUK', y);
    y += 25;

    if (items.length === 0) {
      ctx.font = '14px Arial';
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText('Belum ada produk tersedia', 50, y);
      y += 30;
    } else {
      items.forEach((cat) => {
        ctx.font = 'bold 13px Arial';
        ctx.fillStyle = COLORS.accent1;
        ctx.fillText(String(cat.num || ''), 50, y);

        ctx.font = '14px Arial';
        ctx.fillStyle = COLORS.text;
        ctx.fillText(String(cat.name || ''), 90, y);
        y += 28;
      });
    }

    y += 10;
    drawLine(ctx, y);
    y += 22;

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'center';
    ctx.fillText(`Halaman ${page || 1} dari ${totalPages || 1}`, W / 2, y);
    ctx.textAlign = 'left';
  }, avatarBuf);
}


// ─── RIWAYAT TRANSAKSI CARD ───
export async function generateRiwayatCard(d) {
  const { from, totalTransaksi, totalPcs, transactions, page, totalPages } = d;
  const txList = transactions || [];

  let y = 80;
  const contentHeight = 80 + 65 + 25 + (txList.length > 0 ? txList.length * 50 : 30) + 45;
  const H = Math.max(CARD_H, contentHeight);

  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F516} RIWAYAT TRANSAKSI');
    drawSection(ctx, 'RINGKASAN', y);
    y += 25;
    drawRow(ctx, 'Total Transaksi', totalTransaksi, y, COLORS.accent2);
    y += 25;
    drawRow(ctx, 'Total Dibeli', (totalPcs || 0) + ' pcs', y);
    y += 15;
    drawLine(ctx, y);
    y += 25;
    drawSection(ctx, 'RIWAYAT', y);
    y += 25;

    if (txList.length === 0) {
      ctx.font = '14px Arial';
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText('Belum ada transaksi', 50, y);
      y += 30;
    } else {
      txList.forEach((t) => {
        ctx.font = 'bold 13px Arial';
        ctx.fillStyle = COLORS.text;
        ctx.fillText(`${t.num || ''}. ${t.name || ''}`, 50, y);
        y += 22;

        ctx.font = '11px Arial';
        ctx.fillStyle = COLORS.textMuted;
        ctx.fillText('ID: ' + (t.reffId || ''), 70, y);

        ctx.fillStyle = COLORS.accent2;
        ctx.fillText(String(t.total || ''), 350, y);

        ctx.fillStyle = COLORS.textMuted;
        ctx.fillText((t.qty || 0) + ' pcs', 550, y);
        ctx.fillText(String(t.date || ''), 650, y);
        y += 28;
      });
    }

    y += 5;
    drawLine(ctx, y);
    y += 20;

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'center';
    ctx.fillText(`Halaman ${page || 1} dari ${totalPages || 1}`, W / 2, y);
    ctx.textAlign = 'left';
  });
}

// ─── DAFTAR STOK CARD ───
export async function generateStokCard(d) {
  const { from, storeName, date, products, page, totalPages } = d;
  const prodList = products || [];

  let y = 75;
  const contentHeight = 75 + 20 + 25 + (prodList.length > 0 ? prodList.length * 26 : 30) + 45;
  const H = Math.max(CARD_H, contentHeight);

  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F4E6} STOCK \u2014 ' + (storeName || 'STORE').toUpperCase());

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(date || '', 50, y);
    y += 20;
    drawLine(ctx, y);
    y += 25;

    if (prodList.length === 0) {
      ctx.font = '14px Arial';
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText('Belum ada produk tersedia', 50, y);
      y += 30;
    } else {
      prodList.forEach(p => {
        const hasStock = (p.stock || 0) > 0;
        const icon = hasStock ? '\u2705' : '\u274C';
        ctx.font = '13px Arial';
        ctx.fillStyle = hasStock ? COLORS.accent2 : COLORS.danger;
        ctx.fillText(icon, 50, y);

        ctx.fillStyle = COLORS.text;
        ctx.fillText(String(p.name || ''), 80, y);

        ctx.textAlign = 'end';
        ctx.font = 'bold 13px Arial';
        ctx.fillStyle = hasStock ? COLORS.accent2 : COLORS.danger;
        ctx.fillText('x' + (p.stock || 0), W - 80, y);
        ctx.textAlign = 'left';
        y += 26;
      });
    }

    y += 5;
    drawLine(ctx, y);
    y += 20;

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'center';
    ctx.fillText(`Halaman ${page || 1} dari ${totalPages || 1}`, W / 2, y);
    ctx.textAlign = 'left';
  });
}

// ─── CATEGORY / SELECT PRODUCT CARD ───
export async function generateCategoryCard(d) {
  const { from, categoryName, sold, products, refreshLabel } = d;
  const prodList = products || [];

  let y = 80;
  const contentHeight = 80 + 37 + 25 + (prodList.length > 0 ? prodList.length * 50 : 0) + (refreshLabel ? 25 : 0) + 16;
  const H = Math.max(CARD_H, contentHeight);

  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F6D2} PRODUK');
    drawSection(ctx, (categoryName || '').toUpperCase(), y);
    y += 22;

    ctx.font = '12px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Terjual: ' + (sold || 0) + ' pcs', 50, y);
    y += 15;
    drawLine(ctx, y);
    y += 25;

    if (prodList.length > 0) {
      prodList.forEach(p => {
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = COLORS.text;
        ctx.fillText(String(p.name || ''), 50, y);
        y += 22;

        ctx.font = '12px Arial';
        ctx.fillStyle = COLORS.accent2;
        ctx.fillText(String(p.price || ''), 70, y);

        ctx.fillStyle = COLORS.textMuted;
        ctx.fillText('Stok: ' + (p.stock || 0), 300, y);
        ctx.fillText('Terjual: ' + (p.sold || 0) + ' pcs', 450, y);
        y += 28;
      });
    }

    if (refreshLabel) {
      y += 5;
      ctx.font = '10px Arial';
      ctx.fillStyle = COLORS.accent1;
      ctx.textAlign = 'center';
      ctx.fillText(refreshLabel, W / 2, y);
      ctx.textAlign = 'left';
    }
  });
}

// ─── INPUT JUMLAH PESANAN CARD ───
export async function generateInputQtyCard(d) {
  const { from, productName, variant, harga, stok, storeName } = d;

  const H = CARD_H;
  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F4DC} JUMLAH PESANAN \u2014 ' + (storeName || 'STORE'));
    drawSection(ctx, 'DETAIL', 80);
    drawRow(ctx, 'Produk', productName, 105);
    drawRow(ctx, 'Variasi', variant, 130);
    drawRow(ctx, 'Harga', harga, 155);
    drawRow(ctx, 'Stok', stok, 180);
  });
}

// ─── LEADERBOARD CARD ───
export async function generateLeaderboardCard(d) {
  const { from, botTerjual, botRevenue, totalUsers, users } = d;
  const userList = users || [];

  let y = 80;
  const contentHeight = 80 + 90 + 25 + (userList.length > 0 ? userList.length * 50 : 30) + 16;
  const H = Math.max(CARD_H, contentHeight);

  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F3C6} LEADERBOARD');
    drawSection(ctx, 'BOT INFO', y);
    y += 25;
    drawRow(ctx, 'Terjual', (botTerjual || 0) + ' pcs', y, COLORS.accent2);
    y += 25;
    drawRow(ctx, 'Total Transaksi', botRevenue, y);
    y += 25;
    drawRow(ctx, 'Total Pengguna', totalUsers, y);
    y += 15;
    drawLine(ctx, y);
    y += 25;
    drawSection(ctx, 'TOP USER', y);
    y += 25;

    if (userList.length > 0) {
      userList.forEach((u, i) => {
        const medal = i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : `${i + 1}.`;
        ctx.font = '13px Arial';
        ctx.fillStyle = COLORS.textMuted;
        ctx.fillText(medal, 50, y);

        ctx.font = 'bold 13px Arial';
        ctx.fillStyle = COLORS.text;
        ctx.fillText(String(u.name || ''), 90, y);
        y += 22;

        ctx.font = '11px Arial';
        ctx.fillStyle = COLORS.accent2;
        ctx.fillText(String(u.revenue || ''), 90, y);

        ctx.fillStyle = COLORS.textMuted;
        ctx.fillText((u.trx || 0) + ' trx', 320, y);
        ctx.fillText((u.pcs || 0) + ' pcs', 450, y);
        y += 28;
      });
    } else {
      ctx.font = '14px Arial';
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText('Belum ada data transaksi', 50, y);
    }
  });
}

// ─── BROADCAST CARD ───
export async function generateBroadcastCard(d) {
  const { storeName, salam } = d;

  const H = CARD_H;
  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F4E2} BROADCAST \u2014 ' + (storeName || 'STORE').toUpperCase());

    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.fillText('Selamat ' + (salam || ''), W / 2, 90);

    ctx.font = '13px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Pesan dari ' + (storeName || 'Store'), W / 2, 120);
    ctx.textAlign = 'left';

    drawLine(ctx, 145);

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.accent1;
    ctx.textAlign = 'center';
    ctx.fillText('Terima kasih telah menggunakan layanan kami', W / 2, 165);
    ctx.textAlign = 'left';
  });
}

// ─── NOTIF TRANSAKSI CARD ───
export async function generateNotifCard(d) {
  const { bot, from, username, pushname, productName, jumlah, hargaSatuan,
    totalBayar, metode, reffId, voucher, storeName } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;

  let y = 145;
  const rows = [];
  rows.push({ type: 'section', label: 'INFORMASI TRANSAKSI', y });
  y += 25;
  rows.push({ type: 'row', label: 'Username', value: '@' + (username || '-'), y });
  y += 25;
  rows.push({ type: 'row', label: 'Produk', value: productName, y });
  y += 25;
  rows.push({ type: 'row', label: 'Harga Satuan', value: hargaSatuan, y });
  y += 25;
  rows.push({ type: 'row', label: 'Jumlah', value: (jumlah || 0) + ' pcs', y });
  y += 25;
  rows.push({ type: 'row', label: 'Total Bayar', value: totalBayar, y, color: COLORS.accent2 });
  y += 25;
  rows.push({ type: 'row', label: 'Metode', value: metode, y });
  y += 25;
  if (voucher) {
    rows.push({ type: 'row', label: 'Voucher', value: voucher, y, color: COLORS.warning });
    y += 25;
  }
  rows.push({ type: 'row', label: 'Ref ID', value: reffId, y, color: COLORS.accent1 });
  y += 15;
  rows.push({ type: 'line', y });
  y += 22;
  rows.push({ type: 'footer', y, text: (storeName || 'Store') + ' \u00B7 Notifikasi Transaksi' });
  y += 25;

  const H = Math.max(CARD_H, y + 16);
  return createCard(W, H, (ctx) => {
    drawTitle(ctx, '\u{1F4B3} TRANSAKSI BARU \u2014 ' + (storeName || 'STORE').toUpperCase());
    drawAvatarPlaceholder(ctx);

    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(pushname || username || '', 125, 82);

    ctx.font = '12px Arial';
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('ID: ' + (from || ''), 125, 100);

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.accent2;
    ctx.fillText('\u2705 Pembayaran Diterima', 125, 115);

    for (const r of rows) {
      if (r.type === 'section') drawSection(ctx, r.label, r.y);
      else if (r.type === 'row') drawRow(ctx, r.label, r.value, r.y, r.color);
      else if (r.type === 'line') drawLine(ctx, r.y);
      else if (r.type === 'footer') {
        ctx.font = '11px Arial';
        ctx.fillStyle = COLORS.textMuted;
        ctx.textAlign = 'center';
        ctx.fillText(r.text, W / 2, r.y);
        ctx.textAlign = 'left';
      }
    }
  }, avatarBuf);
}
