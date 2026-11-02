import { bot } from './instance.js';
import { TEXTS } from './texts.js';
import { createRateLimiter } from '../utils/rateLimit.js';
import { getUserByTgId } from '../services/userService.js';
import { getActiveBan } from '../services/banService.js';
import { getSession } from './sessions.js';
import { fill } from '../utils/normalize.js';
import { setupRouter } from './router.js';

export { isAdmin, isModerator, isCreator, isSupport } from './roles.js';

const limiter = createRateLimiter(30, 60_000);
const lastWarning = new Map();
const WARNING_INTERVAL_MS = 3000;

// Callback подтверждается сразу, чтобы у пользователя не висели «часики» на кнопке.
// Повторный answerCbQuery из обработчика (toast) Telegram просто проигнорирует.
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery) {
    const original = ctx.answerCbQuery.bind(ctx);
    let answered = false;
    ctx.answerCbQuery = async (...args) => {
      if (answered) return true;
      answered = true;
      return original(...args).catch(() => true);
    };
    const result = await next();
    if (!answered) await ctx.answerCbQuery().catch(() => true);
    return result;
  }
  return next();
});

// Антиспам: текст и callback считаются вместе. Сверх лимита апдейт молча отбрасывается,
// а предупреждение отправляется не чаще раза в 3 секунды, чтобы само не стало спамом.
bot.use(async (ctx, next) => {
  const tgId = ctx.from?.id;
  if (!tgId || (!ctx.message && !ctx.callbackQuery)) return next();
  if (limiter.check(String(tgId))) return next();
  const now = Date.now();
  if ((lastWarning.get(tgId) || 0) + WARNING_INTERVAL_MS < now) {
    lastWarning.set(tgId, now);
    if (lastWarning.size > 10_000) lastWarning.clear();
    if (ctx.callbackQuery) await ctx.answerCbQuery(TEXTS.RATE_LIMIT, { show_alert: false }).catch(() => true);
    else await ctx.reply(TEXTS.RATE_LIMIT).catch(() => true);
  }
  return undefined;
});

bot.use(async (ctx, next) => {
  if (ctx.from && !ctx.from.is_bot) {
    const user = await getUserByTgId(ctx.from.id);
    ctx.state.user = user;
    ctx.user = user;
  }
  return next();
});

const BAN_ALLOWED_COMMANDS = ['/support', '/help', '/start', '/id', '/contacts'];

// Бан проверяется и по аккаунту, и по самому человеку (Telegram ID или юзернейм):
// так забаненный не обходит бан выходом из аккаунта и новой регистрацией.
bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.from.is_bot) return next();
  const user = ctx.state.user;
  const personBan = user?.banned ? null : await getActiveBan({ tgId: ctx.from.id, username: ctx.from.username });
  if (!user?.banned && !personBan) return next();
  if (user && personBan) {
    user.banned = true;
    user.banReason = personBan.reason || '';
    user.bannedBy = personBan.bannedBy || '';
    user.bannedAt = new Date();
    await user.save();
  }
  const reason = user?.banReason || personBan?.reason || '';
  const text = ctx.message?.text?.trim() || '';
  const command = text.split(/[\s@]/)[0].toLowerCase();
  if (BAN_ALLOWED_COMMANDS.includes(command)) return next();
  const data = ctx.callbackQuery?.data || '';
  if (data.startsWith('sup:') || data === 'cancel' || data === 'help:contacts') return next();
  const session = await getSession(ctx.from.id, 'telegram');
  if (session?.step?.startsWith('sup:') && ctx.message?.text) return next();
  const message = fill(TEXTS.BANNED, { reason: reason || TEXTS.BAN_NO_REASON });
  if (ctx.callbackQuery) await ctx.answerCbQuery(TEXTS.BANNED.split('.')[0], { show_alert: false }).catch(() => true);
  await ctx.reply(message, { parse_mode: 'HTML' }).catch(() => true);
  return undefined;
});

bot.catch(async (err, ctx) => {
  // В лог не попадают токены, specId и текст сообщений — только тип апдейта и причина.
  console.error(`bot error: tgId=${ctx?.from?.id ?? '-'} update=${ctx?.updateType ?? '-'} error=${err?.message ?? err}`);
  try {
    await ctx.reply(TEXTS.GENERIC_ERROR);
  } catch {
    // Пользователь мог заблокировать бота — ответить нельзя.
  }
});

setupRouter(bot);

export { bot };
export default bot;
