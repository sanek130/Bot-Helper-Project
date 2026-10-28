import bot, { answerCb, replyOrEdit, isCreator } from '../bot.js';
import { TEXTS } from '../texts.js';
import { creatorUserKeyboard } from '../keyboards.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import {
  getUserByTgId,
  getUserBySpecId,
  searchUsers,
  canModerate,
  banUser,
  unbanUser,
  warnUser,
  resetWarns,
  setRole,
  deleteAccount,
} from '../../services/userService.js';
import { notifyUser } from '../notify.js';
import { escapeHtml } from '../../utils/normalize.js';

const SPEC = '([0-9a-f-]{36})';

function shortName(user) {
  return user.username ? `@${user.username}` : user.firstName || user.specId.slice(0, 8);
}

function userButtons(users) {
  return users.map((item) => [{
    text: `${item.banned ? '⛔ ' : ''}${shortName(item)} · ${TEXTS.roles[item.role]} · ${item.class || '—'}`.slice(0, 60),
    callback_data: `crt:u:${item.specId}`,
  }]);
}

async function requireCreator(ctx) {
  const user = await getUserByTgId(ctx.from.id);
  if (!isCreator(user)) {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return null;
  }
  return user;
}

export function banNotice(user) {
  const reason = user.banReason ? TEXTS.banned.reason.replace('{reason}', escapeHtml(user.banReason)) : '';
  return TEXTS.creator.userBanned.replace('{reason}', reason);
}

async function showSearch(ctx) {
  const creator = await requireCreator(ctx);
  if (!creator) return;
  await answerCb(ctx);
  await setSession(ctx.from.id, 'crt:search', {});
  const users = await searchUsers('', 10);
  await replyOrEdit(ctx, TEXTS.creator.searchPrompt, {
    reply_markup: { inline_keyboard: [...userButtons(users), [{ text: TEXTS.buttons.creatorPanel, callback_data: 'adm:panel' }]] },
  });
}

async function showCard(ctx, specId, notice = '') {
  const creator = await getUserByTgId(ctx.from.id);
  const target = await getUserBySpecId(specId);
  if (!target) {
    await replyOrEdit(ctx, TEXTS.creator.notFound, {
      reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.back, callback_data: 'adm:users' }]] },
    });
    return;
  }
  const status = target.banned
    ? `⛔ заблокирован${target.banReason ? ` (${escapeHtml(target.banReason)})` : ''}`
    : target.status === 'pending' ? 'ждёт активации' : 'активен';
  const text = TEXTS.creator.card
    .replace('{name}', escapeHtml(target.firstName || 'Без имени'))
    .replace('{username}', escapeHtml(target.username || '—'))
    .replace('{phone}', escapeHtml(target.phone || '—'))
    .replace('{specId}', target.specId)
    .replace('{school}', escapeHtml(target.school || '—'))
    .replace('{class}', escapeHtml(target.class || '—'))
    .replace('{role}', TEXTS.roles[target.role])
    .replace('{warns}', target.warns || 0)
    .replace('{status}', status)
    .replace('{registeredAt}', new Date(target.registeredAt).toLocaleDateString('ru-RU'));
  const allowed = canModerate(creator, target);
  const footer = allowed ? '' : `\n\n${TEXTS.creator.protected}`;
  await replyOrEdit(ctx, `${notice ? `${notice}\n\n` : ''}${text}${footer}`, creatorUserKeyboard(target, { canModerate: allowed }));
}

// Общая проверка для всех действий над пользователем
async function withTarget(ctx, specId) {
  const creator = await requireCreator(ctx);
  if (!creator) return {};
  const target = await getUserBySpecId(specId);
  if (!target) {
    await answerCb(ctx, TEXTS.creator.notFound);
    return {};
  }
  if (!canModerate(creator, target)) {
    await answerCb(ctx, TEXTS.creator.protected);
    return {};
  }
  return { creator, target };
}

async function doBan(ctx, specId, reason) {
  const { creator, target } = await withTarget(ctx, specId);
  if (!target) return;
  const updated = await banUser(target.specId, { reason, by: creator.specId });
  await clearSession(ctx.from.id);
  await answerCb(ctx, TEXTS.creator.bannedDone);
  await notifyUser(updated, banNotice(updated));
  await showCard(ctx, specId, TEXTS.creator.bannedDone);
}

export async function handleCreatorText(ctx, session) {
  const creator = await getUserByTgId(ctx.from.id);
  if (!isCreator(creator)) return false;
  const text = ctx.message.text.trim();

  if (session.step === 'crt:search') {
    const users = await searchUsers(text, 10);
    if (users.length === 1) {
      await showCard(ctx, users[0].specId);
      return true;
    }
    if (!users.length) {
      await ctx.reply(TEXTS.creator.notFound);
      return true;
    }
    await ctx.reply(`Найдено: ${users.length}. Выбери пользователя.`, {
      reply_markup: { inline_keyboard: [...userButtons(users), [{ text: TEXTS.buttons.creatorPanel, callback_data: 'adm:panel' }]] },
    });
    return true;
  }

  if (session.step === 'crt:banreason') {
    await doBan(ctx, session.data.specId, text.slice(0, 300));
    return true;
  }

  return false;
}

bot.action('adm:users', async (ctx) => showSearch(ctx));

bot.action(new RegExp(`^crt:u:${SPEC}$`), async (ctx) => {
  if (!await requireCreator(ctx)) return;
  await answerCb(ctx);
  await showCard(ctx, ctx.match[1]);
});

bot.action(new RegExp(`^crt:ban:${SPEC}$`), async (ctx) => {
  const { target } = await withTarget(ctx, ctx.match[1]);
  if (!target) return;
  await answerCb(ctx);
  await setSession(ctx.from.id, 'crt:banreason', { specId: target.specId });
  await replyOrEdit(ctx, TEXTS.creator.banReasonPrompt, {
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.buttons.noReason, callback_data: `crt:banok:${target.specId}` }],
        [{ text: TEXTS.buttons.cancel, callback_data: `crt:u:${target.specId}` }],
      ],
    },
  });
});

bot.action(new RegExp(`^crt:banok:${SPEC}$`), async (ctx) => doBan(ctx, ctx.match[1], ''));

bot.action(new RegExp(`^crt:unban:${SPEC}$`), async (ctx) => {
  const { target } = await withTarget(ctx, ctx.match[1]);
  if (!target) return;
  const updated = await unbanUser(target.specId);
  await answerCb(ctx, TEXTS.creator.unbannedDone);
  await notifyUser(updated, TEXTS.creator.userUnbanned);
  await showCard(ctx, target.specId, TEXTS.creator.unbannedDone);
});

bot.action(new RegExp(`^crt:promote:${SPEC}$`), async (ctx) => {
  const { target } = await withTarget(ctx, ctx.match[1]);
  if (!target) return;
  if (target.banned) {
    await answerCb(ctx, 'Сначала разбань пользователя');
    return;
  }
  const updated = await setRole(target.specId, 'admin');
  await answerCb(ctx, TEXTS.creator.promoted);
  await notifyUser(updated, TEXTS.creator.userPromoted);
  await showCard(ctx, target.specId, TEXTS.creator.promoted);
});

bot.action(new RegExp(`^crt:demote:${SPEC}$`), async (ctx) => {
  const { target } = await withTarget(ctx, ctx.match[1]);
  if (!target) return;
  const updated = await setRole(target.specId, 'user');
  await answerCb(ctx, TEXTS.creator.demoted);
  await notifyUser(updated, TEXTS.creator.userDemoted);
  await showCard(ctx, target.specId, TEXTS.creator.demoted);
});

bot.action(new RegExp(`^crt:warn:${SPEC}$`), async (ctx) => {
  const { target } = await withTarget(ctx, ctx.match[1]);
  if (!target) return;
  const updated = await warnUser(target.specId);
  const notice = TEXTS.creator.warned.replace('{warns}', updated.warns);
  await answerCb(ctx, notice);
  await notifyUser(updated, TEXTS.creator.userWarned.replace('{warns}', updated.warns));
  await showCard(ctx, target.specId, notice);
});

bot.action(new RegExp(`^crt:unwarn:${SPEC}$`), async (ctx) => {
  const { target } = await withTarget(ctx, ctx.match[1]);
  if (!target) return;
  await resetWarns(target.specId);
  await answerCb(ctx, TEXTS.creator.warnsReset);
  await showCard(ctx, target.specId, TEXTS.creator.warnsReset);
});

bot.action(new RegExp(`^crt:del:${SPEC}$`), async (ctx) => {
  const { target } = await withTarget(ctx, ctx.match[1]);
  if (!target) return;
  await answerCb(ctx);
  await replyOrEdit(ctx, TEXTS.creator.deleteConfirm, {
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.buttons.deleteAccount, callback_data: `crt:delyes:${target.specId}` }],
        [{ text: TEXTS.buttons.cancel, callback_data: `crt:u:${target.specId}` }],
      ],
    },
  });
});

bot.action(new RegExp(`^crt:delyes:${SPEC}$`), async (ctx) => {
  const { target } = await withTarget(ctx, ctx.match[1]);
  if (!target) return;
  await deleteAccount(target.specId);
  await answerCb(ctx, TEXTS.creator.deleted);
  await replyOrEdit(ctx, TEXTS.creator.deleted, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.users, callback_data: 'adm:users' }]] },
  });
});

export { getSession };
