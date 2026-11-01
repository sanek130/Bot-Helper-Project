import { TEXTS } from '../bot/texts.js';
import { fill } from '../utils/normalize.js';
import { notifyUser, notifyOnlyCreators } from '../bot/notify.js';
import { getEscalateThreeKeyboard, getReportActionsKeyboard } from '../bot/keyboards.js';
import { canModerate } from '../bot/guards.js';
import { isCreator } from '../bot/roles.js';
import { getUserBySpecId, applyWarn, demoteToUser } from '../services/userService.js';
import { getReportById, resolveReport, escalateReport } from '../services/reportService.js';
import { removeHomeworkByAdmin } from '../services/homeworkService.js';
import { displayName, displayUsername } from './helpers.js';

function fail(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

// Логика варна совпадает с ботом: третий варн от создателя сразу снимает ДЗ админа,
// а третий варн от модератора уходит создателям на окончательное решение.
export async function warnUser(actor, target) {
  const warned = await applyWarn(target.specId);
  const warns = warned?.warns || 0;
  if (target.tgId) await notifyUser(target.tgId, fill(TEXTS.REP_WARN_ADMIN, { warns }));
  if (warns < 3) return { ok: true, warns, adminBanned: Boolean(warned?.adminBanned) };
  if (isCreator(actor)) {
    const { removedCount } = target.tgId ? await removeHomeworkByAdmin(target.tgId) : { removedCount: 0 };
    return { ok: true, warns, adminBanned: true, removedCount };
  }
  const notice = fill(TEXTS.REP_ESCALATE_THREE_NOTIFY, {
    adminName: displayName(target),
    adminUsername: displayUsername(target),
    moderatorName: displayName(actor),
  });
  await notifyOnlyCreators(notice, getEscalateThreeKeyboard(target.specId));
  return { ok: true, escalated: true, warns, adminBanned: true };
}

async function notifyReporter(report, text) {
  const reporter = await getUserBySpecId(report.fromUserId);
  if (reporter?.tgId) await notifyUser(reporter.tgId, text);
}

export async function resolveReportAction(actor, reportId, action) {
  if (!['warn', 'reject', 'demote', 'escalate'].includes(action)) throw fail('invalid_action');
  if (action === 'escalate') {
    if (isCreator(actor)) throw fail('escalate_only_moderator');
    const report = await escalateReport(reportId);
    if (!report) throw fail('report_closed', 404);
    const notice = fill(TEXTS.REP_ESCALATED_NOTIFY, { moderatorName: displayName(actor), reportId: String(report._id) });
    await notifyOnlyCreators(notice, getReportActionsKeyboard(String(report._id), { role: 'creator' }));
    return { ok: true, escalated: true };
  }
  const report = await getReportById(reportId);
  if (!report || report.status !== 'open') throw fail('report_closed', 404);
  const onAdmin = await getUserBySpecId(report.onAdminId);
  if (action !== 'reject') {
    if (!onAdmin) throw fail('admin_not_found', 404);
    if (!canModerate(actor, onAdmin, action)) throw fail('forbidden', 403);
  }
  // Жалоба закрывается до действия: условие status: 'open' в resolveReport не даст выполнить его дважды.
  const resolved = await resolveReport(String(report._id), actor.specId, action === 'reject' ? 'rejected' : 'resolved');
  if (!resolved) throw fail('report_closed', 404);
  if (action === 'reject') {
    await notifyReporter(report, TEXTS.REP_REJECTED_REPORTER);
    return { ok: true };
  }
  if (action === 'demote') {
    await demoteToUser(onAdmin.specId);
    if (onAdmin.tgId) await notifyUser(onAdmin.tgId, TEXTS.REP_DEMOTED_ADMIN);
    await notifyReporter(report, TEXTS.REP_DEMOTED_REPORTER);
    return { ok: true };
  }
  const result = await warnUser(actor, onAdmin);
  await notifyReporter(report, TEXTS.REP_WARN_REPORTER);
  return result;
}
