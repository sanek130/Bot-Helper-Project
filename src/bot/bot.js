import { Telegraf } from 'telegraf';
import config from '../config.js';
import { TEXTS } from './texts.js';
import { createRateLimiter } from '../utils/rateLimit.js';

const bot = new Telegraf(config.bot.token);

const limiter = createRateLimiter();

bot.use(async (ctx, next) => {
  const tgId = ctx.from?.id;
  if (!tgId) return next();

  const result = limiter.check(tgId);
  if (!result.allowed) {
    if (result.canWarn) {
      await ctx.reply(TEXTS.errors.tooManyActions).catch(() => {});
    }
    return undefined;
  }

  return next();
});

export async function answerCb(ctx, text = '') {
  try {
    await ctx.answerCbQuery(text);
  } catch (error) {
    if (!error.description?.includes('query is too old')) {
      console.error('answerCbQuery:', error.message);
    }
  }
}

// Редактируем сообщение, если это callback, иначе отправляем новое
export async function replyOrEdit(ctx, text, extra = {}) {
  const options = { parse_mode: 'HTML', ...extra };

  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, options);
      return;
    } catch (error) {
      if (!error.description?.includes('message is not modified')) {
        console.error('editMessageText:', error.message);
      } else {
        return;
      }
    }
  }

  await ctx.reply(text, options);
}

export function isAdmin(user) {
  return user?.role === 'admin' || user?.role === 'creator';
}

export function isCreator(user) {
  return user?.role === 'creator';
}

bot.catch(async (error, ctx) => {
  const tgId = ctx?.from?.id;
  const action = ctx?.callbackQuery?.data ? String(ctx.callbackQuery.data).split(':')[0] : undefined;
  console.error('Ошибка обработчика бота', { tgId, action, message: error.message });
  try {
    if (ctx?.callbackQuery) await ctx.answerCbQuery('Ошибка');
    await ctx?.reply(TEXTS.errors.somethingWentWrong, { parse_mode: 'HTML' });
  } catch {
    // ignore
  }
});

export default bot;
