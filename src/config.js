import 'dotenv/config';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

// Области валидации:
//   full — основной процесс (бот + сайт), проверяются все обязательные переменные;
//   db   — CLI-скрипты (cleanup, migrate): нужен только MONGO_URI, чтобы Render Cron
//          работал без BOT_TOKEN и JWT_SECRET;
//   test — запуск через `node --test`: подставляются безопасные тестовые значения.
function detectScope() {
  if (process.env.HW_CONFIG_SCOPE === 'db') return 'db';
  if (process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === 'test') return 'test';
  return 'full';
}

const scope = detectScope();

const TEST_DEFAULTS = {
  BOT_TOKEN: '123456:TEST_TOKEN_TEST_TOKEN_TEST_TOKEN_00',
  BOT_USERNAME: 'HomeWorkly_bot',
  MONGO_URI: 'mongodb://127.0.0.1:27017/hwhelper_test',
  SITE_URL: 'http://localhost:3000',
  JWT_SECRET: 'test_jwt_secret_test_jwt_secret_test_jwt_secret',
  WEBHOOK_SECRET: 'test_webhook_secret',
};

function readEnv(name) {
  const raw = process.env[name];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value && scope === 'test' && TEST_DEFAULTS[name]) return TEST_DEFAULTS[name];
  return value;
}

function parseIds(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^\d+$/.test(part))
    .map((part) => Number(part));
}

const RULES = [
  {
    name: 'BOT_TOKEN',
    scopes: ['full'],
    regex: /^\d{6,}:[\w-]{25,}$/,
    message: 'BOT_TOKEN отсутствует или имеет неверный формат. Получи токен у @BotFather (вид: 123456789:AA...).',
  },
  {
    name: 'BOT_USERNAME',
    scopes: ['full'],
    regex: /^[A-Za-z][\w]{3,31}$/,
    message: 'BOT_USERNAME отсутствует или неверный. Укажи ник бота без @, например HomeWorkly_bot.',
  },
  {
    name: 'MONGO_URI',
    scopes: ['full', 'db'],
    regex: /^mongodb(\+srv)?:\/\/.+/,
    message: 'MONGO_URI отсутствует или неверный. Строка должна начинаться с mongodb:// или mongodb+srv://.',
  },
  {
    name: 'SITE_URL',
    scopes: ['full'],
    regex: /^https?:\/\/[^\s/]+(\/[^\s]*[^\s/])?$/,
    message: 'SITE_URL отсутствует или неверный. Укажи адрес сайта без завершающего /, например https://example.onrender.com.',
  },
  {
    name: 'JWT_SECRET',
    scopes: ['full'],
    validate: (value) => value.length >= 32,
    message: 'JWT_SECRET отсутствует или короче 32 символов. Сгенерируй: openssl rand -hex 32.',
  },
];

const OPTIONAL_RULES = [
  {
    name: 'WEBHOOK_SECRET',
    scopes: ['full'],
    regex: /^[\w-]{8,128}$/,
    message: 'WEBHOOK_SECRET имеет неверный формат. Допустимы латиница, цифры, _ и -, длина 8–128.',
  },
  {
    name: 'WEBHOOK_URL',
    scopes: ['full'],
    regex: /^https:\/\/[^\s/]+(\/[^\s]*[^\s/])?$/,
    message: 'WEBHOOK_URL должен начинаться с https:// и не заканчиваться на /.',
  },
  {
    name: 'DONATE_URL',
    scopes: ['full'],
    regex: /^https:\/\/[^\s<>"']+$/,
    message: 'DONATE_URL должен начинаться с https://.',
  },
];

function checkRule(rule, value) {
  if (rule.regex && !rule.regex.test(value)) return false;
  if (rule.validate && !rule.validate(value)) return false;
  return true;
}

function validate() {
  const errors = [];
  for (const rule of RULES) {
    if (!rule.scopes.includes(scope) && scope !== 'test') continue;
    const value = readEnv(rule.name);
    if (scope === 'test' && !value) continue;
    if (!value || !checkRule(rule, value)) errors.push(rule.message);
  }
  for (const rule of OPTIONAL_RULES) {
    if (!rule.scopes.includes(scope)) continue;
    const value = readEnv(rule.name);
    if (value && !checkRule(rule, value)) errors.push(rule.message);
  }
  const webhookUrl = readEnv('WEBHOOK_URL');
  if (scope === 'full' && webhookUrl && !readEnv('WEBHOOK_SECRET')) {
    errors.push('WEBHOOK_URL задан, но WEBHOOK_SECRET пуст. Задай WEBHOOK_SECRET (8–128 символов).');
  }
  return errors;
}

const errors = validate();
if (errors.length > 0) {
  const error = new ConfigError(`Ошибка конфигурации:\n- ${errors.join('\n- ')}`);
  // Значения переменных не выводятся — только описание проблемы.
  console.error(error.message);
  process.exit(1);
}

const cleanupDaysParsed = parseInt(process.env.CLEANUP_DAYS, 10);

export const config = Object.freeze({
  scope,
  env: process.env.NODE_ENV || 'production',
  port: Number(process.env.PORT) || 3000,
  bot: Object.freeze({
    token: readEnv('BOT_TOKEN'),
    username: readEnv('BOT_USERNAME').replace(/^@/, ''),
  }),
  mongoUri: readEnv('MONGO_URI'),
  moderatorIds: parseIds(readEnv('MODERATOR_IDS')),
  creatorIds: parseIds(readEnv('CREATOR_IDS')),
  siteUrl: readEnv('SITE_URL').replace(/\/+$/, ''),
  jwtSecret: readEnv('JWT_SECRET'),
  webhook: Object.freeze({
    url: readEnv('WEBHOOK_URL').replace(/\/+$/, ''),
    secret: readEnv('WEBHOOK_SECRET'),
  }),
  cleanupDays: Number.isFinite(cleanupDaysParsed) && cleanupDaysParsed >= 0 ? cleanupDaysParsed : 14,
  tz: process.env.TZ || 'Europe/Moscow',
});

// Совместимость с формулировкой спецификации: PORT, CLEANUP_DAYS, TZ.
export const PORT = config.port;
export const CLEANUP_DAYS = config.cleanupDays;
export const TZ = config.tz;

export default config;
