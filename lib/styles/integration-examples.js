/**
 * Integration Example: Telegram Button Styles dengan Handler.js
 * Contoh cara mengintegrasikan button styles ke dalam project callback bot
 */

import TelegramButtonStyles from './telegram-button-styles.js';

const btnStyles = new TelegramButtonStyles();

// ============================================
// CONTOH 1: Update Main Menu dengan Style Baru
// ============================================

export function createStyledMainMenu() {
  return btnStyles.createMenuKeyboard([
    { text: "List Produk", icon: "🛒", callback: "listproduk" },
    { text: "Saldo", icon: "💰", callback: "ceksaldo" },
    { text: "Riwayat Transaksi", icon: "📂", callback: "riwayattransaksi" },
    { text: "Produk Populer", icon: "✨", callback: "produkpopuler" },
    { text: "Menu Lain", icon: "⏩", callback: "menulain" }
  ], 2);
}

// ============================================
// CONTOH 2: Order Flow dengan Button Styles
// ============================================

export async function handleOrderWithStyles(bot, chatId, productData) {
  const { productId, name, price, stock } = productData;

  // Product card dengan formatting
  const productCard = btnStyles.createProductCard({
    name: name,
    price: price,
    stock: stock,
    description: "Produk digital instant delivery",
    category: "Digital",
    isAvailable: stock > 0
  });

  // Quantity keyboard dengan style
  const keyboard = btnStyles.createQuantityKeyboard(
    productId,
    1,
    {
      showTakeAll: stock > 10,
      showVoucher: true,
      showBack: true
    }
  );

  await bot.sendMessage(chatId, productCard, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

// ============================================
// CONTOH 3: Payment Flow dengan Button Styles
// ============================================

export async function handlePaymentWithStyles(bot, chatId, orderData) {
  const { orderId, productName, quantity, price, total, voucher, discount } = orderData;

  // Order summary dengan formatting
  const summary = btnStyles.createOrderSummary({
    orderId: orderId,
    productName: productName,
    quantity: quantity,
    price: price,
    total: total,
    voucher: voucher,
    discount: discount
  });

  // Payment keyboard
  const keyboard = btnStyles.createPaymentKeyboard(
    `order_payqris ${orderId}`,
    `order_paysaldo ${orderId}`,
    `order_cancel ${orderId}`
  );

  await bot.sendMessage(chatId, summary, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

// ============================================
// CONTOH 4: Confirmation Dialog dengan Styles
// ============================================

export async function handleDeleteConfirmation(bot, chatId, itemId, itemName) {
  const message = `
${btnStyles.colors.warning} *KONFIRMASI HAPUS*

Apakah Anda yakin ingin menghapus:
*${itemName}*

⚠️ Aksi ini tidak dapat dibatalkan!
  `.trim();

  const keyboard = btnStyles.createConfirmKeyboard(
    `confirm_delete ${itemId}`,
    `cancel_delete ${itemId}`,
    {
      confirmText: "Ya, Hapus",
      cancelText: "Batal"
    }
  );

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

// ============================================
// CONTOH 5: Admin Menu dengan Styles
// ============================================

export async function handleAdminMenuWithStyles(bot, chatId) {
  const message = `
👑 *MENU ADMIN*

Pilih menu yang ingin Anda kelola:
  `.trim();

  const keyboard = btnStyles.createAdminKeyboard();

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

// ============================================
// CONTOH 6: Product List dengan Pagination
// ============================================

export async function handleProductListWithStyles(bot, chatId, products, currentPage, totalPages) {
  let message = `
🛒 *DAFTAR PRODUK*
Halaman ${currentPage} dari ${totalPages}

`;

  // List products
  products.forEach((product, index) => {
    const status = product.stock > 0 ? btnStyles.colors.success : btnStyles.colors.danger;
    message += `
${status} *${product.name}*
💰 ${btnStyles.formatCurrency(product.price)} | 📦 Stok: ${product.stock}
/order_${product.productId}

`;
  });

  // Create product buttons
  const productButtons = products.map(product =>
    btnStyles.primary(product.name, `selectproduct ${product.productId}`)
  );

  const keyboard = btnStyles.createKeyboard(productButtons, {
    columns: 2,
    addBackButton: false
  });

  // Add pagination
  const paginationRow = btnStyles.createPaginationKeyboard(
    currentPage,
    totalPages,
    "listproduk",
    { addBackButton: true, backCallback: "main_menu" }
  );

  keyboard.push(...paginationRow);

  await bot.sendMessage(chatId, message.trim(), {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

// ============================================
// CONTOH 7: Transaction Status dengan Styles
// ============================================

export async function handleTransactionStatus(bot, chatId, transaction) {
  const { orderId, status, productName, quantity, total, createdAt } = transaction;

  let statusIcon, statusText;

  switch(status) {
    case 'success':
      statusIcon = btnStyles.colors.success;
      statusText = 'BERHASIL';
      break;
    case 'pending':
      statusIcon = btnStyles.colors.warning;
      statusText = 'MENUNGGU';
      break;
    case 'failed':
      statusIcon = btnStyles.colors.danger;
      statusText = 'GAGAL';
      break;
    default:
      statusIcon = btnStyles.colors.info;
      statusText = 'UNKNOWN';
  }

  const message = `
${statusIcon} *STATUS TRANSAKSI*

Order ID: \`${orderId}\`
Status: *${statusText}*

📦 Produk: ${productName}
🔢 Jumlah: ${quantity}x
💰 Total: ${btnStyles.formatCurrency(total)}
📅 Tanggal: ${new Date(createdAt).toLocaleString('id-ID')}
  `.trim();

  const keyboard = [
    [
      btnStyles.primary("Cek Lagi", `cektransaksi ${orderId}`),
      btnStyles.backButton("Kembali", "riwayattransaksi")
    ]
  ];

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

// ============================================
// CONTOH 8: Deposit Flow dengan Styles
// ============================================

export async function handleDepositWithStyles(bot, chatId, userId) {
  const message = `
💰 *TOP UP SALDO*

Pilih nominal yang ingin Anda top up:
  `.trim();

  const keyboard = [
    [
      btnStyles.success("Rp 10.000", "deposit 10000"),
      btnStyles.success("Rp 25.000", "deposit 25000")
    ],
    [
      btnStyles.success("Rp 50.000", "deposit 50000"),
      btnStyles.success("Rp 100.000", "deposit 100000")
    ],
    [
      btnStyles.primary("Ketik Nominal Lain", "customdeposit")
    ],
    [
      btnStyles.backButton("Kembali", "main_menu")
    ]
  ];

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

// ============================================
// CONTOH 9: Success Notification dengan Styles
// ============================================

export async function sendSuccessNotification(bot, chatId, title, details) {
  const message = `
${btnStyles.colors.success} *${title}*

${details}

✅ Transaksi berhasil diproses!
  `.trim();

  const keyboard = [
    [
      btnStyles.primary("Lihat Riwayat", "riwayattransaksi"),
      btnStyles.backButton("Menu Utama", "main_menu")
    ]
  ];

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

// ============================================
// CONTOH 10: Error Notification dengan Styles
// ============================================

export async function sendErrorNotification(bot, chatId, errorTitle, errorMessage) {
  const message = `
${btnStyles.colors.danger} *${errorTitle}*

${errorMessage}

❌ Silakan coba lagi atau hubungi admin jika masalah berlanjut.
  `.trim();

  const keyboard = [
    [
      btnStyles.primary("Coba Lagi", "retry"),
      btnStyles.danger("Hubungi Admin", "contact_admin")
    ],
    [
      btnStyles.backButton("Menu Utama", "main_menu")
    ]
  ];

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

// ============================================
// CONTOH 11: Broadcast Message dengan Styles
// ============================================

export async function handleBroadcastWithStyles(bot, chatId, isAdmin) {
  if (!isAdmin) {
    return sendErrorNotification(bot, chatId, "AKSES DITOLAK", "Anda tidak memiliki akses ke fitur ini.");
  }

  const message = `
📢 *BROADCAST MESSAGE*

Kirim pesan yang akan dikirim ke semua user:

Format:
\`\`\`
Judul: [Judul Broadcast]
Pesan: [Isi Pesan]
\`\`\`
  `.trim();

  const keyboard = [
    [
      btnStyles.danger("Batalkan", "admin_menu")
    ]
  ];

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

// ============================================
// CONTOH 12: User Profile dengan Styles
// ============================================

export async function handleUserProfileWithStyles(bot, chatId, userData) {
  const { userId, name, balance, totalOrders, joinDate, role } = userData;

  const roleIcon = role === 'admin' ? '👑' : role === 'vip' ? '⭐' : '👤';

  const message = `
${roleIcon} *PROFIL USER*

Nama: *${name}*
User ID: \`${userId}\`
Role: ${role.toUpperCase()}

💰 Saldo: *${btnStyles.formatCurrency(balance)}*
📦 Total Pesanan: ${totalOrders}
📅 Bergabung: ${new Date(joinDate).toLocaleDateString('id-ID')}
  `.trim();

  const keyboard = [
    [
      btnStyles.paymentButton("Top Up Saldo", "deposit"),
      btnStyles.primary("Riwayat", "riwayattransaksi")
    ],
    [
      btnStyles.backButton("Menu Utama", "main_menu")
    ]
  ];

  await bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

// Export semua functions
export default {
  createStyledMainMenu,
  handleOrderWithStyles,
  handlePaymentWithStyles,
  handleDeleteConfirmation,
  handleAdminMenuWithStyles,
  handleProductListWithStyles,
  handleTransactionStatus,
  handleDepositWithStyles,
  sendSuccessNotification,
  sendErrorNotification,
  handleBroadcastWithStyles,
  handleUserProfileWithStyles
};
