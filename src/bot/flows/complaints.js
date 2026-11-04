import { TEXTS } from '../texts.js';
import {
  getComplaintAdminsKeyboard,
  getComplaintConfirmKeyboard,
  getReportActionsKeyboard,
  getCancelKeyboard,
  getMenuOnlyKeyboard,
} from '../keyboards.js';
import { show, say } from '../ui.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { requireActive } from '../guards.js';
import { notifyCreators } from '../notify.js';
import { getClassAdmins, getUserByTgId } from '../../services/userService.js';
import { getClassKey } from '../../services/homeworkService.js';
import { canFileComplaint, createReport } from '../../services/reportService.js';
import { fill } from '../../utils/normalize.js';

const HOUR_MS = 60 * 60 * 1000;

async function requireComplainant(ctx) {
  const user = await requireActive(ctx);
  if (!user) return null;
  if (!user.school || !user.class) {
    await show(ctx, TEXTS.CMP_ONLY_ACTIVE, getMenuOnlyKeyboard(user));
    return null;
  }
  return user;
}

export async function startComplaint(ctx) {
  const user = await requireComplainant(ctx);
  if (!user) return null;
  const admins = (await getClassAdmins(user.school, user.class)).filter((admin) => admin.tgId && admin.specId !== user.specId);
  if (admins.length === 0) return show(ctx, TEXTS.CMP_NO_ADMINS, getMenuOnlyKeyboard(user));
  await setSession(ctx.from.id, 'telegram', 'cmp:choose', {});
  return show(ctx, TEXTS.CMP_CHOOSE_ADMIN, getComplaintAdminsKeyboard(admins, user));
}

function previewText(user, admin, text) {
  return fill(TEXTS.CMP_PREVIEW, {
    adminName: admin.firstName || 'Без имени',
    adminUsername: admin.username || 'нет',
    class: user.class,
    text,
  });
}

// Текстовый ввод на шагах cmp:* (вызывается из router.js).
export async function handleComplaintText(ctx, session, text) {
  const user = await requireComplainant(ctx);
  if (!user) return null;
  if (session.step !== 'cmp:text' && session.step !== 'cmp:confirm') return startComplaint(ctx);
  const admin = await getUserByTgId(session.data?.adminTgId);
  if (!admin) {
    await clearSession(ctx.from.id, 'telegram');
    return say(ctx, TEXTS.CMP_SESSION_LOST, getMenuOnlyKeyboard(user));
  }
  const value = String(text ?? '').trim();
  if (value.length < 10 || value.length > 1000) {
    return say(ctx, fill(TEXTS.CMP_TEXT_INVALID, { length: value.length }), getCancelKeyboard(user));
  }
  await setSession(ctx.from.id, 'telegram', 'cmp:confirm', { ...session.data, text: value });
  return say(ctx, previewText(user, admin, value), getComplaintConfirmKeyboard(user));
}

export function complaintsFlow(bot) {
  bot.action('cmp:start', async (ctx) => startComplaint(ctx));
  bot.command('complaint', async (ctx) => startComplaint(ctx));

  bot.action(/^cmp:admin:(\d{1,20})$/, async (ctx) => {
    const user = await requireComplainant(ctx);
    if (!user) return null;
    const admin = await getUserByTgId(Number(ctx.match[1]));
    // Админ мог быть понижен или сменить класс после показа списка.
    const sameClass = admin && admin.role === 'admin' && getClassKey(admin.school, admin.class).toLowerCase() === getClassKey(user.school, user.class).toLowerCase();
    if (!sameClass) return startComplaint(ctx);
    const { allowed, nextAttemptAt } = await canFileComplaint(user.specId, admin.specId);
    if (!allowed) {
      await clearSession(ctx.from.id, 'telegram');
      const hours = Math.max(1, Math.ceil((nextAttemptAt.getTime() - Date.now()) / HOUR_MS));
      return show(ctx, fill(TEXTS.CMP_TOO_FREQUENT, { hours }), getMenuOnlyKeyboard(user));
    }
    await setSession(ctx.from.id, 'telegram', 'cmp:text', { adminTgId: admin.tgId, adminSpecId: admin.specId });
    return show(ctx, TEXTS.CMP_ENTER_TEXT, getCancelKeyboard(user));
  });

  bot.action('cmp:send', async (ctx) => {
    const user = await requireComplainant(ctx);
    if (!user) return null;
    const session = await getSession(ctx.from.id, 'telegram');
    if (session?.step !== 'cmp:confirm' || !session.data?.adminSpecId || !session.data?.text) {
      await clearSession(ctx.from.id, 'telegram');
      return show(ctx, TEXTS.CMP_SESSION_LOST, getMenuOnlyKeyboard(user));
    }
    const admin = await getUserByTgId(session.data.adminTgId);
    if (!admin) {
      await clearSession(ctx.from.id, 'telegram');
      return show(ctx, TEXTS.CMP_SESSION_LOST, getMenuOnlyKeyboard(user));
    }
    const classKey = getClassKey(user.school, user.class);
    let report;
    try {
      report = await createReport(user.specId, admin.specId, classKey, session.data.text);
    } catch (err) {
      await clearSession(ctx.from.id, 'telegram');
      if (err?.code === 'too_frequent') return show(ctx, fill(TEXTS.CMP_TOO_FREQUENT, { hours: 24 }), getMenuOnlyKeyboard(user));
      if (err?.code === 'invalid_text') {
        return show(ctx, fill(TEXTS.CMP_TEXT_INVALID, { length: session.data.text.length }), getMenuOnlyKeyboard(user));
      }
      throw err;
    }
    await clearSession(ctx.from.id, 'telegram');
    await show(ctx, TEXTS.CMP_SENT, getMenuOnlyKeyboard(user));
    const notice = fill(TEXTS.CMP_NOTIFY, {
      reportId: String(report._id),
      fromName: user.firstName || 'Без имени',
      fromUsername: user.username || 'нет',
      adminName: admin.firstName || 'Без имени',
      adminUsername: admin.username || 'нет',
      classKey,
      text: report.text,
    });
    await notifyCreators(notice, getReportActionsKeyboard(String(report._id), null));
    return null;
  });
}
