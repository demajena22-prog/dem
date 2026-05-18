import "../config.js";
import crypto from "crypto";
import axios from "axios";

const BASE_URL = "https://api.digiflazz.com/v1";
const PRICE_LIST_CACHE_TTL = Number(process.env.DIGIFLAZZ_PRICE_LIST_CACHE_TTL || 30 * 60 * 1000);
let priceListCache = null;

/**
 * Generate MD5 signature untuk autentikasi Digiflazz
 * @param {string} username - Username Digiflazz
 * @param {string} apiKey - API Key Digiflazz
 * @param {string} refId - Reference ID transaksi
 * @returns {string} MD5 signature
 */
function generateSignature(username, apiKey, refId) {
  const data = username + apiKey + refId;
  return crypto.createHash("md5").update(data).digest("hex");
}

/**
 * Cek saldo akun Digiflazz
 * @returns {Promise<Object>} Response dengan data saldo
 */
export async function checkBalance() {
  try {
    const { username, apiKey } = global.digiflazz;
    
    if (!username || !apiKey) {
      throw new Error("Kredensial Digiflazz tidak lengkap");
    }

    const cmd = "deposit";
    const sign = generateSignature(username, apiKey, cmd);

    const payload = {
      cmd,
      username,
      sign,
    };

    const endpoint = `${BASE_URL}/cek-saldo`;
    
    // Log request for debugging
    const { logger } = await import("./logger.js");
    logger.digiflazz.request(endpoint, payload);

    const response = await axios.post(endpoint, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    // Log response for debugging
    logger.digiflazz.response(endpoint, response.status, response.data);

    // Validate response structure
    if (!response.data || typeof response.data !== 'object') {
      throw new Error("Response tidak valid dari Digiflazz");
    }

    // Handle different response structures
    if (response.data.data) {
      return {
        success: true,
        data: response.data.data,
      };
    }

    // Some endpoints return data directly
    if (response.data.deposit !== undefined) {
      return {
        success: true,
        data: response.data,
      };
    }

    throw new Error("Format response tidak sesuai");
  } catch (error) {
    const { logger } = await import("./logger.js");
    logger.digiflazz.error(`${BASE_URL}/cek-saldo`, error);
    
    return {
      success: false,
      error: error.response?.data?.data?.message || error.response?.data?.message || error.message,
    };
  }
}

/**
 * Ambil daftar harga produk dari Digiflazz
 * @param {string} filterType - Filter tipe produk (opsional)
 * @returns {Promise<Object>} Response dengan daftar produk
 */
export async function getPriceList(filterType = null) {
  try {
    const { username, apiKey, mode } = global.digiflazz;
    
    if (!username || !apiKey) {
      throw new Error("Kredensial Digiflazz tidak lengkap");
    }

    const cmd = "prepaid";
    const sign = generateSignature(username, apiKey, cmd);

    const payload = {
      cmd,
      username,
      sign,
    };

    // Filter berdasarkan tipe jika ada
    if (filterType) {
      payload.filter_type = filterType;
    }

    const endpoint = `${BASE_URL}/price-list`;
    
    // Log request for debugging
    const { logger } = await import("./logger.js");
    logger.digiflazz.request(endpoint, payload);

    const response = await axios.post(endpoint, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000, // 60 detik karena response bisa besar
    });

    // Log response for debugging
    logger.digiflazz.response(endpoint, response.status, response.data);

    // Validate response structure
    if (!response.data || typeof response.data !== 'object') {
      throw new Error("Response tidak valid dari Digiflazz");
    }

    const productData = extractProductList(response.data);

    if (!productData) {
      const digiflazzMessage = response.data?.data?.message || response.data?.message || response.data?.rc;
      logger.error("Format response tidak valid", { response: response.data });
      if (isPriceListRateLimit(digiflazzMessage) && getCachedPriceList(filterType)) {
        return getCachedPriceList(filterType);
      }

      return {
        success: false,
        error: digiflazzMessage || "Format response tidak valid - data produk tidak ditemukan",
      };
    }

    setCachedPriceList(productData);
    return {
      success: true,
      data: productData,
      count: productData.length,
    };
  } catch (error) {
    const { logger } = await import("./logger.js");
    logger.digiflazz.error(`${BASE_URL}/price-list`, error);
    const errorMessage = error.response?.data?.data?.message || error.response?.data?.message || error.message;

    if (isPriceListRateLimit(errorMessage) && getCachedPriceList(filterType)) {
      return getCachedPriceList(filterType);
    }
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

function getCachedPriceList(filterType = null) {
  if (!priceListCache) return null;
  const isFresh = Date.now() - priceListCache.createdAt <= PRICE_LIST_CACHE_TTL;
  if (!isFresh) return null;

  let data = priceListCache.data;
  if (filterType) {
    data = data.filter((p) => String(p.type || "").toLowerCase() === String(filterType).toLowerCase());
  }

  return {
    success: true,
    data,
    count: data.length,
    cached: true,
  };
}

function setCachedPriceList(data) {
  priceListCache = {
    data,
    createdAt: Date.now(),
  };
}

function isPriceListRateLimit(message) {
  return /limitasi|limit|too many|rate/i.test(String(message || ""));
}

function extractProductList(responseData) {
  if (Array.isArray(responseData)) return responseData;
  if (!responseData || typeof responseData !== "object") return null;

  const candidates = [
    responseData.data,
    responseData.data?.data,
    responseData.data?.products,
    responseData.data?.product,
    responseData.products,
    responseData.product,
    responseData.price_list,
    responseData.pricelist,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return null;
}

/**
 * Buat transaksi topup ke Digiflazz
 * @param {Object} params - Parameter transaksi
 * @param {string} params.buyer_sku_code - Kode SKU produk
 * @param {string} params.customer_no - Nomor tujuan (HP, ID game, dll)
 * @param {string} params.ref_id - Reference ID unik dari sistem kita
 * @param {boolean} params.testing - Mode testing (default: false)
 * @returns {Promise<Object>} Response transaksi
 */
export async function createTransaction({ buyer_sku_code, customer_no, ref_id, testing = false }) {
  try {
    const { username, apiKey, mode } = global.digiflazz;
    
    if (!username || !apiKey) {
      throw new Error("Kredensial Digiflazz tidak lengkap");
    }

    const sign = generateSignature(username, apiKey, ref_id);

    const payload = {
      username,
      buyer_sku_code,
      customer_no,
      ref_id,
      sign,
    };

    // Jika mode development atau testing, tambahkan flag testing
    if (mode === "development" || testing) {
      payload.testing = true;
    }

    const endpoint = `${BASE_URL}/transaction`;
    const { logger } = await import("./logger.js");
    logger.digiflazz.request(endpoint, payload);

    const response = await axios.post(endpoint, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000, // 60 detik untuk transaksi
    });

    logger.digiflazz.response(endpoint, response.status, response.data);

    const result = response.data?.data;

    if (!result || typeof result !== "object") {
      return {
        success: false,
        error: response.data?.message || "Format response transaksi Digiflazz tidak valid",
        data: {
          ref_id,
          status: "failed",
          rc: "99",
          message: response.data?.message || "Format response transaksi Digiflazz tidak valid",
        },
      };
    }

    const status = String(result.status || "").trim().toLowerCase();
    const rc = String(result.rc || "").trim();
    const isImmediateFailure = status === "failed" || status === "gagal" || (rc && !["00", "03"].includes(rc) && status !== "pending");

    if (isImmediateFailure) {
      return {
        success: false,
        error: result.message || "Transaksi ditolak Digiflazz",
        data: {
          ref_id: result.ref_id || ref_id,
          status: result.status || "failed",
          rc: result.rc || "99",
          message: result.message || "Transaksi ditolak Digiflazz",
        },
      };
    }

    return {
      success: true,
      data: {
        ref_id: result.ref_id,
        trx_id: result.trx_id || null,
        status: result.status,
        rc: result.rc,
        message: result.message,
        sn: result.sn || null,
        buyer_sku_code: result.buyer_sku_code,
        customer_no: result.customer_no,
        product_name: result.product_name,
        price: result.price,
        buyer_last_saldo: result.buyer_last_saldo,
      },
    };
  } catch (error) {
    const { logger } = await import("./logger.js");
    logger.digiflazz.error(`${BASE_URL}/transaction`, error);
    
    // Jika ada response dari server
    if (error.response?.data?.data) {
      const errorData = error.response.data.data;
      return {
        success: false,
        error: errorData.message || "Transaksi gagal",
        data: {
          ref_id: errorData.ref_id || ref_id,
          status: errorData.status || "failed",
          rc: errorData.rc || "99",
          message: errorData.message || "Transaksi gagal",
        },
      };
    }

    return {
      success: false,
      error: error.message,
      data: {
        ref_id,
        status: "failed",
        rc: "99",
        message: error.message,
      },
    };
  }
}

/**
 * Cek status transaksi dari Digiflazz
 * @param {string} buyer_sku_code - Kode SKU produk
 * @param {string} customer_no - Nomor tujuan
 * @param {string} ref_id - Reference ID transaksi
 * @returns {Promise<Object>} Response status transaksi
 */
export async function checkTransactionStatus(buyer_sku_code, customer_no, ref_id) {
  try {
    const { username, apiKey } = global.digiflazz;
    
    if (!username || !apiKey) {
      throw new Error("Kredensial Digiflazz tidak lengkap");
    }

    const sign = generateSignature(username, apiKey, ref_id);

    const response = await axios.post(`${BASE_URL}/transaction`, {
      username,
      buyer_sku_code,
      customer_no,
      ref_id,
      sign,
    }, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    const result = response.data.data;

    return {
      success: true,
      data: {
        ref_id: result.ref_id,
        trx_id: result.trx_id || null,
        status: result.status,
        rc: result.rc,
        message: result.message,
        sn: result.sn || null,
        price: result.price,
        buyer_last_saldo: result.buyer_last_saldo,
      },
    };
  } catch (error) {
    const statusCode = error.response?.status;
    const responseMessage = error.response?.data?.data?.message || error.response?.data?.message;
    const errorMessage = responseMessage || error.message;

    if (statusCode && statusCode !== 400) {
      console.error("Error checking transaction status:", errorMessage);
    }

    return {
      success: false,
      error: errorMessage,
      statusCode,
    };
  }
}

/**
 * Calculate harga jual berdasarkan markup
 * @param {number} basePrice - Harga dari Digiflazz
 * @returns {Object} Object dengan markup dan sellPrice
 */
export function calculateSellPrice(basePrice) {
  const { markupType, markupValue } = global.digiflazz;
  
  let markup = 0;
  let sellPrice = basePrice;

  if (markupType === "fixed") {
    markup = markupValue;
    sellPrice = basePrice + markup;
  } else if (markupType === "percentage") {
    markup = Math.round((basePrice * markupValue) / 100);
    sellPrice = basePrice + markup;
  }

  return {
    markup,
    sellPrice: Math.round(sellPrice),
  };
}

/**
 * Validasi format nomor berdasarkan tipe produk
 * @param {string} customerNo - Nomor yang akan divalidasi
 * @param {string} category - Kategori produk
 * @returns {Object} Result validasi
 */
export function validateCustomerNumber(customerNo, category) {
  const raw = String(customerNo || "").trim();
  const normalizedCategory = String(category || "").trim().toLowerCase();

  if (!raw) {
    return { valid: false, error: "Nomor/ID tujuan tidak boleh kosong" };
  }

  // Hapus spasi dan karakter non-digit
  const cleaned = raw.replace(/\D/g, "");

  // Validasi berdasarkan kategori
  switch (normalizedCategory) {
    case "pulsa":
    case "data":
    case "paket data":
    case "e-money":
    case "e-wallet":
      // Nomor HP Indonesia (08xx atau 628xx)
      if (/^(08|628)\d{8,11}$/.test(cleaned)) {
        return { valid: true, formatted: cleaned };
      }
      return { valid: false, error: "Format nomor HP tidak valid. Contoh: 08123456789" };

    case "pln":
    case "token listrik":
      // Nomor meter PLN (11-12 digit)
      if (/^\d{11,12}$/.test(cleaned)) {
        return { valid: true, formatted: cleaned };
      }
      return { valid: false, error: "Format nomor meter PLN tidak valid (11-12 digit)" };

    case "voucher game":
      // ID game bisa berupa angka atau kombinasi
      if (raw.length >= 3) {
        return { valid: true, formatted: raw };
      }
      return { valid: false, error: "ID game tidak valid (minimal 3 karakter)" };

    default:
      // Default: minimal 3 karakter
      if (raw.length >= 3) {
        return { valid: true, formatted: raw };
      }
      return { valid: false, error: "Format nomor tidak valid" };
  }
}

/**
 * Format kategori produk untuk display
 * @param {string} category - Kategori dari Digiflazz
 * @returns {string} Kategori yang sudah diformat
 */
export function formatCategory(category) {
  return category;
}

export default {
  checkBalance,
  getPriceList,
  createTransaction,
  checkTransactionStatus,
  calculateSellPrice,
  validateCustomerNumber,
  formatCategory,
};
