import "../config.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { processingLocks } from "./locks.js";
import { addDailyStats } from "./daily_stats.js";
import dns from "node:dns";
import chalk from './chalk.js';

function formatPrefix(level) {
  switch (level) {
    case 'info':
      return `${chalk.blue('[')}${chalk.yellow('i')}${chalk.blue(']')}`;
    case 'success':
      return `${chalk.green('[')}${chalk.yellow('✓')}${chalk.green(']')}`;
    case 'warn':
      return `${chalk.yellow('[')}${chalk.green('!')}${chalk.yellow(']')}`;
    case 'error':
      return `${chalk.red('[')}${chalk.yellow('x')}${chalk.red(']')}`;
    default:
      return '[ ]';
  }
}

export const logger = {
  info: (msg) => console.log(formatPrefix('info'), chalk.whiteBright(msg)),
  success: (msg) => console.log(formatPrefix('success'), chalk.whiteBright(msg)),
  warn: (msg) => console.log(formatPrefix('warn'), chalk.whiteBright(msg)),
  error: (msg) => console.error(formatPrefix('error'), chalk.whiteBright(msg)),
  debug: (msg) => console.debug(chalk.gray(msg)),
};

const srvErrorPattern = /(querySrv|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEOUT|SERVFAIL)/i;
let dnsFallbackApplied = false;

function parseDnsServers(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function applyDnsFallbackIfConfigured() {
  if (dnsFallbackApplied) return false;

  const servers = parseDnsServers(global.mongo_dns_servers || process.env.MONGO_DNS_SERVERS);
  if (!servers.length) return false;

  try {
    dns.setServers(servers);
    dnsFallbackApplied = true;
    logger.warn(`DNS fallback MongoDB aktif: ${servers.join(", ")}`);
    return true;
  } catch (err) {
    logger.warn(`Gagal menerapkan DNS fallback: ${err.message}`);
    return false;
  }
}

function isSrvDnsError(err) {
  return srvErrorPattern.test(err?.message || "");
}

function getMongoUris() {
  const primary = global.url_mongodb;
  const direct = global.url_mongodb_direct || process.env.MONGODB_URL_DIRECT || "";
  return { primary, direct };
}

async function connectWithUri(uri, dbName, poolSize, label = "MongoDB") {
  await mongoose.connect(uri, {
    dbName: dbName,
    serverSelectionTimeoutMS: 5000,
    family: 4,
    maxPoolSize: poolSize,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  logger.success(`Terhubung ke ${label}: ${dbName}`);
}

const connect = async () => {
  const poolSize = parseInt(global.mongo_pool_size) || 50;
  const dbName = global.mongo_dbname || "RIFdb";
  const { primary, direct } = getMongoUris();

  if (!primary) {
    throw new Error("Konfigurasi MongoDB kosong. Isi global.url_mongodb di config.js");
  }

  try {
    await connectWithUri(primary, dbName, poolSize);
    return;
  } catch (err) {
    let lastErr = err;
    logger.error(`Gagal menyambung ke MongoDB: ${err.message}`);

    if (primary.startsWith("mongodb+srv://") && isSrvDnsError(err)) {
      const dnsFallbackEnabled = applyDnsFallbackIfConfigured();

      if (dnsFallbackEnabled) {
        try {
          if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
        } catch (_) { }

        try {
          await connectWithUri(primary, dbName, poolSize, "MongoDB (SRV + DNS fallback)");
          return;
        } catch (retryErr) {
          lastErr = retryErr;
          logger.error(`Percobaan ulang SRV gagal: ${retryErr.message}`);
        }
      }

      if (direct) {
        logger.warn("Mencoba fallback URI non-SRV...");

        try {
          if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
        } catch (_) { }

        try {
          await connectWithUri(direct, dbName, poolSize, "MongoDB (direct URI)");
          return;
        } catch (directErr) {
          lastErr = directErr;
          logger.error(`Fallback direct URI juga gagal: ${directErr.message}`);
        }
      } else {
        logger.warn("Isi global.url_mongodb_direct atau env MONGODB_URL_DIRECT untuk fallback non-SRV.");
      }
    }

    logger.error("Bot tidak akan berjalan karena gagal terhubung ke MongoDB");
    throw lastErr;
  }
};

export async function connectDB() {
  if (mongoose.connection.readyState !== 1) {
    await connect();
  }
}

export function getNativeDb() {
  return mongoose.connection.db;
}

const userSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, unique: true },
    name: { type: String, default: "No Name" },
    username: { type: String, default: null },
    role: { type: String, default: "member" },
    balance: { type: Number, default: 0 },
    transaksi: { type: Number, default: 0 },
    membeli: { type: Number, default: 0 },
    isTelegram: { type: Boolean, default: true },
    total_nominal_transaksi: { type: Number, default: 0 },
    banned: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const botSchema = new mongoose.Schema(
  {
    botId: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    terjual: { type: Number, default: 0 },
    transaksi: { type: Number, default: 0 },
    soldtoday: { type: Number, default: 0 },
    trxtoday: { type: Number, default: 0 },
    total_nominal_transaksi: { type: Number, default: 0 },
    nominaltoday: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    botId: { type: Number, required: true, index: true },
    productId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    desc: { type: String, default: "" },
    snk: { type: String, default: "" },
    terjual: { type: Number, default: 0 },
  },
  { timestamps: true }
);
productSchema.index({ botId: 1, productId: 1 }, { unique: true });
productSchema.index({ botId: 1, terjual: -1 });

const productStockSchema = new mongoose.Schema(
  {
    botId: { type: Number, required: true, index: true },
    productId: { type: String, required: true, index: true },
    accountData: { type: String, required: true },
    isSold: { type: Boolean, default: false, index: true },
    trxRefId: { type: String, default: null },
  },
  { timestamps: true }
);

productStockSchema.index({ botId: 1, productId: 1, isSold: 1, createdAt: 1 });
productStockSchema.index(
  { trxRefId: 1 },
  { name: "uniqueTrxRefId", sparse: true }
);

const categorySchema = new mongoose.Schema(
  {
    botId: { type: Number, required: true, index: true },
    name: { type: String, required: true },
    products: [String],
  },
  { timestamps: true }
);
categorySchema.index({ botId: 1, name: 1 }, { unique: true });

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, index: true },
    botId: { type: Number, required: true, index: true },
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    price: { type: Number, required: true },
    status: { type: String, default: "completed" },
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, default: "balance" },
    snk: { type: String, default: "" },
    reffId: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ botId: 1, createdAt: -1 });

const authUserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, sparse: true },
    email: { type: String, required: true, unique: true, sparse: true },
    password: { type: String, required: true },
    telegramId: { type: Number, required: true, unique: true },
  },
  { timestamps: true }
);

authUserSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

authUserSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const digiflazzProductSchema = new mongoose.Schema(
  {
    botId: { type: Number, required: true, index: true },
    buyer_sku_code: { type: String, required: true, index: true },
    product_name: { type: String, required: true },
    category: { type: String, required: true, index: true },
    brand: { type: String, required: true },
    type: { type: String, required: true },
    seller_name: { type: String, required: true },
    price: { type: Number, required: true },
    buyer_product_status: { type: Boolean, default: true },
    seller_product_status: { type: Boolean, default: true },
    unlimited_stock: { type: Boolean, default: true },
    stock: { type: Number, default: 0 },
    multi: { type: Boolean, default: false },
    start_cut_off: { type: String, default: "" },
    end_cut_off: { type: String, default: "" },
    desc: { type: String, default: "" },
    markup: { type: Number, required: true },
    sellPrice: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    totalSold: { type: Number, default: 0 },
    lastSync: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
digiflazzProductSchema.index({ botId: 1, buyer_sku_code: 1 }, { unique: true });
digiflazzProductSchema.index({ botId: 1, category: 1, isActive: 1 });
digiflazzProductSchema.index({ botId: 1, brand: 1 });

const digiflazzTransactionSchema = new mongoose.Schema(
  {
    botId: { type: Number, required: true, index: true },
    userId: { type: Number, required: true, index: true },
    ref_id: { type: String, required: true, unique: true },
    buyer_sku_code: { type: String, required: true },
    customer_no: { type: String, required: true },
    product_name: { type: String, required: true },
    price: { type: Number, required: true },
    sellPrice: { type: Number, required: true },
    trx_id: { type: String, default: null },
    status: { type: String, default: "pending" },
    rc: { type: String, default: null },
    message: { type: String, default: null },
    sn: { type: String, default: null },
    buyer_last_saldo: { type: Number, default: null },
    paymentMethod: { type: String, default: "balance" },
    statusChatId: { type: Number, default: null },
    statusMessageId: { type: Number, default: null },
    statusNotificationMessageId: { type: Number, default: null },
    statusNotifiedAt: { type: Date, default: null },
    retryCount: { type: Number, default: 0 },
    lastChecked: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
digiflazzTransactionSchema.index({ userId: 1, createdAt: -1 });
digiflazzTransactionSchema.index({ status: 1, lastChecked: 1 });
digiflazzTransactionSchema.index({ trx_id: 1 }, { sparse: true });

export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const Bot = mongoose.models.Bot || mongoose.model("Bot", botSchema);
export const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema);
export const Category =
  mongoose.models.Category || mongoose.model("Category", categorySchema);
export const Transaction =
  mongoose.models.Transaction ||
  mongoose.model("Transaction", transactionSchema);
export const AuthUser =
  mongoose.models.AuthUser || mongoose.model("AuthUser", authUserSchema);
export const ProductStock =
  mongoose.models.ProductStock ||
  mongoose.model("ProductStock", productStockSchema);
export const DigiflazzProduct =
  mongoose.models.DigiflazzProduct ||
  mongoose.model("DigiflazzProduct", digiflazzProductSchema);
export const DigiflazzTransaction =
  mongoose.models.DigiflazzTransaction ||
  mongoose.model("DigiflazzTransaction", digiflazzTransactionSchema);

export async function startInit() {
  await User.init();
  await Bot.init();
  await Product.init();
  await Category.init();
  await Transaction.init();
  await ProductStock.init();
}

export async function checkUser(id) {
  try {
    const exist = await User.exists({ userId: id });
    return { success: true, data: !!exist };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function dbUser(id) {
  try {
    const user = await User.findOne({ userId: id }).lean();
    return { success: true, data: user };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function userRegister(id, name, username) {
  try {
    const exist = await User.exists({ userId: id });
    if (exist) return { success: false, error: "ID sudah digunakan." };

    const create = await User.create({ userId: id, name, username });
    return { success: true, data: create };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function updateUserProfile(id, name, username) {
  try {
    const update = await User.findOneAndUpdate(
      { userId: id },
      { $set: { name: name, username: username } },
      { new: true }
    ).lean();

    if (!update) return { success: false, error: "ID tidak ditemukan." };
    return { success: true, data: update };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function editBalance(id, amount) {
  try {
    if (!id || amount == null || isNaN(amount))
      throw new Error("Input tidak valid!");

    const update = await User.findOneAndUpdate(
      { userId: id },
      { $inc: { balance: amount } },
      { new: true }
    ).lean();

    if (!update) return { success: false, error: "ID tidak ditemukan." };
    return { success: true, data: update };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function deductBalanceIfEnough(id, amount) {
  try {
    if (!id || amount == null || isNaN(amount) || amount < 0)
      throw new Error("Input tidak valid!");
    const update = await User.findOneAndUpdate(
      { userId: id, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    ).lean();

    if (!update) return { success: false, error: "Saldo tidak mencukupi." };
    return { success: true, data: update };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function refundBalance(id, amount) {
  return editBalance(id, amount);
}

export async function banUser(id) {
  try {
    const update = await User.findOneAndUpdate(
      { userId: id },
      { $set: { isBanned: true } },
      { new: true }
    ).lean();
    if (!update) return { success: false, error: "User tidak ditemukan" };
    return { success: true, data: update };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function unbanUser(id) {
  try {
    const update = await User.findOneAndUpdate(
      { userId: id },
      { $set: { isBanned: false } },
      { new: true }
    ).lean();
    if (!update) return { success: false, error: "User tidak ditemukan" };
    return { success: true, data: update };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function editRole(id, role) {
  try {
    if (!id || !role) throw new Error("Masukan data id dan role!");
    const update = await User.findOneAndUpdate(
      { userId: id },
      { $set: { role } },
      { new: true }
    ).lean();
    if (!update) return { success: false, error: "ID tidak ditemukan." };
    return { success: true, data: update };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getAllUsers() {
  try {
    const users = await User.find({}).select("-__v").lean();
    return { success: true, data: users };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function deleteUser(userId) {
  try {
    const user = await User.findOneAndDelete({ userId });
    if (!user) return { success: false, error: "User tidak ditemukan." };
    await AuthUser.deleteOne({ telegramId: userId });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getTelegramUsers() {
  try {
    let data = await User.find({ isTelegram: true })
      .select("userId name")
      .lean();
    return data;
  } catch (error) {
    return [];
  }
}

export async function checkDbBot(id) {
  try {
    const exist = await Bot.exists({ botId: id });
    return { success: true, data: !!exist };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function createDbBot(id, name) {
  try {
    const exist = await Bot.findOne({ botId: id });
    if (exist) return { success: false, error: "ID bot sudah terdaftar." };
    const create = await Bot.create({ botId: id, name });
    return { success: true, data: create };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getBotSimple(botId) {
  try {
    const bot = await Bot.findOne({ botId }).lean();
    if (!bot) return { success: false, error: "Bot tidak ditemukan" };
    return { success: true, data: bot };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function dbBot(botId) {
  try {
    const botPromise = Bot.findOne({ botId }).lean();
    const productsPromise = Product.find({ botId }).lean();
    const categoriesPromise = Category.find({ botId }).lean();

    const stockPromise = ProductStock.aggregate([
      { $match: { botId: botId, isSold: false } },
      { $group: { _id: "$productId", count: { $sum: 1 } } },
    ]);

    const [bot, products, categories, stockAgg] = await Promise.all([
      botPromise,
      productsPromise,
      categoriesPromise,
      stockPromise,
    ]);

    if (!bot) return { success: false, message: "Bot not found" };

    const stockMap = {};
    stockAgg.forEach((s) => (stockMap[s._id] = s.count));

    const productMap = new Map();
    products.forEach((p) => {
      productMap.set(p.productId, {
        ...p,
        stock: stockMap[p.productId] || 0,
      });
    });

    const viewMap = new Map();
    categories.forEach((c) => {
      viewMap.set(c.name, { id: c.products });
    });

    const resultBot = { ...bot };
    resultBot.product = productMap;
    resultBot.product_view = viewMap;

    return { success: true, data: resultBot };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function getCategory(botId) {
  try {
    const categories = await Category.find({ botId }).lean();
    const catObj = {};
    categories.forEach((c) => {
      catObj[c.name] = c.products;
    });
    return { success: true, data: catObj };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get kategori gabungan (reguler + Digiflazz)
 * Menggabungkan kategori produk reguler dengan kategori Digiflazz
 */
export async function getCombinedCategories(botId) {
  try {
    // Get kategori reguler
    const regularCategories = await Category.find({ botId })
      .select("name products")
      .lean();
    
    // Get kategori Digiflazz jika enabled
    let digiflazzCategories = [];
    if (global.digiflazz?.enabled) {
      digiflazzCategories = await DigiflazzProduct.distinct("category", {
        botId,
        isActive: true,
        buyer_product_status: true,
        seller_product_status: true,
      });
    }
    
    // Gabungkan
    const combined = {};
    
    // Tambahkan kategori reguler
    for (const cat of regularCategories) {
      combined[cat.name] = {
        type: 'regular',
        products: cat.products
      };
    }
    
    // Tambahkan kategori Digiflazz dengan prefix emoji
    for (const cat of digiflazzCategories) {
      const displayName = cat;
      combined[displayName] = {
        type: 'digiflazz',
        category: cat
      };
    }
    
    return { success: true, data: combined };
  } catch (e) {
    return { success: false, error: e.message };
  }
}


/**
 * Get kategori gabungan (reguler + Digiflazz brands)
 * Hanya menampilkan brand Digiflazz yang sudah ditambahkan di produk prabayar
 */
export async function getCombinedCategoriesWithBrands(botId) {
  try {
    // Get kategori reguler
    const regularCategories = await Category.find({ botId })
      .select("name products")
      .lean();
    
    // Get brand Digiflazz jika enabled
    let digiflazzBrands = [];
    if (global.digiflazz?.enabled) {
      digiflazzBrands = await DigiflazzProduct.distinct("brand", {
        botId,
        isActive: true,
        buyer_product_status: true,
        seller_product_status: true,
      });
    }
    
    // Gabungkan dengan format yang SAMA seperti getCategory
    const combined = {};
    
    // Tambahkan kategori reguler
    for (const cat of regularCategories) {
      combined[cat.name] = cat.products;  // Langsung array, bukan object!
    }
    
    // Tambahkan brand Digiflazz dengan prefix emoji
    // Gunakan array kosong karena produk akan di-handle berbeda
    for (const brand of digiflazzBrands) {
      const displayName = brand;
      combined[displayName] = [`__digiflazz_brand__${brand}`];  // Marker khusus
    }
    
    return { success: true, data: combined };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get produk Digiflazz by brand (tanpa perlu category)
 */
export async function getDigiflazzProductsByBrand(botId, brand) {
  try {
    const products = await DigiflazzProduct.find({
      botId,
      brand,
      isActive: true,
      buyer_product_status: true,
      seller_product_status: true,
    })
      .sort({ sellPrice: 1 })
      .lean();
    
    return { success: true, data: products };
  } catch (e) {
    return { success: false, error: e.message };
  }
}


export async function getProductList(botId) {
  try {
    const [products, stockAgg] = await Promise.all([
      Product.find({ botId }).lean(),
      ProductStock.aggregate([
        { $match: { botId: botId, isSold: false } },
        { $group: { _id: "$productId", count: { $sum: 1 } } },
      ]),
    ]);

    const stockMap = {};
    stockAgg.forEach((s) => (stockMap[s._id] = s.count));

    const result = products.map((p) => ({
      ...p,
      stock: stockMap[p.productId] || 0,
    }));

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function getProductDetails(botId, productId) {
  try {
    const [product, stockCount] = await Promise.all([
      Product.findOne({ botId, productId }).lean(),
      ProductStock.countDocuments({ botId, productId, isSold: false }),
    ]);

    if (!product) return { success: false, error: "Produk tidak ditemukan." };

    return { success: true, data: { ...product, stock: stockCount } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function takeProductAccount(
  botId,
  productId,
  total = 1,
  trxRefId = null
) {
  await connectDB();
  if (!trxRefId) throw new Error("trxRefId wajib.");
  if (total <= 0) return { success: false, error: "Jumlah harus > 0." };

  const lockKey = `alloc:${botId}:${productId}`;
  if (!processingLocks.lock(lockKey, 20000)) {
    return {
      success: false,
      error: "Sedang diproses, coba lagi sebentar lagi.",
    };
  }

  try {
    const candidates = await ProductStock.find({
      botId,
      productId,
      isSold: false,
    })
      .sort({ createdAt: 1 })
      .limit(total)
      .select("_id accountData")
      .lean();

    if (!candidates || candidates.length < total) {
      return { success: false, error: "Stok tidak mencukupi." };
    }

    const ids = candidates.map((d) => d._id);
    const chunkSize = 2000;
    const chunkedIds = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      chunkedIds.push(ids.slice(i, i + chunkSize));
    }

    const updatePromises = chunkedIds.map((chunk) =>
      ProductStock.updateMany(
        { _id: { $in: chunk }, isSold: false },
        { $set: { isSold: true, trxRefId: trxRefId } }
      )
    );

    await Promise.all(updatePromises);
    const takenAccounts = candidates.map((d) => d.accountData);
    return { success: true, data: takenAccounts, trxRefId };
  } catch (err) {
    try {
      if (trxRefId)
        await ProductStock.updateMany(
          { trxRefId: trxRefId },
          { $set: { isSold: false, trxRefId: null } }
        );
    } catch (e) { }
    return { success: false, error: err.message };
  } finally {
    processingLocks.unlock(lockKey);
  }
}

export async function addTransactionHistory(
  userId,
  botId,
  productId,
  productName,
  quantity,
  price,
  status,
  paymentMethod,
  snk,
  reffId
) {
  try {
    const totalAmount = price * quantity;
    const newTrx = await Transaction.create({
      userId,
      botId,
      productId,
      productName,
      quantity,
      price,
      status: status || "completed",
      totalAmount,
      paymentMethod: paymentMethod || "balance",
      snk: snk || "",
      reffId,
    });
    return { success: true, data: newTrx };
  } catch (e) {
    if (e.code === 11000)
      return { success: false, error: "Duplicate transaction (reffId)." };
    return { success: false, error: e.message };
  }
}

export async function addUserTransaction(
  userId,
  totalTransaksi,
  totalMembeli,
  nominal
) {
  try {
    const update = await User.findOneAndUpdate(
      { userId },
      {
        $inc: {
          transaksi: totalTransaksi,
          membeli: totalMembeli,
          total_nominal_transaksi: nominal,
        },
      },
      { new: true }
    );
    return { success: true, data: update };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function addBotTransaction(
  botId,
  totalTransaksi = 1,
  totalNominal = 0
) {
  try {
    const update = await Bot.findOneAndUpdate(
      { botId },
      {
        $inc: {
          transaksi: totalTransaksi,
          total_nominal_transaksi: totalNominal,
        },
      },
      { new: true }
    );
    return { success: true, data: update };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function addProductSold(botId, productId, totalTerjual) {
  try {
    await Bot.findOneAndUpdate({ botId }, { $inc: { terjual: totalTerjual } });
    const updated = await Product.findOneAndUpdate(
      { botId, productId },
      { $inc: { terjual: totalTerjual } },
      { new: true }
    );
    return { success: true, data: updated };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function recordSale(botId, productCode, quantity, finalPrice) {
  try {
    await Product.updateOne(
      { botId, productId: productCode },
      { $inc: { terjual: quantity } }
    );
    await Bot.findOneAndUpdate(
      { botId },
      { $inc: { terjual: quantity, soldtoday: quantity, trxtoday: finalPrice } }
    );

    addDailyStats(quantity, finalPrice);
  } catch (dbError) {
    console.error("Stats update error:", dbError);
  }
}

export async function addProduct(botId, productData) {
  try {
    const exists = await Product.exists({ botId, productId: productData.id });
    if (exists) return { success: false, error: "ID produk sudah ada." };

    const newProduct = await Product.create({
      botId,
      productId: productData.id,
      name: productData.name,
      price: productData.price,
      desc: productData.desc || "",
      snk: productData.snk || "",
      terjual: 0,
    });
    return { success: true, data: newProduct };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function addStock(botId, productId, accounts = []) {
  try {
    const productExists = await Product.exists({ botId, productId });
    if (!productExists)
      return { success: false, error: "Produk tidak ditemukan." };

    const stockDocs = accounts.map((accountData) => ({
      botId,
      productId,
      accountData,
      isSold: false,
    }));
    const result = await ProductStock.insertMany(stockDocs);
    return { success: true, data: { insertedCount: result.length } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function addProductStock(botId, productId, accounts) {
  const res = await addStock(botId, productId, accounts);
  if (res.success) {
    const stockCount = await ProductStock.countDocuments({
      botId,
      productId,
      isSold: false,
    });
    return { success: true, data: { stock: stockCount } };
  }
  return res;
}

export async function deleteProduct(botId, productId) {
  try {
    const result = await Product.deleteOne({ botId, productId });
    if (result.deletedCount === 0)
      return { success: false, error: "Produk tidak ditemukan." };

    await ProductStock.deleteMany({ botId, productId });
    await Category.updateMany({ botId }, { $pull: { products: productId } });

    return { success: true, data: `Produk ${productId} berhasil dihapus.` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function editProductName(botId, productId, newName) {
  try {
    const product = await Product.findOneAndUpdate(
      { botId, productId },
      { name: newName },
      { new: true }
    );
    if (!product) return { success: false, error: "Produk tidak ditemukan." };
    return { success: true, data: product };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function editProductPrice(botId, productId, newPrice) {
  try {
    const product = await Product.findOneAndUpdate(
      { botId, productId },
      { price: Number(newPrice) },
      { new: true }
    );
    if (!product) return { success: false, error: "Produk tidak ditemukan." };
    return { success: true, data: product };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function editProductDesk(botId, productId, newDesc) {
  try {
    const product = await Product.findOneAndUpdate(
      { botId, productId },
      { desc: newDesc },
      { new: true }
    );
    if (!product) return { success: false, error: "Produk tidak ditemukan." };
    return { success: true, data: product };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function editProductSnk(botId, productId, newSnk) {
  try {
    const product = await Product.findOneAndUpdate(
      { botId, productId },
      { snk: newSnk },
      { new: true }
    );
    if (!product) return { success: false, error: "Produk tidak ditemukan." };
    return { success: true, data: product };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function editProductID(botId, oldId, newId) {
  try {
    const checkNew = await Product.findOne({ botId, productId: newId });
    if (checkNew) return { success: false, error: "ID baru sudah digunakan." };

    const product = await Product.findOneAndUpdate(
      { botId, productId: oldId },
      { productId: newId },
      { new: true }
    );
    if (!product) return { success: false, error: "Produk tidak ditemukan." };

    await ProductStock.updateMany(
      { botId, productId: oldId },
      { $set: { productId: newId } }
    );

    const cats = await Category.find({ botId, products: oldId });
    for (let cat of cats) {
      const idx = cat.products.indexOf(oldId);
      if (idx !== -1) {
        cat.products[idx] = newId;
        await cat.save();
      }
    }
    return { success: true, data: product };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getProductAccount(botId, productId, total = 1) {
  try {
    const accounts = await ProductStock.find({
      botId,
      productId,
      isSold: false,
    })
      .select("accountData")
      .limit(total)
      .lean();
    const accountStrings = accounts.map((doc) => doc.accountData);
    return { success: true, data: accountStrings };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function addCategory(botId, categoryName, productIds) {
  try {
    const botExists = await Bot.exists({ botId });
    if (!botExists) return { success: false, error: "Bot tidak ditemukan." };
    const exist = await Category.exists({ botId, name: categoryName });
    if (exist) return { success: false, error: "Kategori sudah ada." };
    await Category.create({ botId, name: categoryName, products: productIds });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function updateCategory(botId, categoryName, productIds) {
  try {
    const category = await Category.findOneAndUpdate(
      { botId, name: categoryName },
      { products: productIds },
      { new: true }
    );
    if (!category)
      return { success: false, error: "Kategori tidak ditemukan." };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function deleteCategory(botId, categoryName) {
  try {
    const res = await Category.deleteOne({ botId, name: categoryName });
    if (res.deletedCount === 0)
      return { success: false, error: "Kategori tidak ditemukan." };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getPublicStats(botId) {
  try {
    const bot = await Bot.findOne({ botId })
      .select("total_nominal_transaksi terjual")
      .lean();
    if (!bot) return { success: false, error: "Bot stats not ready" };
    return {
      success: true,
      data: {
        totalRevenue: bot.total_nominal_transaksi || 0,
        totalProductsSold: bot.terjual || 0,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function getAdminStats(botId) {
  try {
    const [totalUsers, totalTransactions, totalProducts, bot] =
      await Promise.all([
        User.countDocuments({}),
        Transaction.countDocuments({ botId }),
        Product.countDocuments({ botId }),
        Bot.findOne({ botId }).select("total_nominal_transaksi terjual").lean(),
      ]);
    return {
      success: true,
      data: {
        totalUsers,
        totalTransactions,
        totalProducts,
        totalRevenue: bot ? bot.total_nominal_transaksi : 0,
        totalProductsSold: bot ? bot.terjual : 0,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function addBotTransactionDetailed(
  botId,
  totalTransaksi,
  totalTerjual,
  totalSoldToday,
  totalTrxToday,
  nominalLifetime,
  nominalToday
) {
  try {
    const update = await Bot.findOneAndUpdate(
      { botId },
      {
        $inc: {
          transaksi: totalTransaksi,
          terjual: totalTerjual,
          soldtoday: totalSoldToday,
          trxtoday: totalTrxToday,
          total_nominal_transaksi: nominalLifetime,
          nominaltoday: nominalToday,
        },
      },
      { new: true }
    );
    if (!update) return { success: false, error: "ID Bot tidak ditemukan." };
    return { success: true, data: update };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getTransactionDetails(reffId) {
  try {
    const transaction = await Transaction.findOne({ reffId }).lean();
    if (!transaction)
      return { success: false, error: "Transaksi tidak ditemukan." };
    const soldAccounts = await ProductStock.find({ trxRefId: reffId })
      .select("accountData")
      .lean();
    transaction.accounts = soldAccounts.map((doc) => doc.accountData);
    return { success: true, data: transaction };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getAllTransactions(botId) {
  try {
    const transactions = await Transaction.find({ botId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return { success: true, data: transactions };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function calculateTotalRevenue() {
  try {
    const result = await Transaction.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    return result[0]?.total || 0;
  } catch (err) {
    return 0;
  }
}

export async function getRevenueByDate(startDate, endDate) {
  try {
    const result = await Transaction.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    return result[0]?.total || 0;
  } catch (err) {
    return 0;
  }
}

export async function calculateTotalPcs() {
  try {
    const result = await Transaction.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, totalPcs: { $sum: "$quantity" } } },
    ]);
    return result[0]?.totalPcs || 0;
  } catch (err) {
    return 0;
  }
}

export async function getPcsPerProduk() {
  try {
    const result = await Transaction.aggregate([
      { $match: { status: "completed" } },
      {
        $group: {
          _id: "$productId",
          productName: { $first: "$productName" },
          totalPcs: { $sum: "$quantity" },
          totalRevenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { totalPcs: -1 } },
    ]);
    return result;
  } catch (err) {
    return [];
  }
}

export async function getPcsTerjualPerProduk(productId) {
  try {
    const result = await Transaction.aggregate([
      { $match: { status: "completed", productId } },
      { $group: { _id: "$productId", totalPcs: { $sum: "$quantity" } } },
    ]);
    return result[0]?.totalPcs || 0;
  } catch (err) {
    return 0;
  }
}

async function pcsPerProdukDariTransaksi(botId) {
  const hasil = await Transaction.aggregate([
    { $match: { status: "completed", botId } },
    {
      $group: {
        _id: "$productId",
        namaProduk: { $first: "$productName" },
        totalPcs: { $sum: "$quantity" },
        totalPendapatan: { $sum: "$totalAmount" },
      },
    },
    { $sort: { totalPcs: -1 } },
  ]);
  return hasil;
}

export async function totalTransaksi(botId) {
  try {
    let data = await pcsPerProdukDariTransaksi(botId);
    let totalPcs = 0;
    let totalPendapatan = 0;
    data.forEach((item) => {
      totalPcs += item.totalPcs;
      totalPendapatan += item.totalPendapatan;
    });
    return { totalPcs, totalPendapatan };
  } catch (e) {
    return { totalPcs: 0, totalPendapatan: 0 };
  }
}

export async function getProdukPopuler(botId, limit = 10) {
  try {
    const popular = await Product.find({ botId })
      .sort({ terjual: -1 })
      .limit(limit)
      .select("productId name terjual price")
      .lean();

    const formatted = popular.map((p) => ({
      _id: p.productId,
      productName: p.name,
      totalSold: p.terjual,
      totalRevenue: p.terjual * p.price,
      lastTransaction: null,
    }));

    return { success: true, data: formatted };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function getUserTransactionHistory(userId, limit = 10, skip = 0) {
  try {
    const history = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    const total = await Transaction.countDocuments({ userId });
    return { success: true, data: history, total };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getBotGlobalTransactionHistory(
  botId,
  limit = 10,
  skip = 0
) {
  try {
    const history = await Transaction.find({ botId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);
    return { success: true, data: history };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getDBData(fn, ...args) {
  try {
    const result = await fn(...args);
    if (!result.success) throw new Error(result.message);
    return result.data;
  } catch (e) {
    return null;
  }
}

export async function getLeaderboard(botId, limit = 10) {
  try {
    const topUsers = await Transaction.aggregate([
      { $match: { botId: botId, status: "completed" } },
      {
        $group: {
          _id: "$userId",
          totalRevenue: { $sum: "$totalAmount" },
          totalTransactions: { $sum: 1 },
          totalPcs: { $sum: "$quantity" },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: limit },
    ]);

    const formattedResult = topUsers.map((user) => ({
      userId: user._id,
      totalRevenue: user.totalRevenue,
      totalTransactions: user.totalTransactions,
      totalPcs: user.totalPcs,
    }));

    return { success: true, data: formattedResult };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================================
// DIGIFLAZZ FUNCTIONS
// ============================================

/**
 * Sync produk dari Digiflazz ke database
 */
export async function syncDigiflazzProducts(botId, products) {
  try {
    const { calculateSellPrice } = await import("./digiflazz.js");
    const now = new Date();
    const skuCodes = [];
    const validProducts = products.filter((product) =>
      String(product?.buyer_sku_code || "").trim()
    );
    
    const bulkOps = validProducts.map((product) => {
      const buyerSkuCode = String(product.buyer_sku_code || "").trim();
      skuCodes.push(buyerSkuCode);

      const buyerStatus = normalizeDigiflazzStatus(product.buyer_product_status);
      const sellerStatus = normalizeDigiflazzStatus(product.seller_product_status);
      const { markup, sellPrice } = calculateSellPrice(Number(product.price) || 0);
      
      return {
        updateOne: {
          filter: { botId, buyer_sku_code: buyerSkuCode },
          update: {
            $set: {
              product_name: String(product.product_name || buyerSkuCode),
              category: String(product.category || "Lainnya"),
              brand: String(product.brand || "Lainnya"),
              type: String(product.type || "prepaid"),
              seller_name: String(product.seller_name || "Digiflazz"),
              price: Number(product.price) || 0,
              buyer_product_status: buyerStatus,
              seller_product_status: sellerStatus,
              unlimited_stock: normalizeDigiflazzStatus(product.unlimited_stock),
              stock: Number(product.stock) || 0,
              multi: normalizeDigiflazzStatus(product.multi),
              start_cut_off: String(product.start_cut_off || ""),
              end_cut_off: String(product.end_cut_off || ""),
              desc: String(product.desc || ""),
              markup,
              sellPrice,
              isActive: buyerStatus && sellerStatus,
              lastSync: now,
            },
            $setOnInsert: {
              botId,
              buyer_sku_code: buyerSkuCode,
              totalSold: 0,
            },
          },
          upsert: true,
        },
      };
    });

    const result = bulkOps.length
      ? await DigiflazzProduct.bulkWrite(bulkOps)
      : { upsertedCount: 0, modifiedCount: 0 };
    const staleResult = skuCodes.length
      ? await DigiflazzProduct.updateMany(
          { botId, buyer_sku_code: { $nin: skuCodes }, isActive: true },
          { $set: { isActive: false, lastSync: now } }
        )
      : { modifiedCount: 0 };
    
    return {
      success: true,
      data: {
        inserted: result.upsertedCount,
        updated: result.modifiedCount,
        deactivated: staleResult.modifiedCount || 0,
        total: products.length,
        skipped: products.length - validProducts.length,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function normalizeDigiflazzStatus(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;

  return ["true", "1", "yes", "y", "active", "aktif", "available", "open"].includes(normalized);
}

/**
 * Get produk Digiflazz dengan filter
 */
export async function getDigiflazzProducts(botId, filters = {}) {
  try {
    const query = { botId, isActive: true };
    
    if (filters.category) query.category = filters.category;
    if (filters.brand) query.brand = filters.brand;
    if (filters.type) query.type = filters.type;
    
    const products = await DigiflazzProduct.find(query)
      .sort({ sellPrice: 1 })
      .lean();
    
    return { success: true, data: products };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get produk Digiflazz by SKU code
 */
export async function getDigiflazzProductByCode(botId, buyer_sku_code) {
  try {
    const product = await DigiflazzProduct.findOne({
      botId,
      buyer_sku_code,
      isActive: true,
    }).lean();
    
    if (!product) {
      return { success: false, error: "Produk tidak ditemukan" };
    }
    
    return { success: true, data: product };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get kategori produk Digiflazz yang tersedia
 */
export async function getDigiflazzCategories(botId) {
  try {
    const categories = await DigiflazzProduct.distinct("category", {
      botId,
      isActive: true,
    });
    
    return { success: true, data: categories };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get brand dalam kategori tertentu
 */
export async function getDigiflazzBrands(botId, category) {
  try {
    const brands = await DigiflazzProduct.distinct("brand", {
      botId,
      category,
      isActive: true,
    });
    
    return { success: true, data: brands };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Create transaksi Digiflazz
 */
export async function createDigiflazzTransaction(data) {
  try {
    const transaction = await DigiflazzTransaction.create(data);
    return { success: true, data: transaction };
  } catch (e) {
    if (e.code === 11000) {
      return { success: false, error: "Duplicate transaction ref_id" };
    }
    return { success: false, error: e.message };
  }
}

/**
 * Update transaksi Digiflazz
 */
export async function updateDigiflazzTransaction(ref_id, updateData) {
  try {
    const transaction = await DigiflazzTransaction.findOneAndUpdate(
      { ref_id },
      { $set: { ...updateData, lastChecked: new Date() } },
      { new: true }
    ).lean();
    
    if (!transaction) {
      return { success: false, error: "Transaksi tidak ditemukan" };
    }
    
    return { success: true, data: transaction };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Klaim transaksi final agar notifikasi, refund, dan sold count tidak dobel.
 */
export async function claimDigiflazzFinalProcessing(ref_id, updateData = {}) {
  try {
    const transaction = await DigiflazzTransaction.findOneAndUpdate(
      { ref_id, statusNotifiedAt: null },
      { $set: { ...updateData, statusNotifiedAt: new Date(), lastChecked: new Date() } },
      { new: true }
    ).lean();

    if (!transaction) {
      return { success: false, skipped: true, error: "Transaksi sudah diproses/notified" };
    }

    return { success: true, data: transaction };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get transaksi Digiflazz by ref_id
 */
export async function getDigiflazzTransaction(ref_id) {
  try {
    const transaction = await DigiflazzTransaction.findOne({ ref_id }).lean();
    
    if (!transaction) {
      return { success: false, error: "Transaksi tidak ditemukan" };
    }
    
    return { success: true, data: transaction };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get transaksi pending untuk polling
 */
export async function getPendingDigiflazzTransactions(limit = 50) {
  try {
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    
    const transactions = await DigiflazzTransaction.find({
      status: { $regex: /^pending$/i },
      statusNotifiedAt: null,
      lastChecked: { $lt: thirtySecondsAgo },
      retryCount: { $lt: 10 },
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
    
    return { success: true, data: transactions };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get riwayat transaksi Digiflazz user
 */
export async function getUserDigiflazzHistory(userId, limit = 10, skip = 0) {
  try {
    const transactions = await DigiflazzTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    
    const total = await DigiflazzTransaction.countDocuments({ userId });
    
    return { success: true, data: transactions, total };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Increment total sold untuk produk Digiflazz
 */
export async function incrementDigiflazzProductSold(botId, buyer_sku_code) {
  try {
    await DigiflazzProduct.findOneAndUpdate(
      { botId, buyer_sku_code },
      { $inc: { totalSold: 1 } }
    );
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get statistik Digiflazz
 */
export async function getDigiflazzStats(botId) {
  try {
    const [totalProducts, totalTransactions, successTransactions, pendingTransactions] = await Promise.all([
      DigiflazzProduct.countDocuments({ botId, isActive: true }),
      DigiflazzTransaction.countDocuments({ botId }),
      DigiflazzTransaction.countDocuments({ botId, status: "success" }),
      DigiflazzTransaction.countDocuments({ botId, status: "pending" }),
    ]);
    
    const revenueResult = await DigiflazzTransaction.aggregate([
      { $match: { botId, status: "success" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $subtract: ["$sellPrice", "$price"] } },
          totalSales: { $sum: "$sellPrice" },
        },
      },
    ]);
    
    const revenue = revenueResult[0] || { totalRevenue: 0, totalSales: 0 };
    
    return {
      success: true,
      data: {
        totalProducts,
        totalTransactions,
        successTransactions,
        pendingTransactions,
        failedTransactions: totalTransactions - successTransactions - pendingTransactions,
        totalRevenue: revenue.totalRevenue,
        totalSales: revenue.totalSales,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
