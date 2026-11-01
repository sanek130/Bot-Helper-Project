import { TEXTS } from '../texts.js';
import {
  getSubjectPickKeyboard,
  getBackMenuKeyboard,
  getEditCardKeyboard,
  getConfirmKeyboard,
  getMoveConfirmKeyboard,
  getQuickSubjectsKeyboard,
  getChangeSubjectConfirmKeyboard,
  getEditNextKeyboard,
  getBackCancelKeyboard,
  getMenuOnlyKeyboard,
} from '../keyboards.js';
import { show, say } from '../ui.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { requireAdminClass } from './admin-panel.js';
import { showCalendar } from './homework.js';
import {
  getDayHomework,
  getSubjectsForDate,
  taskSubjectName,
  removePhotos,
  removeSubject,
  moveSubject,
  changeSubject,
  replaceText,
  addPhotoToTask,
  ENTRY_LIMIT,
} from '../../services/homeworkService.js';
import { formatDateHuman, isDateKey } from '../../utils/dateService.js';
import { fill, truncate, sanitizeSubjectName } from '../../utils/normalize.js';
import { capitalize, getSubjectByHash, getSubjectHash } from '../../utils/subjects.js';

const DATE = '(\\d{4}-\\d{2}-\\d{2})';
const HASH = '([0-9a-f]{8})';

async function startEdit(ctx) {
  const access = await requireAdminClass(ctx);
  if (!access) return null;
  await setSession(ctx.from.id, 'telegram', 'edit:calendar', { mode: 'edit' });
  return showCalendar(ctx, 'edit', 0);
}

export async function showEditSubjects(ctx, dateKey, { forceNew = false } = {}) {
  const access = await requireAdminClass(ctx);
  if (!access) return null;
  const output = forceNew ? say : show;
  const subjects = await getSubjectsForDate(access.classKey, dateKey);
  if (subjects.length === 0) return output(ctx, TEXTS.EDIT_DAY_EMPTY, getBackMenuKeyboard('adm:edit'));
  await setSession(ctx.from.id, 'telegram', 'edit:subject', { mode: 'edit', dateKey });
  const text = fill(TEXTS.EDIT_CHOOSE_SUBJECT, { dateHuman: formatDateHuman(dateKey) });
  return output(ctx, text, getSubjectPickKeyboard('edit_subj', subjects, 'adm:edit'));
}

// Сессия редактирования: дата и предмет. Если задания уже нет (удалено другим админом),
// показывается «Это задание было удалено.» вместо ошибки.
async function loadEditTask(ctx, { requireSubject = true } = {}) {
  const access = await requireAdminClass(ctx);
  if (!access) return null;
  const session = await getSession(ctx.from.id, 'telegram');
  const dateKey = session?.data?.dateKey;
  const subjectHash = session?.data?.subjectHash;
  if (!session || !session.step?.startsWith('edit:') || !isDateKey(dateKey) || (requireSubject && !subjectHash)) {
    await clearSession(ctx.from.id, 'telegram');
    await show(ctx, TEXTS.ADD_SESSION_LOST, getMenuOnlyKeyboard());
    return null;
  }
  const { subjects } = await getDayHomework(access.classKey, dateKey);
  const task = subjectHash ? subjects[subjectHash] : null;
  if (requireSubject && !task) {
    await clearSession(ctx.from.id, 'telegram');
    await show(ctx, TEXTS.EDIT_TASK_GONE, getMenuOnlyKeyboard());
    return null;
  }
  return {
    ...access,
    session,
    dateKey,
    subjectHash,
    task,
    subjectName: task ? taskSubjectName(subjectHash, task) : '',
  };
}

export async function showEditCard(ctx, dateKey, subjectHash, { forceNew = false } = {}) {
  const access = await requireAdminClass(ctx);
  if (!access) return null;
  const output = forceNew ? say : show;
  const { subjects } = await getDayHomework(access.classKey, dateKey);
  const task = subjects[subjectHash];
  if (!task) {
    await clearSession(ctx.from.id, 'telegram');
    return output(ctx, TEXTS.EDIT_TASK_GONE, getMenuOnlyKeyboard());
  }
  await setSession(ctx.from.id, 'telegram', 'edit:card', { mode: 'edit', dateKey, subjectHash });
  const photos = Array.isArray(task.photoIds) ? task.photoIds : [];
  const lines = [
    fill(TEXTS.EDIT_CARD, {
      subject: capitalize(taskSubjectName(subjectHash, task)),
      dateHuman: formatDateHuman(dateKey),
      text: truncate(task.text || TEXTS.EDIT_NO_TEXT, 3500),
    }),
  ];
  if (photos.length > 0) lines.push(fill(TEXTS.EDIT_CARD_PHOTOS, { count: photos.length }));
  lines.push('', TEXTS.EDIT_CARD_FOOTER);
  return output(ctx, lines.join('\n'), getEditCardKeyboard(subjectHash, dateKey));
}

async function showChangeConfirm(ctx, item, newSubjectHash, newSubjectName, { forceNew = false } = {}) {
  const output = forceNew ? say : show;
  if (newSubjectHash === item.subjectHash) {
    return output(ctx, TEXTS.EDIT_CHANGE_SAME, getQuickSubjectsKeyboard('edit_new_subj', `edit_subj:${item.subjectHash}`));
  }
  await setSession(ctx.from.id, 'telegram', 'edit:change_subject', {
    ...item.session.data,
    mode: 'change_subject',
    oldSubjectHash: item.subjectHash,
    newSubjectHash,
    newSubjectName,
  });
  const { subjects } = await getDayHomework(item.classKey, item.dateKey);
  const lines = [
    fill(TEXTS.EDIT_CHANGE_CONFIRM, {
      oldSubject: capitalize(item.subjectName),
      newSubject: capitalize(newSubjectName),
      dateHuman: formatDateHuman(item.dateKey),
    }),
  ];
  if (subjects[newSubjectHash]) lines.push(TEXTS.EDIT_MERGE_WARNING);
  return output(ctx, lines.join('\n'), getChangeSubjectConfirmKeyboard(item.subjectHash, newSubjectHash));
}

// Текстовый ввод на шагах edit:* (вызывается из router.js).
export async function handleEditText(ctx, session, text) {
  if (session.step === 'edit:text') {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    const value = String(text ?? '').trim();
    if (value.length > ENTRY_LIMIT) return say(ctx, TEXTS.ADD_TOO_LONG, getBackCancelKeyboard(`edit_subj:${item.subjectHash}`));
    await replaceText(item.classKey, item.dateKey, item.subjectHash, value);
    await setSession(ctx.from.id, 'telegram', 'edit:card', { mode: 'edit', dateKey: item.dateKey, subjectHash: item.subjectHash });
    return say(ctx, TEXTS.EDIT_TEXT_UPDATED, getBackMenuKeyboard(`edit_subj:${item.subjectHash}`, 'Назад к ДЗ'));
  }
  if (session.step === 'edit:change_subject_text') {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    let newSubjectName;
    try {
      newSubjectName = sanitizeSubjectName(text);
    } catch {
      return say(ctx, TEXTS.ADD_SUBJECT_INVALID, getBackCancelKeyboard(`edit_subj:${item.subjectHash}`));
    }
    return showChangeConfirm(ctx, item, getSubjectHash(newSubjectName), newSubjectName, { forceNew: true });
  }
  if (session.step === 'edit:subject' && isDateKey(session.data?.dateKey)) {
    return showEditSubjects(ctx, session.data.dateKey, { forceNew: true });
  }
  if (session.step === 'edit:card' && isDateKey(session.data?.dateKey) && session.data?.subjectHash) {
    return showEditCard(ctx, session.data.dateKey, session.data.subjectHash, { forceNew: true });
  }
  if (session.step === 'edit:calendar' || session.step === 'edit:move_calendar') {
    return showCalendar(ctx, session.data?.calMode || 'edit', session.data?.calOffset || 0);
  }
  await clearSession(ctx.from.id, 'telegram');
  return say(ctx, TEXTS.ADD_SESSION_LOST, getMenuOnlyKeyboard());
}

// Фото на шаге edit:text добавляется к заданию (лимит 10, без дублей).
export async function handleEditPhoto(ctx, session) {
  if (session.step !== 'edit:text') return say(ctx, TEXTS.PHOTO_NOT_EXPECTED);
  const item = await loadEditTask(ctx);
  if (!item) return null;
  const photos = ctx.message.photo || [];
  const fileId = photos[photos.length - 1]?.file_id;
  if (!fileId) return say(ctx, TEXTS.PHOTO_NOT_EXPECTED);
  const back = getBackMenuKeyboard(`edit_subj:${item.subjectHash}`, 'Назад к ДЗ');
  const result = await addPhotoToTask(item.classKey, item.dateKey, item.subjectHash, fileId);
  if (!result.success && result.reason === 'limit') return say(ctx, TEXTS.EDIT_PHOTO_LIMIT, back);
  if (!result.success && result.reason === 'duplicate') return say(ctx, TEXTS.EDIT_PHOTO_DUPLICATE, back);
  const caption = String(ctx.message.caption ?? '').trim();
  if (caption && caption.length <= ENTRY_LIMIT) await replaceText(item.classKey, item.dateKey, item.subjectHash, caption);
  return say(ctx, caption ? `${TEXTS.EDIT_PHOTO_ADDED}\n${TEXTS.EDIT_TEXT_UPDATED}` : TEXTS.EDIT_PHOTO_ADDED, back);
}

export function adminEditFlow(bot) {
  bot.action('adm:edit', async (ctx) => startEdit(ctx));

  // Из карточки дня день уже известен, поэтому календарь пропускается.
  bot.action(new RegExp(`^edit:day:${DATE}$`), async (ctx) => showEditSubjects(ctx, ctx.match[1]));
  bot.action(new RegExp(`^edit_day:${DATE}$`), async (ctx) => showEditSubjects(ctx, ctx.match[1]));

  bot.action(new RegExp(`^edit_subj:${HASH}$`), async (ctx) => {
    const access = await requireAdminClass(ctx);
    if (!access) return null;
    const session = await getSession(ctx.from.id, 'telegram');
    const dateKey = session?.data?.dateKey || session?.data?.fromDateKey;
    if (!isDateKey(dateKey)) {
      await clearSession(ctx.from.id, 'telegram');
      return show(ctx, TEXTS.ADD_SESSION_LOST, getMenuOnlyKeyboard());
    }
    return showEditCard(ctx, dateKey, ctx.match[1]);
  });

  bot.action('edit:rmphotos', async (ctx) => {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    const count = Array.isArray(item.task.photoIds) ? item.task.photoIds.length : 0;
    if (count === 0) return show(ctx, TEXTS.EDIT_NO_PHOTOS, getBackMenuKeyboard(`edit_subj:${item.subjectHash}`));
    const text = fill(TEXTS.EDIT_RM_PHOTOS_CONFIRM, {
      subject: capitalize(item.subjectName),
      dateHuman: formatDateHuman(item.dateKey),
      count,
    });
    return show(ctx, text, getConfirmKeyboard(`edit_subj:${item.subjectHash}`, 'edit:rmphotos_yes'));
  });

  bot.action('edit:rmphotos_yes', async (ctx) => {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    await removePhotos(item.classKey, item.dateKey, item.subjectHash);
    return show(ctx, TEXTS.EDIT_PHOTOS_REMOVED, getBackMenuKeyboard(`edit_subj:${item.subjectHash}`, 'Назад к ДЗ'));
  });

  bot.action('edit:rmfull', async (ctx) => {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    const text = fill(TEXTS.EDIT_RM_FULL_CONFIRM, { subject: capitalize(item.subjectName), dateHuman: formatDateHuman(item.dateKey) });
    return show(ctx, text, getConfirmKeyboard(`edit_subj:${item.subjectHash}`, 'edit:rmfull_yes'));
  });

  bot.action('edit:rmfull_yes', async (ctx) => {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    await removeSubject(item.classKey, item.dateKey, item.subjectHash);
    await clearSession(ctx.from.id, 'telegram');
    return show(ctx, TEXTS.EDIT_REMOVED, getEditNextKeyboard('Удалить ещё', 'adm:del'));
  });

  bot.action('edit:move', async (ctx) => {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    await setSession(ctx.from.id, 'telegram', 'edit:move_calendar', {
      mode: 'move',
      dateKey: item.dateKey,
      subjectHash: item.subjectHash,
      fromSubjectHash: item.subjectHash,
      fromDateKey: item.dateKey,
    });
    return showCalendar(ctx, 'move', 0);
  });

  bot.action(new RegExp(`^move_day:${DATE}$`), async (ctx) => {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    const toDateKey = ctx.match[1];
    if (toDateKey === item.dateKey) return show(ctx, TEXTS.EDIT_MOVE_SAME_DAY, getBackMenuKeyboard(`edit_subj:${item.subjectHash}`));
    const lines = [fill(TEXTS.EDIT_MOVE_CONFIRM, { dateHuman: formatDateHuman(toDateKey), subject: capitalize(item.subjectName) })];
    const target = await getDayHomework(item.classKey, toDateKey);
    if (target.subjects[item.subjectHash]) lines.push(TEXTS.EDIT_MERGE_WARNING);
    return show(ctx, lines.join('\n'), getMoveConfirmKeyboard(item.dateKey, toDateKey, item.subjectHash));
  });

  bot.action(new RegExp(`^edit:moveyes:${DATE}:${DATE}:${HASH}$`), async (ctx) => {
    const access = await requireAdminClass(ctx);
    if (!access) return null;
    const [, fromDateKey, toDateKey, subjectHash] = ctx.match;
    if (fromDateKey === toDateKey) return show(ctx, TEXTS.EDIT_MOVE_SAME_DAY, getMenuOnlyKeyboard());
    try {
      await moveSubject(access.classKey, fromDateKey, toDateKey, subjectHash);
    } catch (err) {
      if (err?.code === 'subject_not_found') return show(ctx, TEXTS.EDIT_TASK_GONE, getMenuOnlyKeyboard());
      throw err;
    }
    await clearSession(ctx.from.id, 'telegram');
    return show(ctx, TEXTS.EDIT_MOVED, getEditNextKeyboard('Изменить ещё', 'adm:edit'));
  });

  bot.action('edit:change_subj', async (ctx) => {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    await setSession(ctx.from.id, 'telegram', 'edit:change_subject', {
      mode: 'change_subject',
      dateKey: item.dateKey,
      subjectHash: item.subjectHash,
      oldSubjectHash: item.subjectHash,
    });
    const text = fill(TEXTS.EDIT_CHANGE_SUBJECT, { subject: capitalize(item.subjectName), dateHuman: formatDateHuman(item.dateKey) });
    return show(ctx, text, getQuickSubjectsKeyboard('edit_new_subj', `edit_subj:${item.subjectHash}`));
  });

  bot.action('edit_new_subj:other', async (ctx) => {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    await setSession(ctx.from.id, 'telegram', 'edit:change_subject_text', { ...item.session.data, mode: 'change_subject' });
    return show(ctx, TEXTS.ADD_SUBJECT_TEXT, getBackCancelKeyboard(`edit_subj:${item.subjectHash}`));
  });

  bot.action(new RegExp(`^edit_new_subj:${HASH}$`), async (ctx) => {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    const newSubjectHash = ctx.match[1];
    const newSubjectName = getSubjectByHash(newSubjectHash);
    if (!newSubjectName) return show(ctx, TEXTS.STALE_MENU, getMenuOnlyKeyboard());
    return showChangeConfirm(ctx, item, newSubjectHash, newSubjectName);
  });

  bot.action(new RegExp(`^edit:change_subj_yes:${HASH}:${HASH}$`), async (ctx) => {
    const access = await requireAdminClass(ctx);
    if (!access) return null;
    const [, oldSubjectHash, newSubjectHash] = ctx.match;
    const session = await getSession(ctx.from.id, 'telegram');
    const dateKey = session?.data?.dateKey;
    if (!isDateKey(dateKey) || session?.data?.oldSubjectHash !== oldSubjectHash) {
      await clearSession(ctx.from.id, 'telegram');
      return show(ctx, TEXTS.ADD_SESSION_LOST, getMenuOnlyKeyboard());
    }
    const newSubjectName = session.data.newSubjectHash === newSubjectHash ? session.data.newSubjectName : getSubjectByHash(newSubjectHash);
    try {
      await changeSubject(access.classKey, dateKey, oldSubjectHash, newSubjectHash, newSubjectName);
    } catch (err) {
      if (err?.code === 'subject_not_found') return show(ctx, TEXTS.EDIT_TASK_GONE, getMenuOnlyKeyboard());
      if (err?.code === 'same_subject') return show(ctx, TEXTS.EDIT_CHANGE_SAME, getMenuOnlyKeyboard());
      if (err?.code === 'unknown_subject') return show(ctx, TEXTS.STALE_MENU, getMenuOnlyKeyboard());
      throw err;
    }
    await clearSession(ctx.from.id, 'telegram');
    return show(ctx, TEXTS.EDIT_SUBJECT_CHANGED, getEditNextKeyboard('Изменить ещё', 'adm:edit'));
  });

  bot.action('edit:new_text', async (ctx) => {
    const item = await loadEditTask(ctx);
    if (!item) return null;
    await setSession(ctx.from.id, 'telegram', 'edit:text', { mode: 'edit', dateKey: item.dateKey, subjectHash: item.subjectHash });
    const lines = [fill(TEXTS.EDIT_NEW_TEXT, { text: truncate(item.task.text || TEXTS.EDIT_NO_TEXT, 3500) })];
    if (Array.isArray(item.task.photoIds) && item.task.photoIds.length > 0) lines.push(TEXTS.EDIT_NEW_TEXT_PHOTOS);
    return show(ctx, lines.join('\n'), getBackCancelKeyboard(`edit_subj:${item.subjectHash}`));
  });
}
