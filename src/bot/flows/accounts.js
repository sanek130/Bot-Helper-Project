import { TEXTS, ROLE_LABELS } from '../texts.js';
import {
  getAccountsKeyboard,
  getAccountSwitchKeyboard,
  getAccountDeleteKeyboard,
  getAccountsBackKeyboard,
  getReplyKeyboard,
} from '../keyboards.js';
import { show, say, toast } from '../ui.js';
import { clearAllSessions } from '../sessions.js';
import {
  getUserByTgId,
  getUserBySpecId,
  getDetachedAccounts,
  isDetachedOwnedBy,
  claimDetachedAccount,
  deleteAccount,
} from '../../services/userService.js';
import { fill } from '../../utils/normalize.js';
import { capitalize } from '../../utils/subjects.js';
import { formatDate } from './profile.js';
import { showMenuPage1 } from './menu.js';
import { resumeRegistration } from './registration.js';

const SPEC = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const LIST_LIMIT = 5;

export function accountLabel(user) {
  if (!user) return '—';
  return `${capitalize(user.school) || '—'}, ${user.class || '—'} (${user.city || '—'})`;
}

function accountsText(accounts, mode) {
  const items = accounts.map((account, i) => {
    const item = fill(TEXTS.ACC_LIST_ITEM, {
      n: i + 1,
      city: account.city || '—',
      school: capitalize(account.school) || '—',
      class: account.class || '—',
      firstName: account.firstName || '—',
      role: ROLE_LABELS[account.role] || account.role,
      registeredAt: formatDate(account.registeredAt || account.createdAt),
      specId: account.specId,
    });
    return account.banned ? `${item}\n${TEXTS.ACC_BANNED_MARK}` : item;
  });
  const footer = mode === 'reg' ? TEXTS.ACC_LIST_FOOTER_REG : TEXTS.ACC_LIST_FOOTER_PROFILE;
  return [TEXTS.ACC_LIST_TITLE, ...items, footer].join('\n\n');
}

export async function showAccounts(ctx, { mode, forceNew = false } = {}) {
  const current = await getUserByTgId(ctx.from.id);
  const listMode = mode || (current?.status === 'active' ? 'profile' : 'reg');
  const accounts = await getDetachedAccounts(ctx.from.id, LIST_LIMIT);
  const output = forceNew ? say : show;
  if (accounts.length === 0) {
    if (listMode === 'reg') return resumeRegistration(ctx, { skipAccounts: true });
    return output(ctx, TEXTS.ACC_LIST_EMPTY, getAccountsKeyboard([], 'profile'));
  }
  return output(ctx, accountsText(accounts, listMode), getAccountsKeyboard(accounts, listMode));
}

// Экран аккаунтов перед регистрацией: true, если у этого Telegram ID есть аккаунты, из которых он вышел.
export async function offerDetachedAccounts(ctx, { forceNew = false } = {}) {
  const accounts = await getDetachedAccounts(ctx.from.id, LIST_LIMIT);
  if (accounts.length === 0) return false;
  const output = forceNew ? say : show;
  await output(ctx, accountsText(accounts, 'reg'), getAccountsKeyboard(accounts, 'reg'));
  return true;
}

async function enterAccount(ctx, specId, notice = '') {
  const user = await claimDetachedAccount(specId, ctx.from.id, {
    firstName: ctx.from.first_name,
    username: ctx.from.username,
  });
  await clearAllSessions(ctx.from.id);
  if (ctx.callbackQuery?.message) await ctx.editMessageReplyMarkup(undefined).catch(() => true);
  const greeting = fill(TEXTS.WELCOME_BACK, { firstName: user.firstName || ctx.from.first_name || '' });
  await say(ctx, [notice, greeting].filter(Boolean).join('\n'), getReplyKeyboard(user));
  return showMenuPage1(ctx, { forceNew: true });
}

// Вход в аккаунт без привязки: спец-ID играет роль пароля, поэтому достаточно знать его.
// Если человек уже в другом аккаунте — сначала спрашиваем, переключаться ли.
export async function requestEnterAccount(ctx, target, notice = '') {
  const current = await getUserByTgId(ctx.from.id);
  if (current && current.status === 'active' && current.specId !== target.specId) {
    const text = fill(TEXTS.LOGIN_SWITCH_CONFIRM, { current: accountLabel(current), target: accountLabel(target) });
    return show(ctx, text, getAccountSwitchKeyboard(target.specId));
  }
  return enterAccount(ctx, target.specId, notice);
}

function isEnterable(target) {
  return Boolean(target && target.status === 'active' && !target.tgId);
}

export function accountsFlow(bot) {
  bot.action('acc:list', async (ctx) => showAccounts(ctx));

  bot.action('reg:new', async (ctx) => resumeRegistration(ctx, { skipAccounts: true }));

  bot.action(new RegExp(`^acc:use:${SPEC}$`), async (ctx) => {
    const target = await getUserBySpecId(ctx.match[1]);
    if (!isEnterable(target)) {
      await toast(ctx, TEXTS.ACC_NOT_AVAILABLE, true);
      return showAccounts(ctx);
    }
    return requestEnterAccount(ctx, target);
  });

  bot.action(new RegExp(`^acc:swyes:${SPEC}$`), async (ctx) => {
    const target = await getUserBySpecId(ctx.match[1]);
    if (!isEnterable(target)) {
      await toast(ctx, TEXTS.ACC_NOT_AVAILABLE, true);
      return showAccounts(ctx);
    }
    return enterAccount(ctx, target.specId);
  });

  // Удалять можно только свой аккаунт без привязки: одного спец-ID для этого мало.
  bot.action(new RegExp(`^acc:del:${SPEC}$`), async (ctx) => {
    const target = await getUserBySpecId(ctx.match[1]);
    if (!isDetachedOwnedBy(target, ctx.from.id)) {
      await toast(ctx, TEXTS.ACC_NOT_AVAILABLE, true);
      return showAccounts(ctx);
    }
    return show(ctx, fill(TEXTS.ACC_DELETE_CONFIRM, { account: accountLabel(target) }), getAccountDeleteKeyboard(target.specId));
  });

  bot.action(new RegExp(`^acc:delyes:${SPEC}$`), async (ctx) => {
    const target = await getUserBySpecId(ctx.match[1]);
    if (!isDetachedOwnedBy(target, ctx.from.id)) {
      await toast(ctx, TEXTS.ACC_NOT_AVAILABLE, true);
      return showAccounts(ctx);
    }
    await deleteAccount(target.specId);
    return show(ctx, TEXTS.ACC_DELETED, getAccountsBackKeyboard());
  });
}
