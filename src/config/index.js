import dotenv from 'dotenv';
dotenv.config();

// Конфигурация бота
export const config = {
  bot: {
    token: process.env.BOT_TOKEN || '',
    webhookPath: process.env.WEBHOOK_PATH || '/telegraf/bot',
    webhookSecret: process.env.WEBHOOK_SECRET || '',
    port: parseInt(process.env.PORT || '3000', 10)
  },
  
  // MongoDB
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/school-bot',
    options: {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }
  },
  
  // Redis (для сессий и кэша)
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: 'school_bot:',
    ttl: 60 * 60 * 24 // 24 часа
  },
  
  // Админы (список Telegram ID)
  adminChatIds: process.env.ADMIN_CHAT_IDS 
    ? process.env.ADMIN_CHAT_IDS.split(',').map(id => parseInt(id.trim(), 10))
    : [],
  
  // Настройки
  app: {
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Europe/Moscow',
    supportedLanguages: ['ru', 'en'],
    defaultLanguage: 'ru'
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: 60 * 1000, // 1 минута
    maxRequests: 30 // 30 сообщений в минуту
  },
  
  // Cron jobs
  cron: {
    homeworkReminderTime: process.env.HOMEWORK_REMINDER_TIME || '20:00',
    timezone: process.env.DEFAULT_TIMEZONE || 'Europe/Moscow'
  }
};

// Валидация обязательных переменных окружения
const requiredEnvVars = ['BOT_TOKEN', 'MONGODB_URI'];
const missingVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingVars.length > 0 && config.app.isProduction) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

export default config;
