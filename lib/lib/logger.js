import chalk from './chalk.js';

const DIGIFLAZZ_DEBUG = process.env.DIGIFLAZZ_DEBUG === 'true';

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
    case 'debug':
      return `${chalk.gray('[')}${chalk.cyan('D')}${chalk.gray(']')}`;
    default:
      return '[ ]';
  }
}

function maskSensitive(data) {
  if (typeof data !== 'string') return data;
  data = data.replace(/(api[_-]?key["\s:=]+)([a-zA-Z0-9-]{8})[a-zA-Z0-9-]+/gi, '$1$2***');
  data = data.replace(/(sign["\s:=]+)([a-zA-Z0-9]{8})[a-zA-Z0-9]+/gi, '$1$2***');
  return data;
}

export const logger = {
  info: (msg) => console.log(formatPrefix('info'), chalk.whiteBright(msg)),
  success: (msg) => console.log(formatPrefix('success'), chalk.whiteBright(msg)),
  warn: (msg) => console.log(formatPrefix('warn'), chalk.whiteBright(msg)),
  error: (msg, context) => {
    console.error(formatPrefix('error'), chalk.whiteBright(msg));
    if (context && DIGIFLAZZ_DEBUG) {
      console.error(chalk.gray(maskSensitive(JSON.stringify(context, null, 2))));
    }
  },
  debug: (msg, context) => {
    if (DIGIFLAZZ_DEBUG) {
      console.debug(formatPrefix('debug'), chalk.gray(msg));
      if (context) {
        console.debug(chalk.gray(maskSensitive(JSON.stringify(context, null, 2))));
      }
    }
  },
  
  digiflazz: {
    request: (endpoint, payload) => {
      if (DIGIFLAZZ_DEBUG) {
        console.log(formatPrefix('debug'), chalk.cyan(`[Digiflazz] → ${endpoint}`));
        console.log(chalk.gray(maskSensitive(JSON.stringify(payload, null, 2))));
      }
    },
    response: (endpoint, status, data) => {
      if (DIGIFLAZZ_DEBUG) {
        console.log(formatPrefix('debug'), chalk.cyan(`[Digiflazz] ← ${endpoint} (${status})`));
        const preview = typeof data === 'object' ? JSON.stringify(data).substring(0, 500) : String(data).substring(0, 500);
        console.log(chalk.gray(preview));
      }
    },
    error: (endpoint, error) => {
      console.error(formatPrefix('error'), chalk.red(`[Digiflazz] ${endpoint}: ${error.message}`));
      if (DIGIFLAZZ_DEBUG && error.response) {
        console.error(chalk.gray(JSON.stringify({
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        }, null, 2)));
      }
    }
  }
};
