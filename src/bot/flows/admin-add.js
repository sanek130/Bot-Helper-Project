import { TEXTS } from '../texts.js';
import {
  getQuickSubjectsKeyboard,
  getBackCancelKeyboard,
  getAddTaskKeyboard,
  getAddDoneKeyboard,
  getMenuOnlyKeyboard,
} from '../keyboards.js';
import { show, say } from '../ui.js';
import { getSession, setSession, patchSession, clearSession } from '../sessions.js';
import { requireAdminClass } from './admin-panel.js';
import { showCalendar } from './homework.js';
import { addHomework, ENTRY_LIMIT } from '../../services/homeworkService.js';
import { touchUserActivity } from '../../services/statsService.js';
import { formatDateHuman, isDateKey } from '../../utils/dateService.js';
import { fill, truncate, sanitizeSubjectName } from '../../utils/normalize.js';
import { capitalize, getSubjectByHash, getSubjectHash } from '../../utils/subjects.js';

async function startAdd(ctx) {
  const access = await requireAdminClass(ctx, TEXTS.ADD_NO_RIGHTS);
  if (!access) return null;
  await setSession(ctx.from.id, 'telegram', 'add:calendar', { mode: 'add' });
  return showCalendar(ctx, 'add', 0);
}

async function showSubjectChoice(ctx, dateKey, { forceNew = false } = {}) {
  const text = fill(TEXTS.ADD_CHOOSE_SUBJECT, { dateHuman: formatDateHuman(dateKey) });
  return (forceNew ? say : show)(ctx, text, getQuickSubjectsKeyboard('add_subj', 'adm:add'));
}

async function showTaskPrompt(ctx, session, { forceNew = false, more = false } = {}) {
  const { dateKey, subjectHash, subjectName } = session.data;
  await setSession(ctx.from.id, 'telegram', 'add:task', { ...session.data, mode: 'add' });
  const prompt = fill(TEXTS.ADD_TASK_PROMPT, { subject: capitalize(subjectName), dateHuman: formatDateHuman(dateKey) });
  const text = more ? `${TEXTS.ADD_MORE_SAME}\n\n${prompt}` : prompt;
  return (forceNew ? say : show)(ctx, text, getAddTaskKeyboard(subjectHash));
}

async function loadAddSession(ctx, allowedSteps) {
  const session = await getSession(ctx.from.id, 'telegram');
  if (!session || !allowedSteps.includes(session.step) || !isDateKey(session.data?.dateKey)) {
    await clearSession(ctx.from.id, 'telegram');
    await show(ctx, TEXTS.ADD_SESSION_LOST, getMenuOnlyKeyboard());
    return null;
  }
  return session;
}

async function saveTask(ctx, session, text, photoIds) {
  const access = await requireAdminClass(ctx, TEXTS.ADD_NO_RIGHTS);
  if (!access) return null;
  if (text.length > ENTRY_LIMIT) return say(ctx, TEXTS.ADD_TOO_LONG, getAddTaskKeyboard(session.data.subjectHash));
  const { dateKey, subjectName } = session.data;
  const result = await addHomework(access.classKey, dateKey, subjectName, text, photoIds, ctx.from.id);
  await touchUserActivity(ctx.from.id, { incrementAdded: true });
  await patchSession(ctx.from.id, 'telegram', { subjectHash: result.subjectHash });
  const lines = [fill(TEXTS.ADD_DONE, { subject: capitalize(subjectName), dateHuman: formatDateHuman(dateKey) })];
  if (text) lines.push(fill(TEXTS.ADD_DONE_TEXT, { text: truncate(text, 100) }));
  if (photoIds.length > 0) lines.push(fill(TEXTS.ADD_DONE_PHOTOS, { count: result.photoIds.length }));
  return say(ctx, lines.join('\n'), getAddDoneKeyboard(dateKey));
}

// Текстовый ввод на шагах add:* (вызывается из router.js).
export async function handleAddText(ctx, session, text) {
  if (session.step === 'add:calendar') return showCalendar(ctx, 'add', session.data?.calOffset || 0);
  if (session.step === 'add:subject') return showSubjectChoice(ctx, session.data.dateKey, { forceNew: true });
  if (session.step === 'add:subject_text') {
    let subjectName;
    try {
      subjectName = sanitizeSubjectName(text);
    } catch {
      return say(ctx, TEXTS.ADD_SUBJECT_INVALID, getBackCancelKeyboard(`add_day:${session.data.dateKey}`));
    }
    const subjectHash = getSubjectHash(subjectName);
    return showTaskPrompt(ctx, { ...session, data: { ...session.data, subjectHash, subjectName } }, { forceNew: true });
  }
  if (session.step === 'add:task') {
    if (!isDateKey(session.data?.dateKey) || !session.data?.subjectName) {
      await clearSession(ctx.from.id, 'telegram');
      return say(ctx, TEXTS.ADD_SESSION_LOST, getMenuOnlyKeyboard());
    }
    return saveTask(ctx, session, String(text ?? '').trim(), []);
  }
  await clearSession(ctx.from.id, 'telegram');
  return say(ctx, TEXTS.ADD_SESSION_LOST, getMenuOnlyKeyboard());
}

// Фото на шаге add:task: берётся самый большой размер, подпись становится текстом задания.
export async function handleAddPhoto(ctx, session) {
  if (session.step !== 'add:task' || !isDateKey(session.data?.dateKey) || !session.data?.subjectName) {
    return say(ctx, TEXTS.PHOTO_NOT_EXPECTED);
  }
  const photos = ctx.message.photo || [];
  const fileId = photos[photos.length - 1]?.file_id;
  if (!fileId) return say(ctx, TEXTS.PHOTO_NOT_EXPECTED);
  return saveTask(ctx, session, String(ctx.message.caption ?? '').trim(), [fileId]);
}

export function adminAddFlow(bot) {
  bot.action('adm:add', async (ctx) => startAdd(ctx));

  // add_day приходит и из календаря, и из карточки пустого дня — во втором случае сессии ещё нет.
  bot.action(/^add_day:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    const access = await requireAdminClass(ctx, TEXTS.ADD_NO_RIGHTS);
    if (!access) return null;
    const dateKey = ctx.match[1];
    await setSession(ctx.from.id, 'telegram', 'add:subject', { mode: 'add', dateKey });
    return showSubjectChoice(ctx, dateKey);
  });

  bot.action('add_subj:other', async (ctx) => {
    const access = await requireAdminClass(ctx, TEXTS.ADD_NO_RIGHTS);
    if (!access) return null;
    const session = await loadAddSession(ctx, ['add:subject', 'add:subject_text', 'add:task']);
    if (!session) return null;
    await setSession(ctx.from.id, 'telegram', 'add:subject_text', { mode: 'add', dateKey: session.data.dateKey });
    return show(ctx, TEXTS.ADD_SUBJECT_TEXT, getBackCancelKeyboard(`add_day:${session.data.dateKey}`));
  });

  bot.action(/^add_subj:([0-9a-f]{8})$/, async (ctx) => {
    const access = await requireAdminClass(ctx, TEXTS.ADD_NO_RIGHTS);
    if (!access) return null;
    const session = await loadAddSession(ctx, ['add:subject', 'add:subject_text', 'add:task']);
    if (!session) return null;
    const subjectHash = ctx.match[1];
    // Произвольный предмет мог выпасть из кэша хэшей после перезапуска — тогда берётся имя из сессии.
    const subjectName = getSubjectByHash(subjectHash) || (session.data.subjectHash === subjectHash ? session.data.subjectName : null);
    if (!subjectName) return showSubjectChoice(ctx, session.data.dateKey);
    return showTaskPrompt(ctx, { ...session, data: { ...session.data, subjectHash, subjectName } });
  });

  bot.action('add:more_same', async (ctx) => {
    const access = await requireAdminClass(ctx, TEXTS.ADD_NO_RIGHTS);
    if (!access) return null;
    const session = await loadAddSession(ctx, ['add:task']);
    if (!session || !session.data.subjectName) return null;
    return showTaskPrompt(ctx, session, { more: true });
  });
}
