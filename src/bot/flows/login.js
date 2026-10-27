import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import { loginStartKeyboard, loginConfirmKeyboard, loginFailedKeyboard, replyKeyboard } from '../keyboards.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { getUserByTgId, getUserBySpecId } from '../../services/userService.js';
import {
  createBotLoginRequest,
  approveBotLogin,
  rejectBotLogin,
  BOT_REQUEST_TTL_MS,
} from '../../services/loginService.js';
import { LoginRequest } from '../../db/models/LoginRequest.js';
import { isValidSpecId, escapeHtml } from '../../utils/normalize.js';
import { showMenuPage1 } from './menu.js';

export async function startLogin(ctx) {
  await answerCb(ctx);
  await setSession(ctx.from.id, 'login:id', {});
  await replyOrEdit(ctx, `<b>${TEXTS.login.title}</b>\n${TEXTS.login.body}`, loginStartKeyboard());
}

export async function handleLoginText(ctx, session) {
  const text = ctx.message.text.trim();

  if (!isValidSpecId(text)) {
    await ctx.reply(TEXTS.login.invalidFormat);
    return true;
  }

  const user = await getUserBySpecId(text);
  if (!user) {
    await ctx.reply(TEXTS.login.notFound);
    return true;
  }
  if (user.status === 'pending') {
    await ctx.reply(TEXTS.login.pending);
    return true;
  }
  if (!user.tgId) {
    await ctx.reply(TEXTS.login.noTelegram);
    return true;
  }
  if (user.tgId === Number(ctx.from.id)) {
    await ctx.reply(TEXTS.login.alreadyLinked);
    return true;
  }

  const busy = await getUserByTgId(ctx.from.id);
  if (busy) {
    await ctx.reply(TEXTS.login.alreadyLinked);
    return true;
  }

  await setSession(ctx.from.id, 'login:confirm', { specId: user.specId, regData: session.data.regData || {} });
  await replyOrEdit(ctx, `${TEXTS.login.confirm}\n\n${escapeHtml(user.school || '')}, класс ${escapeHtml(user.class)}`, {
    ...loginConfirmKeyboard(),
    parse_mode: 'HTML',
  });
  return true;
}

async function confirmLogin(ctx) {
  const session = await getSession(ctx.from.id);
  const specId = session.data.specId;
  if (!specId) {
    await answerCb(ctx, TEXTS.errors.noSession);
    await startLogin(ctx);
    return;
  }

  const result = await createBotLoginRequest(specId, ctx.from.id);
  if (!result.ok) {
    const messages = {
      pending: TEXTS.login.pending,
      no_telegram: TEXTS.login.noTelegram,
      telegram_busy: TEXTS.login.telegramBusy,
      same_telegram: TEXTS.login.alreadyLinked,
      not_found: TEXTS.login.notFound,
    };
    await answerCb(ctx, messages[result.error] || TEXTS.login.failed);
    return;
  }

  const requestId = String(result.request._id);
  await setSession(ctx.from.id, 'login:wait', { requestId, specId });
  await answerCb(ctx);
  await replyOrEdit(ctx, TEXTS.login.requestSent, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]] },
  });

  try {
    await bot.telegram.sendMessage(
      result.owner.tgId,
      TEXTS.login.ownerRequest,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Да, это я', callback_data: `login:approve:${requestId}` }],
            [{ text: 'Нет', callback_data: `login:deny:${requestId}` }],
          ],
        },
      }
    );
  } catch {
    // владелец мог заблокировать бота
  }

  setTimeout(async () => {
    try {
      const request = await LoginRequest.findById(requestId);
      if (!request || request.status !== 'pending') return;
      request.status = 'expired';
      await request.save();
      await bot.telegram.sendMessage(request.newTgId, TEXTS.login.failed, { reply_markup: loginFailedKeyboard().reply_markup });
    } catch {
      // ignore
    }
  }, BOT_REQUEST_TTL_MS).unref();
}

async function approveLogin(ctx, requestId) {
  const result = await approveBotLogin(requestId, ctx.from.id);
  if (!result.ok) {
    await answerCb(ctx, result.error === 'not_owner' ? TEXTS.errors.noPermission : TEXTS.login.failed);
    return;
  }

  await answerCb(ctx, TEXTS.login.confirmed);
  const user = result.user;

  try {
    await bot.telegram.sendMessage(
      user.tgId,
      `<b>${TEXTS.login.confirmed}</b>\n\n<b>${TEXTS.registration.success.title}</b>\n\n${TEXTS.registration.success.body
        .replace('{city}', escapeHtml(user.city || '—'))
        .replace('{school}', escapeHtml(user.school || '—'))
        .replace('{class}', escapeHtml(user.class || '—'))
        .replace('{role}', TEXTS.roles[user.role] || TEXTS.roles.user)
        .replace('{specId}', user.specId)}`,
      { parse_mode: 'HTML', ...replyKeyboard(user.customKeyboard) }
    );
  } catch {
    // ignore
  }
}

async function denyLogin(ctx, requestId) {
  const result = await rejectBotLogin(requestId, ctx.from.id);
  if (!result.ok) {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  await answerCb(ctx, 'Вход отклонён');

  const request = await LoginRequest.findById(requestId);
  if (request?.newTgId) {
    try {
      await bot.telegram.sendMessage(request.newTgId, TEXTS.login.failed, { reply_markup: loginFailedKeyboard().reply_markup });
    } catch {
      // ignore
    }
  }
}

bot.action('login:start', async (ctx) => startLogin(ctx));
bot.action('login:confirm', async (ctx) => confirmLogin(ctx));
bot.action(/^login:confirm:([0-9a-f-]{36})$/, async (ctx) => confirmLogin(ctx));
bot.action(/^login:approve:([0-9a-f]{24})$/, async (ctx) => approveLogin(ctx, ctx.match[1]));
bot.action(/^login:deny:([0-9a-f]{24})$/, async (ctx) => denyLogin(ctx, ctx.match[1]));

bot.action('login:retry', async (ctx) => startLogin(ctx));
