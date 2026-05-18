/**
 * Telegram Button Styles Generator
 * Helper untuk generate inline keyboard dengan style yang konsisten
 */

class TelegramButtonStyles {
  constructor() {
    // Emoji icons untuk berbagai jenis button
    this.icons = {
      primary: '🔵',
      success: '✅',
      danger: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      cart: '🛒',
      money: '💰',
      back: '↩️',
      next: '⏩',
      refresh: '🔄',
      check: '✓',
      cross: '✗',
      star: '⭐',
      fire: '🔥',
      gift: '🎁',
      lock: '🔒',
      unlock: '🔓'
    };

    // Color indicators (untuk text)
    this.colors = {
      primary: '🔵',
      success: '🟢',
      danger: '🔴',
      warning: '🟡',
      info: '⚪'
    };
  }

  /**
   * Create button dengan style primary (biru)
   * Menggunakan field "style" dari Bot API 9.4+
   * @param {string} text - Text button
   * @param {string} callbackData - Callback data
   * @param {boolean} withIcon - Tambahkan icon emoji
   */
  primary(text, callbackData, withIcon = false) {
    const displayText = withIcon ? `${this.icons.primary} ${text}` : text;
    return { text: displayText, callback_data: callbackData, style: "primary" };
  }

  /**
   * Create button dengan style success (hijau)
   * Menggunakan field "style" dari Bot API 9.4+
   * @param {string} text - Text button
   * @param {string} callbackData - Callback data
   * @param {boolean} withIcon - Tambahkan icon emoji
   */
  success(text, callbackData, withIcon = false) {
    const displayText = withIcon ? `${this.icons.success} ${text}` : text;
    return { text: displayText, callback_data: callbackData, style: "success" };
  }

  /**
   * Create button dengan style danger (merah)
   * Menggunakan field "style" dari Bot API 9.4+
   * @param {string} text - Text button
   * @param {string} callbackData - Callback data
   * @param {boolean} withIcon - Tambahkan icon emoji
   */
  danger(text, callbackData, withIcon = false) {
    const displayText = withIcon ? `${this.icons.danger} ${text}` : text;
    return { text: displayText, callback_data: callbackData, style: "danger" };
  }

  /**
   * Create URL button dengan style warna (Bot API 9.4+)
   * @param {string} style - Style: "primary" (biru), "success" (hijau), "danger" (merah)
   * @param {string} text - Text button
   * @param {string} url - URL tujuan
   */
  urlButton(style, text, url) {
    return { text, url, style };
  }

  /**
   * Create button untuk aksi order/cart (style success - hijau)
   */
  orderButton(text, callbackData) {
    return { text: `${this.icons.cart} ${text}`, callback_data: callbackData, style: "success" };
  }

  /**
   * Create button untuk payment/saldo (style primary - biru)
   */
  paymentButton(text, callbackData) {
    return { text: `${this.icons.money} ${text}`, callback_data: callbackData, style: "primary" };
  }

  /**
   * Create button back/kembali (style danger - merah)
   */
  backButton(text = "Kembali", callbackData = "main_menu") {
    return { text: `${this.icons.back} ${text}`, callback_data: callbackData, style: "danger" };
  }

  /**
   * Create button refresh (style primary - biru)
   */
  refreshButton(text = "Refresh", callbackData = "refresh") {
    return { text: `${this.icons.refresh} ${text}`, callback_data: callbackData, style: "primary" };
  }

  /**
   * Create inline keyboard dengan layout yang konsisten
   * @param {Array} buttons - Array of button objects
   * @param {Object} options - Layout options
   */
  createKeyboard(buttons, options = {}) {
    const {
      columns = 2,
      addBackButton = false,
      backButtonText = "Kembali",
      backButtonCallback = "main_menu"
    } = options;

    const keyboard = [];

    // Group buttons by columns
    for (let i = 0; i < buttons.length; i += columns) {
      keyboard.push(buttons.slice(i, i + columns));
    }

    // Add back button if requested
    if (addBackButton) {
      keyboard.push([this.backButton(backButtonText, backButtonCallback)]);
    }

    return keyboard;
  }

  /**
   * Create payment keyboard (Qris + Balance)
   */
  createPaymentKeyboard(qrisCallback, balanceCallback, cancelCallback = null) {
    const keyboard = [
      [
        { text: "Qris 1⃣", callback_data: qrisCallback, style: "primary" },
        { text: "Balance 2⃣", callback_data: balanceCallback, style: "success" }
      ]
    ];

    if (cancelCallback) {
      keyboard.push([
        this.danger("Batalkan", cancelCallback)
      ]);
    }

    return keyboard;
  }

  /**
   * Create quantity selector keyboard
   */
  createQuantityKeyboard(productId, currentQty, options = {}) {
    const {
      voucherCode = "",
      voucherAmount = 0,
      showTakeAll = true,
      showVoucher = true,
      showBack = true
    } = options;

    const voucherParam = `${voucherCode} ${voucherAmount}`;

    const keyboard = [
      // Quantity controls
      [
        { text: "-10", callback_data: `addcart ${productId} ${currentQty - 10} ${voucherParam}` },
        { text: "-5", callback_data: `addcart ${productId} ${currentQty - 5} ${voucherParam}` },
        { text: "-1", callback_data: `addcart ${productId} ${currentQty - 1} ${voucherParam}` }
      ],
      [
        { text: `📦 ${currentQty}`, callback_data: "noop" },
        { text: "Ketik Jumlah", callback_data: `inputcart ${productId}` }
      ],
      [
        { text: "+1", callback_data: `addcart ${productId} ${currentQty + 1} ${voucherParam}` },
        { text: "+5", callback_data: `addcart ${productId} ${currentQty + 5} ${voucherParam}` },
        { text: "+10", callback_data: `addcart ${productId} ${currentQty + 10} ${voucherParam}` }
      ]
    ];

    // Optional buttons
    const optionalRow = [];
    if (showTakeAll) {
      optionalRow.push({ text: "Take All 📦", callback_data: `addcart ${productId} max ${voucherParam}` });
    }
    if (showVoucher) {
      if (voucherCode) {
        optionalRow.push(this.danger("Batalkan Voucher", `addcart ${productId} ${currentQty}`));
      } else {
        optionalRow.push({ text: "Use Voucher 🎫", callback_data: `inputvcr ${productId} ${currentQty}` });
      }
    }
    if (optionalRow.length > 0) {
      keyboard.push(optionalRow);
    }

    // Back button
    if (showBack) {
      keyboard.push([this.backButton("Kembali", `selectproduct ${productId}`)]);
    }

    return keyboard;
  }

  /**
   * Create confirmation keyboard (Yes/No)
   */
  createConfirmKeyboard(confirmCallback, cancelCallback, options = {}) {
    const {
      confirmText = "Ya, Lanjutkan",
      cancelText = "Tidak, Batalkan"
    } = options;

    return [
      [
        this.success(confirmText, confirmCallback),
        this.danger(cancelText, cancelCallback)
      ]
    ];
  }

  /**
   * Create menu keyboard dengan grid layout (style primary)
   */
  createMenuKeyboard(menuItems, columns = 2) {
    const keyboard = [];

    for (let i = 0; i < menuItems.length; i += columns) {
      const row = menuItems.slice(i, i + columns).map(item => ({
        text: item.icon ? `${item.icon} ${item.text}` : item.text,
        callback_data: item.callback,
        style: item.style || "primary"
      }));
      keyboard.push(row);
    }

    return keyboard;
  }

  /**
   * Create admin menu keyboard (style primary)
   */
  createAdminKeyboard() {
    return [
      [
        { text: "👥 Kelola User", callback_data: "admin_users", style: "primary" },
        { text: "📦 Kelola Produk", callback_data: "admin_products", style: "primary" }
      ],
      [
        { text: "💰 Kelola Saldo", callback_data: "admin_balance", style: "primary" },
        { text: "📊 Statistik", callback_data: "admin_stats", style: "primary" }
      ],
      [
        { text: "🔧 Pengaturan", callback_data: "admin_settings", style: "primary" },
        { text: "📢 Broadcast", callback_data: "admin_broadcast", style: "primary" }
      ],
      [
        this.backButton("Kembali ke Menu", "main_menu")
      ]
    ];
  }

  /**
   * Create pagination keyboard
   */
  createPaginationKeyboard(currentPage, totalPages, baseCallback, options = {}) {
    const {
      showPageInfo = true,
      addBackButton = true,
      backCallback = "main_menu"
    } = options;

    const keyboard = [];
    const navRow = [];

    // Previous button
    if (currentPage > 1) {
      navRow.push({ text: "⬅️ Prev", callback_data: `${baseCallback} ${currentPage - 1}`, style: "primary" });
    }

    // Page info
    if (showPageInfo) {
      navRow.push({ text: `📄 ${currentPage}/${totalPages}`, callback_data: "noop" });
    }

    // Next button
    if (currentPage < totalPages) {
      navRow.push({ text: "Next ➡️", callback_data: `${baseCallback} ${currentPage + 1}`, style: "primary" });
    }

    if (navRow.length > 0) {
      keyboard.push(navRow);
    }

    // Back button
    if (addBackButton) {
      keyboard.push([this.backButton("Kembali", backCallback)]);
    }

    return keyboard;
  }

  /**
   * Create status indicator text
   */
  statusText(status, text) {
    const statusMap = {
      success: `${this.colors.success} ${text}`,
      error: `${this.colors.danger} ${text}`,
      warning: `${this.colors.warning} ${text}`,
      info: `${this.colors.info} ${text}`,
      primary: `${this.colors.primary} ${text}`
    };

    return statusMap[status] || text;
  }

  /**
   * Format currency untuk Indonesia
   */
  formatCurrency(amount) {
    return `Rp ${parseInt(amount).toLocaleString('id-ID')}`;
  }

  /**
   * Create product card text dengan formatting
   */
  createProductCard(product) {
    const {
      name,
      price,
      stock,
      description,
      category,
      isAvailable = true
    } = product;

    const statusIcon = isAvailable ? this.colors.success : this.colors.danger;
    const statusText = isAvailable ? "Tersedia" : "Stok Habis";

    return `
${statusIcon} *${name}*

💰 Harga: *${this.formatCurrency(price)}*
📦 Stok: *${stock}*
📂 Kategori: ${category}

${description || 'Tidak ada deskripsi'}

Status: ${statusText}
    `.trim();
  }

  /**
   * Create order summary text
   */
  createOrderSummary(order) {
    const {
      orderId,
      productName,
      quantity,
      price,
      total,
      voucher = null,
      discount = 0
    } = order;

    let summary = `
🧾 *RINGKASAN PESANAN*

Order ID: \`${orderId}\`
Produk: *${productName}*
Jumlah: ${quantity}x
Harga: ${this.formatCurrency(price)}
    `.trim();

    if (voucher && discount > 0) {
      summary += `\n\n🎫 Voucher: ${voucher}`;
      summary += `\n💸 Diskon: -${this.formatCurrency(discount)}`;
    }

    summary += `\n\n💰 *Total: ${this.formatCurrency(total)}*`;

    return summary;
  }
}

// Export class sebagai default
export default TelegramButtonStyles;

// Contoh penggunaan:
/*

// 1. Simple buttons
const btn1 = telegramButtonStyles.primary("Beli Sekarang", "buy_now");
const btn2 = telegramButtonStyles.success("Konfirmasi", "confirm");
const btn3 = telegramButtonStyles.danger("Batalkan", "cancel");

// 2. Create keyboard
const keyboard = telegramButtonStyles.createKeyboard([
  telegramButtonStyles.orderButton("List Produk", "listproduk"),
  telegramButtonStyles.paymentButton("Cek Saldo", "ceksaldo"),
  telegramButtonStyles.primary("Riwayat", "riwayat"),
  telegramButtonStyles.primary("Bantuan", "help")
], { columns: 2, addBackButton: true });

// 3. Payment keyboard
const paymentKeyboard = telegramButtonStyles.createPaymentKeyboard(
  "pay_qris",
  "pay_balance",
  "cancel_payment"
);

// 4. Quantity selector
const qtyKeyboard = telegramButtonStyles.createQuantityKeyboard(
  "PROD123",
  5,
  { showTakeAll: true, showVoucher: true }
);

// 5. Product card
const productText = telegramButtonStyles.createProductCard({
  name: "Diamond Mobile Legends",
  price: 50000,
  stock: 100,
  description: "Top up diamond ML instant",
  category: "Game",
  isAvailable: true
});

// 6. Send message dengan keyboard
bot.sendMessage(chatId, productText, {
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: keyboard
  }
});

*/
