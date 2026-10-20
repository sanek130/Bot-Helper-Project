import { Telegraf } from 'telegraf';
import config from '../config.js';
import { Session } from '../db/models/Session.js';

// Создаём бота
const bot = new Telegraf(config.bot.token);

// Антиспам: максимум 30 действий в минуту на пользователя
const RATE_LIMIT_MAX_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map(); // userId -> { count, resetAt, lastWarnAt }

// Middleware антиспама
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();
  
  const now = Date.now();
  const bucket = rateLimitBuckets.get(String(userId)) || { 
    count: 0, 
    resetAt: now + RATE_LIMIT_WINDOW_MS, 
    lastWarnAt: 0 
  };
  
  if (now >= bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
    bucket.lastWarnAt = 0;
  }
  
  bucket.count += 1;
  rateLimitBuckets.set(String(userId), bucket);
  
  if (bucket.count > RATE_LIMIT_MAX_PER_MINUTE) {
    // Предупреждаем не чаще раза в 3 секунды
    if (now - bucket.lastWarnAt > 3000) {
      const secondsLeft = Math.ceil((bucket.resetAt - now) / 1000);
      bucket.lastWarnAt = now;
      rateLimitBuckets.set(String(userId), bucket);
      try {
        await ctx.reply(`⏳ Слишком много действий. Подожди немного.`);
      } catch (e) {
        // Игнорируем ошибки при отправке сообщения
      }
    }
    return;
  }
  
  return next();
});

// Middleware для работы с сессиями в MongoDB
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();
  
  try {
    let session = await Session.findOne({
      userId: String(userId),
      platform: 'telegram',
      expiresAt: { $gt: new Date() }
    });
    
    if (!session) {
      // Создаём новую сессию
      session = new Session({
        userId: String(userId),
        platform: 'telegram',
        step: null,
        data: {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      await session.save();
    }
    
    // Добавляем сессию в контекст
    ctx.session = session;
    
    // Продлеваем TTL
    session.updatedAt = new Date();
    session.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await next();
    
    // Сохраняем изменения сессии
    if (Object.keys(session.data).length > 0 || session.step) {
      await session.save();
    } else {
      // Если сессия пустая, удаляем её
      await Session.deleteOne({ _id: session._id });
    }
  } catch (e) {
    console.error('Ошибка работы с сессией:', e);
    // При ошибке продолжаем без сессии
    return next();
  }
});

// Функция для очистки сессии
export async function clearSession(ctx) {
  if (ctx.session) {
    await Session.deleteOne({ _id: ctx.session._id });
    ctx.session = null;
  }
}

// Функция для установки шага сессии
export async function setSessionStep(ctx, step, data = {}) {
  if (ctx.session) {
    ctx.session.step = step;
    ctx.session.data = { ...ctx.session.data, ...data };
    await ctx.session.save();
  }
}

// Функция для получения данных сессии
export function getSessionData(ctx, key) {
  if (ctx.session && ctx.session.data) {
    return key ? ctx.session.data[key] : ctx.session.data;
  }
  return null;
}

// Функция для безопасного ответа на callback
export async function safeAnswerCb(ctx, text = '') {
  try {
    await ctx.answerCbQuery(text);
  } catch (err) {
    if (err.description?.includes('query is too old')) {
      console.warn('Ignored stale callback query');
    } else {
      console.error('Failed to answer callback:', err.message);
    }
  }
}

// Функция для редактирования или отправки сообщения
export async function replyOrEdit(ctx, text, options = {}) {
  const parseMode = options.parse_mode || 'HTML';
  delete options.parse_mode;
  
  try {
    if (ctx.callbackQuery?.message?.text) {
      await ctx.editMessageText(text, { ...options, parse_mode });
      return;
    }
  } catch (e) {
    console.warn('editMessageText failed:', e.message);
  }
  
  try {
    await ctx.deleteMessage().catch(() => {});
  } catch (e) {}
  
  return await ctx.reply(text, { ...options, parse_mode });
}

export default bot;
