/**
 * Button Styles Package
 * Main entry point untuk semua button styles utilities
 */

// Import all modules
import TelegramButtonStyles from './telegram-button-styles.js';
import ButtonHelper from './button-helper.js';
import integrationExamples from './integration-examples.js';

// Create instances
const telegramStyles = new TelegramButtonStyles();
const buttonHelper = new ButtonHelper();

// Export everything
export {
  TelegramButtonStyles,
  ButtonHelper,
  telegramStyles,
  buttonHelper,
  integrationExamples
};

// Default export
export default {
  telegram: telegramStyles,
  helper: buttonHelper,
  examples: integrationExamples
};

/**
 * Quick Start Guide
 *
 * 1. Import the package:
 *    import buttonStyles from './styles/index.js';
 *
 * 2. Use Telegram button styles:
 *    const keyboard = buttonStyles.telegram.createMenuKeyboard([...]);
 *
 * 3. Use button helper for web:
 *    buttonStyles.helper.setLoading(button, "Loading...");
 *
 * 4. Use integration examples:
 *    await buttonStyles.examples.handleOrderWithStyles(bot, chatId, productData);
 */
