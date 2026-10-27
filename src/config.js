import dotenv from 'dotenv';

dotenv.config();

export class ConfigError extends Error {}

const DEFAULTS = {
  CLEANUP_DAYS: '14',
  TZ: 'Europe/Moscow',
  PORT: '3000',
};

function read(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function required(name) {
  const value = read(name);
  if (!value) {
    throw new ConfigError(`Не задана обязательная переменная окружения ${name}. Проверь .env или настройки Render.`);
  }
  return value;
}

function positiveInt(name, fallback) {
  const raw = read(name) || fallback;
  const number = Number(raw);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ConfigError(`Переменная ${name} должна быть положительным целым числом, получено «${raw}».`);
  }
  return number;
}

function parseModerators(raw) {
  const ids = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part));

  if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new ConfigError('MODERATOR_IDS должен содержать tgId создателей через запятую, например 111111111,222222222.');
  }
  return [...new Set(ids)];
}

function buildConfig() {
  const botToken = required('BOT_TOKEN');
  if (!/^\d{6,}:[\w-]{25,}$/.test(botToken)) {
    throw new ConfigError('BOT_TOKEN не похож на токен от BotFather. Скопируй его целиком.');
  }

  const webhookSecret = read('WEBHOOK_SECRET');
  const webhookUrl = read('WEBHOOK_URL');

  if (webhookUrl && !webhookSecret) {
    throw new ConfigError('WEBHOOK_SECRET обязателен, если задан WEBHOOK_URL: иначе вебхук открыт для поддельных запросов.');
  }
  if (webhookSecret && !/^[\w-]{8,128}$/.test(webhookSecret)) {
    throw new ConfigError('WEBHOOK_SECRET должен состоять из букв, цифр, «-» и «_» и быть длиной от 8 до 128 символов.');
  }

  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw new ConfigError('JWT_SECRET слишком короткий: нужно не меньше 32 символов.');
  }

  const siteUrl = required('SITE_URL').replace(/\/+$/, '');

  return {
    bot: {
      token: botToken,
      username: required('BOT_USERNAME').replace(/^@/, ''),
    },
    mongo: {
      uri: required('MONGO_URI'),
    },
    moderators: { ids: parseModerators(required('MODERATOR_IDS')) },
    site: {
      url: siteUrl,
      webhookUrl: webhookUrl.replace(/\/+$/, ''),
      webhookSecret,
    },
    jwt: {
      secret: jwtSecret,
    },
    cleanup: {
      days: positiveInt('CLEANUP_DAYS', DEFAULTS.CLEANUP_DAYS),
    },
    timezone: read('TZ') || DEFAULTS.TZ,
    port: positiveInt('PORT', DEFAULTS.PORT),
  };
}

// Конфиг проверяется при старте: без обязательных переменных приложение
// падает с понятным сообщением, а не с загадочной ошибкой где-то в середине.
const config = Object.freeze(buildConfig());

export default config;
