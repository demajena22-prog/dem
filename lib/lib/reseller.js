import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESELLER_FILE = path.join(__dirname, "../src/reseller_config.json");

function ensureFile() {
  if (!fs.existsSync(RESELLER_FILE)) {
    const initialData = {
      users: [], 
      prices: {} 
    };
    fs.writeFileSync(RESELLER_FILE, JSON.stringify(initialData, null, 2));
  }
}

function loadData() {
  ensureFile();
  try {
    const data = fs.readFileSync(RESELLER_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return { users: [], prices: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(RESELLER_FILE, JSON.stringify(data, null, 2));
}

export const addReseller = (userId) => {
  const data = loadData();
  if (!data.users.includes(userId)) {
    data.users.push(userId);
    saveData(data);
    return true;
  }
  return false;
};

export const removeReseller = (userId) => {
  const data = loadData();
  const index = data.users.indexOf(userId);
  if (index !== -1) {
    data.users.splice(index, 1);
    saveData(data);
    return true;
  }
  return false;
};

export const isReseller = (userId) => {
  const data = loadData();
  
  return data.users.includes(String(userId)) || data.users.includes(Number(userId));
};

export const getResellerList = () => {
  const data = loadData();
  return data.users;
};

export const setResellerPrice = (productId, price) => {
  const data = loadData();
  data.prices[productId] = parseInt(price);
  saveData(data);
  return true;
};

export const deleteResellerPrice = (productId) => {
  const data = loadData();
  if (data.prices[productId]) {
    delete data.prices[productId];
    saveData(data);
    return true;
  }
  return false;
};

export const getResellerPrice = (productId) => {
  const data = loadData();
  return data.prices[productId] || null;
};