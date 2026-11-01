import { TEXTS } from '../texts.js';
import {
  getLoginStartKeyboard,
  getLoginNotFoundKeyboard,
  getLoginConfirmKeyboard,
  getLoginOwnerKeyboard,
  getLoginDeniedKeyboard,
  getLoginExpiredKeyboard,
  getLoginWaitingKeyboard,
  getOpenSiteKeyboard,
  getMenuOnlyKeyboard,
  getReplyKeyboard,
  getMenuPage1Keyboard,
} from '../keyboards.js';
import { show, say, toast } from '../ui.js';
import { setSession, clearSession } from '../sessions.js';
import { notifyUser } from '../notify.js';
import { getRawUserByTgId, getUserBySpecId } from '../../services/userService.js';
import {
  SPEC_ID_RE,
  createBotLoginRequest,
  getLoginRequest,
  approveLoginRequest,
  rejectLoginRequest,
} from '../../services/loginService.js';
import { LoginRequest } from '../../db/models/LoginRequest.js';
import { buildRegDoneText, resumeRegistration, showStartScreen } from './registration.js';
import { menuText } from './menu.js';

const REQUEST_RE = '([0-9a-f]{24})';

export async function startLogin(ctx) {
  await setSession(ctx.from.id, 'telegram', 'login:id', {});
  return show(ctx, TEXTS.LOGIN_START, getLoginStartKeyboard());
}

async function handleSpecId(ctx, text) {
  const specId = text.trim().toLowerCase();
  if (!SPEC_ID_RE.test(specId)) return say(ctx, TEXTS.LOGIN_BAD_FORMAT, getLoginStartKeyboard());
  const target = await getUserBySpecId(specId);
  if (!target) return say(ctx, TEXTS.LOGIN_NOT_FOUND, getLoginNotFoundKeyboard());
  if (target.status === 'unregistered') return say(ctx, TEXTS.LOGIN_UNREGISTERED, getMenuOnlyKeyboard());
  if (target.status === 'pending') return say(ctx, TEXTS.LOGIN_PENDING, getMenuOnlyKeyboard());
  if (!target.tgId) return say(ctx, TEXTS.LOGIN_SITE_ONLY, getOpenSiteKeyboard('/login'));
  if (Number(target.tgId) === Number(ctx.from.id)) {
    await clearSession(ctx.from.id, 'telegram');
    return say(ctx, TEXTS.LOGIN_ALREADY, getMenuOnlyKeyboard());
  }
  // Один Telegram может быть привязан только к одному активному аккаунту.
  const current = await getRawUserByTgId(ctx.from.id);
  if (current && current.status !== 'unregistered') return say(ctx, TEXTS.LOGIN_TG_TAKEN, getMenuOnlyKeyboard());
  const request = await createBotLoginRequest(target.specId, ctx.from.id);
  const requestId = String(request._id);
  await setSession(ctx.from.id, 'telegram', 'login:wait', { requestId });
  return say(ctx, TEXTS.LOGIN_FOUND, getLoginConfirmKeyboard(requestId));
}

async function handleWaiting(ctx, session) {
  const requestId = session.data?.requestId;
  const request = requestId ? await getLoginRequest(requestId) : null;
  if (!request || request.status === 'expired') {
    await clearSession(ctx.from.id, 'telegram');
    return say(ctx, TEXTS.LOGIN_EXPIRED, getLoginExpiredKeyboard());
  }
  if (request.status === 'rejected') {
    await clearSession(ctx.from.id, 'telegram');
    return say(ctx, TEXTS.LOGIN_REQUESTER_DENIED, getLoginDeniedKeyboard());
  }
  return say(ctx, TEXTS.LOGIN_WAITING, getLoginWaitingKeyboard(requestId));
}

// Текстовый ввод на шагах входа (вызывается из router.js).
export async function handleLoginText(ctx, session, text) {
  if (session.step === 'login:id') return handleSpecId(ctx, text);
  if (session.step === 'login:wait') return handleWaiting(ctx, session);
  await clearSession(ctx.from.id, 'telegram');
  return startLogin(ctx);
}

async function sendRequesterWelcome(tgId, user) {
  await notifyUser(tgId, TEXTS.LOGIN_REQUESTER_APPROVED);
  await notifyUser(tgId, buildRegDoneText(user), getReplyKeyboard(user));
  await notifyUser(tgId, menuText(user), getMenuPage1Keyboard(user));
}

export function loginFlow(bot) {
  bot.action('login:start', async (ctx) => startLogin(ctx));

  bot.action('login:back', async (ctx) => {
    await clearSession(ctx.from.id, 'telegram');
    const raw = await getRawUserByTgId(ctx.from.id);
    if (raw && raw.status === 'unregistered') return resumeRegistration(ctx);
    return showStartScreen(ctx);
  });

  bot.action(new RegExp(`^login:confirm:${REQUEST_RE}$`), async (ctx) => {
    const requestId = ctx.match[1];
    const request = await getLoginRequest(requestId);
    if (!request || request.status !== 'pending' || Number(request.newTgId) !== Number(ctx.from.id)) {
      await clearSession(ctx.from.id, 'telegram');
      return show(ctx, TEXTS.LOGIN_EXPIRED, getLoginExpiredKeyboard());
    }
    const owner = await getUserBySpecId(request.userId);
    if (!owner?.tgId) {
      await clearSession(ctx.from.id, 'telegram');
      return show(ctx, TEXTS.LOGIN_SITE_ONLY, getOpenSiteKeyboard('/login'));
    }
    const delivered = await notifyUser(owner.tgId, TEXTS.LOGIN_OWNER_ASK, getLoginOwnerKeyboard(requestId));
    if (!delivered) {
      await rejectLoginRequest(requestId);
      await clearSession(ctx.from.id, 'telegram');
      return show(ctx, TEXTS.LOGIN_OWNER_UNREACHABLE, getLoginExpiredKeyboard());
    }
    await setSession(ctx.from.id, 'telegram', 'login:wait', { requestId });
    return show(ctx, TEXTS.LOGIN_WAITING, getLoginWaitingKeyboard(requestId));
  });

  bot.action(new RegExp(`^login:status:${REQUEST_RE}$`), async (ctx) => {
    const requestId = ctx.match[1];
    const request = await LoginRequest.findById(requestId);
    if (request?.status === 'approved') {
      await clearSession(ctx.from.id, 'telegram');
      return show(ctx, TEXTS.LOGIN_REQUESTER_APPROVED, getMenuOnlyKeyboard());
    }
    return handleWaiting(ctx, { data: { requestId } });
  });

  bot.action(new RegExp(`^login:approve:${REQUEST_RE}$`), async (ctx) => {
    const requestId = ctx.match[1];
    const request = await getLoginRequest(requestId);
    if (!request || request.status !== 'pending') return show(ctx, TEXTS.LOGIN_EXPIRED);
    const owner = await getUserBySpecId(request.userId);
    // Подтверждать может только текущий владелец аккаунта.
    if (!owner || Number(owner.tgId) !== Number(ctx.from.id)) {
      await toast(ctx, TEXTS.LOGIN_NOT_OWNER, true);
      return null;
    }
    try {
      const user = await approveLoginRequest(requestId, ctx.from.id);
      // Старое устройство теряет доступ: inline-кнопки убираются, нижняя клавиатура скрывается.
      await ctx.editMessageReplyMarkup(undefined).catch(() => true);
      await say(ctx, TEXTS.LOGIN_OWNER_APPROVED, { reply_markup: { remove_keyboard: true } });
      await clearSession(request.newTgId, 'telegram');
      await sendRequesterWelcome(request.newTgId, user);
      return null;
    } catch (err) {
      if (err?.code === 'tg_already_linked') {
        await rejectLoginRequest(requestId);
        await notifyUser(request.newTgId, TEXTS.LOGIN_TG_TAKEN);
        return show(ctx, TEXTS.LOGIN_OWNER_DENIED);
      }
      if (err?.code === 'expired') return show(ctx, TEXTS.LOGIN_EXPIRED);
      if (err?.code === 'not_owner') {
        await toast(ctx, TEXTS.LOGIN_NOT_OWNER, true);
        return null;
      }
      throw err;
    }
  });

  bot.action(new RegExp(`^login:deny:${REQUEST_RE}$`), async (ctx) => {
    const requestId = ctx.match[1];
    const request = await getLoginRequest(requestId);
    if (!request || request.status !== 'pending') return show(ctx, TEXTS.LOGIN_EXPIRED);
    const owner = await getUserBySpecId(request.userId);
    if (!owner || Number(owner.tgId) !== Number(ctx.from.id)) {
      await toast(ctx, TEXTS.LOGIN_NOT_OWNER, true);
      return null;
    }
    await rejectLoginRequest(requestId);
    await show(ctx, TEXTS.LOGIN_OWNER_DENIED);
    await clearSession(request.newTgId, 'telegram');
    await notifyUser(request.newTgId, TEXTS.LOGIN_REQUESTER_DENIED, getLoginDeniedKeyboard());
    return null;
  });
}
