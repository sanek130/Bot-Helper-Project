import dotenv from 'dotenv';
dotenv.config();

// Проверка обязательных переменных окружения
const requiredEnvVars = [
  'BOT_TOKEN',
  'BOT_USERNAME',
  'MONGO_URI',
  'MODERATOR_IDS',
  'SITE_URL',
  'JWT_SECRET',
  // Секрет вебхука обязателен: без него путь /tg/... открыт для поддельных апдейтов
  'WEBHOOK_SECRET'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Отсутствуют обязательные переменные окружения:');
  missingVars.forEach(varName => console.error(`  - ${varName}`));
  console.error('\nПроверьте файл .env или переменные окружения.');
  process.exit(1);
}

// Конфигурация
const config = {
  bot: {
    token: process.env.BOT_TOKEN,
    username: process.env.BOT_USERNAME
  },
  mongo: {
    uri: process.env.MONGO_URI
  },
  moderators: {
    ids: process.env.MODERATOR_IDS.split(',').map(id => Number(id.trim()))
  },
  site: {
    url: process.env.SITE_URL,
    webhookUrl: process.env.WEBHOOK_URL || process.env.SITE_URL,
    webhookSecret: process.env.WEBHOOK_SECRET
  },
  jwt: {
    secret: process.env.JWT_SECRET
  },
  cleanup: {
    days: parseInt(process.env.CLEANUP_DAYS || '14', 10)
  },
  timezone: process.env.TZ || 'Europe/Moscow',
  port: parseInt(process.env.PORT || '3000', 10)
};

export default config;
