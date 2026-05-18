import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOUCHER_FILE = path.join(__dirname, '../src/vouchers.json');

// Simple file lock to prevent race conditions
let fileLock = false;
const lockQueue = [];

async function acquireLock() {
  if (!fileLock) {
    fileLock = true;
    return;
  }
  await new Promise(resolve => lockQueue.push(resolve));
}

function releaseLock() {
  if (lockQueue.length > 0) {
    const next = lockQueue.shift();
    next();
  } else {
    fileLock = false;
  }
}

async function loadVouchers() {
  try {
    const data = await fs.readFile(VOUCHER_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    console.error("Voucher Load Error:", e.message);
    return [];
  }
}

async function saveVouchers(vouchers) {
  try {
    await fs.writeFile(VOUCHER_FILE, JSON.stringify(vouchers, null, 2), 'utf-8');
  } catch (e) {
    console.error("Voucher Save Error:", e.message);
  }
}

export async function markVoucherUsed(code, userId) {
  await acquireLock();
  try {
    const allVouchers = await loadVouchers();
    const voucherIndex = allVouchers.findIndex(v => v.code === code);

    if (voucherIndex === -1) {
      return { success: false, error: "Voucher not found." };
    }

    let voucher = allVouchers[voucherIndex];

    if (voucher.used) {
      return { success: true };
    }

    voucher.used = true;
    voucher.usedBy = userId;
    voucher.usedAt = new Date().toISOString();
    allVouchers[voucherIndex] = voucher;

    await saveVouchers(allVouchers);
    return { success: true };
  } finally {
    releaseLock();
  }
}

export async function deleteVoucher(code) {
  await acquireLock();
  try {
    const allVouchers = await loadVouchers();
    const index = allVouchers.findIndex(v => v.code === code);

    if (index === -1) {
      return { success: false, error: "Voucher tidak ditemukan." };
    }

    const voucher = allVouchers[index];
    if (voucher.used) {
      return { success: false, error: "Voucher sudah digunakan dan tidak bisa dihapus." };
    }

    allVouchers.splice(index, 1);
    await saveVouchers(allVouchers);
    return { success: true };
  } finally {
    releaseLock();
  }
}

export async function createVoucher(voucherData) {
  await acquireLock();
  try {
    const allVouchers = await loadVouchers();
    allVouchers.push(voucherData);
    await saveVouchers(allVouchers);
    return { success: true };
  } finally {
    releaseLock();
  }
}
