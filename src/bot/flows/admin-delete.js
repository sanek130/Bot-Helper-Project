import { TEXTS } from '../texts.js';
import {
  getSubjectPickKeyboard,
  getBackMenuKeyboard,
  getDeleteConfirmKeyboard,
  getEditNextKeyboard,
  getMenuOnlyKeyboard,
} from '../keyboards.js';
import { show } from '../ui.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { requireAdminClass } from './admin-panel.js';
import { showCalendar } from './homework.js';
import { getSubjectsForDate, getDayHomework, taskSubjectName, removeSubject } from '../../services/homeworkService.js';
import { formatDateHuman, isDateKey } from '../../utils/dateService.js';
import { fill } from '../../utils/normalize.js';
import { capitalize } from '../../utils/subjects.js';

async function startDelete(ctx) {
  const access = await requireAdminClass(ctx);
  if (!access) return null;
  await setSession(ctx.from.id, 'telegram', 'del:calendar', { mode: 'del' });
  return showCalendar(ctx, 'del', 0);
}

export async function showDeleteSubjects(ctx, dateKey) {
  const access = await requireAdminClass(ctx);
  if (!access) return null;
  const subjects = await getSubjectsForDate(access.classKey, dateKey);
  if (subjects.length === 0) return show(ctx, TEXTS.EDIT_DAY_EMPTY, getBackMenuKeyboard('adm:del'));
  await setSession(ctx.from.id, 'telegram', 'del:subject', { mode: 'del', dateKey });
  const text = fill(TEXTS.DEL_CHOOSE_SUBJECT, { dateHuman: formatDateHuman(dateKey) });
  return show(ctx, text, getSubjectPickKeyboard('del_subj', subjects, 'adm:del'));
}

async function loadDeleteDate(ctx) {
  const session = await getSession(ctx.from.id, 'telegram');
  const dateKey = session?.data?.dateKey;
  if (!session?.step?.startsWith('del:') || !isDateKey(dateKey)) {
    await clearSession(ctx.from.id, 'telegram');
    await show(ctx, TEXTS.ADD_SESSION_LOST, getMenuOnlyKeyboard());
    return null;
  }
  return dateKey;
}

// Текст на шагах del:* не ожидается — показывается текущий шаг заново.
export async function handleDeleteText(ctx, session) {
  if (isDateKey(session.data?.dateKey)) return showDeleteSubjects(ctx, session.data.dateKey);
  return showCalendar(ctx, 'del', session.data?.calOffset || 0);
}

export function adminDeleteFlow(bot) {
  bot.action('adm:del', async (ctx) => startDelete(ctx));

  bot.action(/^del_day:(\d{4}-\d{2}-\d{2})$/, async (ctx) => showDeleteSubjects(ctx, ctx.match[1]));

  bot.action(/^del_subj:([0-9a-f]{8})$/, async (ctx) => {
    const access = await requireAdminClass(ctx);
    if (!access) return null;
    const dateKey = await loadDeleteDate(ctx);
    if (!dateKey) return null;
    const subjectHash = ctx.match[1];
    const { subjects } = await getDayHomework(access.classKey, dateKey);
    if (!subjects[subjectHash]) return show(ctx, TEXTS.EDIT_TASK_GONE, getBackMenuKeyboard(`del_day:${dateKey}`));
    await setSession(ctx.from.id, 'telegram', 'del:confirm', { mode: 'del', dateKey, subjectHash });
    const text = fill(TEXTS.DEL_CONFIRM, {
      dateHuman: formatDateHuman(dateKey),
      subject: capitalize(taskSubjectName(subjectHash, subjects[subjectHash])),
    });
    return show(ctx, text, getDeleteConfirmKeyboard(dateKey, subjectHash));
  });

  bot.action(/^del:confirm:([0-9a-f]{8})$/, async (ctx) => {
    const access = await requireAdminClass(ctx);
    if (!access) return null;
    const dateKey = await loadDeleteDate(ctx);
    if (!dateKey) return null;
    const result = await removeSubject(access.classKey, dateKey, ctx.match[1]);
    await clearSession(ctx.from.id, 'telegram');
    if (!result.success) return show(ctx, TEXTS.EDIT_TASK_GONE, getEditNextKeyboard('Удалить ещё', 'adm:del'));
    return show(ctx, TEXTS.EDIT_REMOVED, getEditNextKeyboard('Удалить ещё', 'adm:del'));
  });
}
