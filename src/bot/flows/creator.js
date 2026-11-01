import { TEXTS, ROLE_LABELS } from '../texts.js';
import {
  getCreatorPanelKeyboard,
  getBackToPanelKeyboard,
  getReportActionsKeyboard,
  getEscalateThreeKeyboard,
  getUsersSearchKeyboard,
  getUserMoreKeyboard,
  getUserCardKeyboard,
  getBanReasonKeyboard,
  getDeleteAccountConfirmKeyboard,
  getUserBackKeyboard,
  getMenuOnlyKeyboard,
  getOpenSiteKeyboard,
} from '../keyboards.js';
import { show, say, toast } from '../ui.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { requireModerator, requireCreator, canModerate } from '../guards.js';
import { isCreator } from '../roles.js';
import { notifyUser, notifyOnlyCreators } from '../notify.js';
import {
  countUsersOverview,
  getUserBySpecId,
  searchUsers,
  applyWarn,
  resetWarns,
  setRole,
  demoteToUser,
  ban,
  unban,
  liftAdminBan,
  deleteAccount,
} from '../../services/userService.js';
import {
  getOpenReports,
  countOpenReports,
  getReportById,
  resolveReport,
  escalateReport,
} from '../../services/reportService.js';
import { countOpenTickets } from '../../services/supportService.js';
import { removeHomeworkByAdmin } from '../../services/homeworkService.js';
import { fill, truncate } from '../../utils/normalize.js';
import { capitalize } from '../../utils/subjects.js';

const SPEC = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const REPORT = '([0-9a-f]{24})';

function displayName(user) {
  return user?.firstName || 'Без имени';
}

function displayUsername(user) {
  return user?.username || 'нет';
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

export async function showCreatorPanel(ctx, { forceNew = false } = {}) {
  const user = await requireModerator(ctx);
  if (!user) return null;
  await clearSession(ctx.from.id, 'telegram');
  const [overview, openReports, openTickets] = await Promise.all([countUsersOverview(), countOpenReports(), countOpenTickets()]);
  const text = fill(TEXTS.CRT_PANEL, {
    roleTitle: isCreator(user) ? 'создателя' : 'модератора',
    ...overview,
    openReports,
    openTickets,
  });
  return (forceNew ? say : show)(ctx, text, getCreatorPanelKeyboard(user));
}

function reportCard(report, fromUser, onAdmin) {
  return fill(TEXTS.CRT_REPORT_CARD, {
    reportId: String(report._id),
    fromName: displayName(fromUser),
    fromUsername: displayUsername(fromUser),
    adminName: displayName(onAdmin),
    adminUsername: displayUsername(onAdmin),
    classKey: report.classKey,
    escalated: report.escalatedToCreator ? TEXTS.CRT_REPORT_ESCALATED : '',
    text: report.text,
  });
}

async function showReports(ctx) {
  const user = await requireModerator(ctx);
  if (!user) return null;
  await clearSession(ctx.from.id, 'telegram');
  const items = await getOpenReports(20);
  if (items.length === 0) return show(ctx, TEXTS.CRT_NO_REPORTS, getBackToPanelKeyboard());
  for (const { report, fromUser, onAdmin } of items) {
    await say(ctx, reportCard(report, fromUser, onAdmin), getReportActionsKeyboard(String(report._id), user));
  }
  return say(ctx, fill(TEXTS.CRT_REPORTS_FOOTER, { count: items.length }), getBackToPanelKeyboard());
}

// Общая подготовка решения по жалобе: права, актуальность жалобы и сам админ.
async function loadReportContext(ctx, action) {
  const user = await requireModerator(ctx);
  if (!user) return null;
  const report = await getReportById(ctx.match[1]);
  if (!report || report.status !== 'open') {
    await show(ctx, TEXTS.REP_ALREADY_DONE, getBackToPanelKeyboard());
    return null;
  }
  const onAdmin = await getUserBySpecId(report.onAdminId);
  if (!onAdmin && action !== 'reject') {
    await show(ctx, TEXTS.REP_ADMIN_GONE, getBackToPanelKeyboard());
    return null;
  }
  if (onAdmin && action !== 'reject' && !canModerate(user, onAdmin, action)) {
    await show(ctx, TEXTS.CRT_CANNOT_MODERATE, getBackToPanelKeyboard());
    return null;
  }
  return { user, report, onAdmin };
}

async function notifyReporter(report, text) {
  const reporter = await getUserBySpecId(report.fromUserId);
  if (reporter?.tgId) await notifyUser(reporter.tgId, text);
}

async function handleReportWarn(ctx) {
  const item = await loadReportContext(ctx, 'warn');
  if (!item) return null;
  const { user, report, onAdmin } = item;
  // Жалоба закрывается до выдачи варна: атомарное условие status: 'open' не даст двум модераторам
  // одновременно выдать два варна по одной жалобе.
  const resolved = await resolveReport(String(report._id), user.specId, 'resolved');
  if (!resolved) return show(ctx, TEXTS.REP_ALREADY_DONE, getBackToPanelKeyboard());
  const warned = await applyWarn(onAdmin.specId);
  const warns = warned?.warns || 0;
  if (onAdmin.tgId) await notifyUser(onAdmin.tgId, fill(TEXTS.REP_WARN_ADMIN, { warns }));
  await notifyReporter(report, TEXTS.REP_WARN_REPORTER);
  if (warns >= 3) {
    if (isCreator(user)) {
      const { removedCount } = onAdmin.tgId ? await removeHomeworkByAdmin(onAdmin.tgId) : { removedCount: 0 };
      return show(ctx, fill(TEXTS.REP_BANNED_THREE, { removed: removedCount }), getBackToPanelKeyboard());
    }
    // Модератор не принимает окончательного решения при третьем варне — его принимает создатель.
    const notice = fill(TEXTS.REP_ESCALATE_THREE_NOTIFY, {
      adminName: displayName(onAdmin),
      adminUsername: displayUsername(onAdmin),
      moderatorName: displayName(user),
    });
    await notifyOnlyCreators(notice, getEscalateThreeKeyboard(onAdmin.specId));
    return show(ctx, TEXTS.REP_ESCALATE_THREE, getBackToPanelKeyboard());
  }
  return show(ctx, fill(TEXTS.REP_WARN_DONE, { warns }), getBackToPanelKeyboard());
}

async function handleReportReject(ctx) {
  const item = await loadReportContext(ctx, 'reject');
  if (!item) return null;
  const resolved = await resolveReport(String(item.report._id), item.user.specId, 'rejected');
  if (!resolved) return show(ctx, TEXTS.REP_ALREADY_DONE, getBackToPanelKeyboard());
  await notifyReporter(item.report, TEXTS.REP_REJECTED_REPORTER);
  return show(ctx, TEXTS.REP_REJECTED, getBackToPanelKeyboard());
}

async function handleReportDemote(ctx) {
  const item = await loadReportContext(ctx, 'demote');
  if (!item) return null;
  const { user, report, onAdmin } = item;
  const resolved = await resolveReport(String(report._id), user.specId, 'resolved');
  if (!resolved) return show(ctx, TEXTS.REP_ALREADY_DONE, getBackToPanelKeyboard());
  await demoteToUser(onAdmin.specId);
  if (onAdmin.tgId) await notifyUser(onAdmin.tgId, TEXTS.REP_DEMOTED_ADMIN);
  await notifyReporter(report, TEXTS.REP_DEMOTED_REPORTER);
  return show(ctx, TEXTS.REP_DEMOTED, getBackToPanelKeyboard());
}

async function handleReportEscalate(ctx) {
  const user = await requireModerator(ctx);
  if (!user) return null;
  if (isCreator(user)) {
    await toast(ctx, TEXTS.REP_ESCALATE_ONLY_MOD, true);
    return null;
  }
  const report = await escalateReport(ctx.match[1]);
  if (!report) return show(ctx, TEXTS.REP_ALREADY_DONE, getBackToPanelKeyboard());
  const notice = fill(TEXTS.REP_ESCALATED_NOTIFY, { moderatorName: displayName(user), reportId: String(report._id) });
  await notifyOnlyCreators(notice, getReportActionsKeyboard(String(report._id), { role: 'creator' }));
  return show(ctx, TEXTS.REP_ESCALATED, getBackToPanelKeyboard());
}

function userShortCard(target) {
  const lines = [
    fill(TEXTS.CRT_USER_CARD, {
      firstName: displayName(target),
      username: displayUsername(target),
      specId: target.specId,
      city: capitalize(target.city) || '—',
      school: capitalize(target.school) || '—',
      class: target.class || '—',
      role: ROLE_LABELS[target.role] || target.role,
    }),
  ];
  if (target.role === 'admin' || (target.warns || 0) > 0) lines.push(fill(TEXTS.CRT_USER_WARNS, { warns: target.warns || 0 }));
  if (target.banned) lines.push(TEXTS.CRT_USER_BANNED);
  return lines.join('\n');
}

async function startUsersSearch(ctx) {
  const user = await requireModerator(ctx);
  if (!user) return null;
  await setSession(ctx.from.id, 'telegram', 'crt:users_search', {});
  return show(ctx, TEXTS.CRT_USERS_SEARCH, getUsersSearchKeyboard());
}

async function showUsersList(ctx, query) {
  const user = await requireModerator(ctx);
  if (!user) return null;
  await setSession(ctx.from.id, 'telegram', 'crt:users_search', {});
  const users = await searchUsers(query, 10);
  if (users.length === 0) return say(ctx, TEXTS.CRT_USERS_EMPTY, getUsersSearchKeyboard());
  for (const target of users) await say(ctx, userShortCard(target), getUserMoreKeyboard(target.specId));
  return say(ctx, `${fill(TEXTS.CRT_USERS_FOUND, { count: users.length })}\n${TEXTS.CRT_USERS_SEARCH}`, getUsersSearchKeyboard());
}

async function showUserCard(ctx, specId, { forceNew = false } = {}) {
  const user = await requireModerator(ctx);
  if (!user) return null;
  const target = await getUserBySpecId(specId);
  const output = forceNew ? say : show;
  if (!target) return output(ctx, TEXTS.CRT_USER_NOT_FOUND, getUsersSearchKeyboard());
  const lines = [
    userShortCard(target),
    '',
    fill(TEXTS.CRT_USER_DETAILS, {
      status: target.status,
      tgId: target.tgId || '—',
      homeworkViews: target.stats?.homeworkViews || 0,
      homeworkAdded: target.stats?.homeworkAdded || 0,
      lastActive: formatDateTime(target.stats?.lastActive),
      registeredAt: formatDateTime(target.registeredAt || target.createdAt),
    }),
  ];
  if (target.adminBanned) lines.push(TEXTS.CRT_USER_ADMIN_BANNED);
  if (target.banned && target.banReason) lines.push(fill(TEXTS.BANNED, { reason: target.banReason }));
  const keyboard = canModerate(user, target, 'ban') ? getUserCardKeyboard(target, user) : getUserBackKeyboard(target.specId);
  return output(ctx, lines.join('\n'), keyboard);
}

// Загрузка цели действия с проверкой иерархии ролей (модератор не трогает модераторов и создателей).
async function loadTarget(ctx, action, { creatorOnly = false } = {}) {
  const user = creatorOnly ? await requireCreator(ctx) : await requireModerator(ctx);
  if (!user) return null;
  const target = await getUserBySpecId(ctx.match[1]);
  if (!target) {
    await show(ctx, TEXTS.CRT_USER_NOT_FOUND, getUsersSearchKeyboard());
    return null;
  }
  if (!canModerate(user, target, action)) {
    await show(ctx, TEXTS.CRT_CANNOT_MODERATE, getUserBackKeyboard(target.specId));
    return null;
  }
  return { user, target };
}

async function applyBan(ctx, user, target, reason) {
  await ban(target.specId, reason, user.specId);
  await clearSession(ctx.from.id, 'telegram');
  if (target.tgId) await notifyUser(target.tgId, fill(TEXTS.CRT_BANNED_NOTIFY, { reason: reason || TEXTS.BAN_NO_REASON }));
  return say(ctx, TEXTS.CRT_BANNED, getUserBackKeyboard(target.specId));
}

// Текстовый ввод на шагах crt:* (вызывается из router.js).
export async function handleCreatorText(ctx, session, text) {
  if (session.step === 'crt:users_search') return showUsersList(ctx, String(text ?? '').trim());
  if (session.step === 'crt:ban_reason') {
    const user = await requireModerator(ctx);
    if (!user) return null;
    const target = await getUserBySpecId(session.data?.specId);
    if (!target) {
      await clearSession(ctx.from.id, 'telegram');
      return say(ctx, TEXTS.CRT_USER_NOT_FOUND, getUsersSearchKeyboard());
    }
    if (!canModerate(user, target, 'ban')) {
      await clearSession(ctx.from.id, 'telegram');
      return say(ctx, TEXTS.CRT_CANNOT_MODERATE, getUserBackKeyboard(target.specId));
    }
    return applyBan(ctx, user, target, truncate(String(text ?? '').trim(), 300));
  }
  await clearSession(ctx.from.id, 'telegram');
  return showCreatorPanel(ctx, { forceNew: true });
}

export function creatorFlow(bot) {
  bot.action('crt:panel', async (ctx) => showCreatorPanel(ctx));
  bot.command('creator', async (ctx) => showCreatorPanel(ctx, { forceNew: true }));

  bot.action('crt:reports', async (ctx) => showReports(ctx));
  bot.action('adm:reports', async (ctx) => showReports(ctx));

  bot.action(new RegExp(`^rep:warn:${REPORT}$`), async (ctx) => handleReportWarn(ctx));
  bot.action(new RegExp(`^rep:reject:${REPORT}$`), async (ctx) => handleReportReject(ctx));
  bot.action(new RegExp(`^rep:demote:${REPORT}$`), async (ctx) => handleReportDemote(ctx));
  bot.action(new RegExp(`^rep:escalate:${REPORT}$`), async (ctx) => handleReportEscalate(ctx));

  bot.action('crt:users', async (ctx) => startUsersSearch(ctx));
  bot.action('adm:users', async (ctx) => startUsersSearch(ctx));
  bot.action('crt:recent', async (ctx) => showUsersList(ctx, ''));

  bot.action(new RegExp(`^crt:user:${SPEC}$`), async (ctx) => {
    await clearSession(ctx.from.id, 'telegram');
    return showUserCard(ctx, ctx.match[1]);
  });

  bot.action(new RegExp(`^crt:ban:${SPEC}$`), async (ctx) => {
    const item = await loadTarget(ctx, 'ban');
    if (!item) return null;
    await setSession(ctx.from.id, 'telegram', 'crt:ban_reason', { specId: item.target.specId });
    return say(ctx, TEXTS.CRT_BAN_REASON, getBanReasonKeyboard(item.target.specId));
  });

  bot.action(new RegExp(`^crt:banno:${SPEC}$`), async (ctx) => {
    const item = await loadTarget(ctx, 'ban');
    if (!item) return null;
    return applyBan(ctx, item.user, item.target, '');
  });

  bot.action(new RegExp(`^crt:unban:${SPEC}$`), async (ctx) => {
    const item = await loadTarget(ctx, 'unban');
    if (!item) return null;
    await unban(item.target.specId);
    if (item.target.tgId) await notifyUser(item.target.tgId, TEXTS.CRT_UNBANNED_NOTIFY);
    return show(ctx, TEXTS.CRT_UNBANNED, getUserBackKeyboard(item.target.specId));
  });

  bot.action(new RegExp(`^crt:promote:${SPEC}$`), async (ctx) => {
    const item = await loadTarget(ctx, 'promote', { creatorOnly: true });
    if (!item) return null;
    if (item.target.adminBanned) return show(ctx, TEXTS.CRT_PROMOTE_BANNED, getUserBackKeyboard(item.target.specId));
    await setRole(item.target.specId, 'admin');
    if (item.target.tgId) await notifyUser(item.target.tgId, TEXTS.CRT_PROMOTED_NOTIFY);
    return show(ctx, TEXTS.CRT_PROMOTED, getUserBackKeyboard(item.target.specId));
  });

  bot.action(new RegExp(`^crt:demote:${SPEC}$`), async (ctx) => {
    const item = await loadTarget(ctx, 'demote');
    if (!item) return null;
    // Модератор понижает только админов; поддержку снимает создатель.
    if (item.target.role === 'support' && !isCreator(item.user)) {
      return show(ctx, TEXTS.CREATOR_ONLY, getUserBackKeyboard(item.target.specId));
    }
    await demoteToUser(item.target.specId);
    if (item.target.tgId) await notifyUser(item.target.tgId, TEXTS.CRT_DEMOTED_NOTIFY);
    return show(ctx, TEXTS.CRT_DEMOTED, getUserBackKeyboard(item.target.specId));
  });

  bot.action(new RegExp(`^crt:warn:${SPEC}$`), async (ctx) => {
    const item = await loadTarget(ctx, 'warn');
    if (!item) return null;
    const warned = await applyWarn(item.target.specId);
    const warns = warned?.warns || 0;
    if (item.target.tgId) await notifyUser(item.target.tgId, fill(TEXTS.REP_WARN_ADMIN, { warns }));
    if (warns >= 3) {
      const { removedCount } = item.target.tgId ? await removeHomeworkByAdmin(item.target.tgId) : { removedCount: 0 };
      return show(ctx, fill(TEXTS.CRT_WARN_BANNED, { removed: removedCount }), getUserBackKeyboard(item.target.specId));
    }
    return show(ctx, fill(TEXTS.CRT_WARNED, { warns }), getUserBackKeyboard(item.target.specId));
  });

  bot.action(new RegExp(`^crt:resetwarns:${SPEC}$`), async (ctx) => {
    const item = await loadTarget(ctx, 'resetwarns');
    if (!item) return null;
    await resetWarns(item.target.specId);
    if (item.target.tgId) await notifyUser(item.target.tgId, TEXTS.CRT_WARNS_RESET_NOTIFY);
    return show(ctx, TEXTS.CRT_WARNS_RESET, getUserBackKeyboard(item.target.specId));
  });

  bot.action(new RegExp(`^crt:adminunban:${SPEC}$`), async (ctx) => {
    const item = await loadTarget(ctx, 'adminunban', { creatorOnly: true });
    if (!item) return null;
    await liftAdminBan(item.target.specId);
    if (item.target.tgId) await notifyUser(item.target.tgId, TEXTS.CRT_ADMIN_UNBAN_NOTIFY);
    return show(ctx, TEXTS.CRT_ADMIN_UNBAN, getUserBackKeyboard(item.target.specId));
  });

  bot.action(new RegExp(`^crt:delete:${SPEC}$`), async (ctx) => {
    const item = await loadTarget(ctx, 'delete', { creatorOnly: true });
    if (!item) return null;
    const text = fill(TEXTS.CRT_DELETE_CONFIRM, { firstName: displayName(item.target) });
    return show(ctx, text, getDeleteAccountConfirmKeyboard(item.target.specId));
  });

  bot.action(new RegExp(`^crt:delyes:${SPEC}$`), async (ctx) => {
    const item = await loadTarget(ctx, 'delete', { creatorOnly: true });
    if (!item) return null;
    const { tgId } = item.target;
    await deleteAccount(item.target.specId);
    if (tgId) await notifyUser(tgId, TEXTS.CRT_DELETED_NOTIFY, { reply_markup: { remove_keyboard: true } });
    return show(ctx, TEXTS.CRT_DELETED, getUsersSearchKeyboard());
  });

  bot.action('crt:news', async (ctx) => {
    const user = await requireCreator(ctx);
    if (!user) return null;
    const site = getOpenSiteKeyboard('/creator');
    return show(ctx, TEXTS.CRT_NEWS, site.reply_markup ? site : getMenuOnlyKeyboard());
  });
}
