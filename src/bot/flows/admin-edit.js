import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import {
  editSubjectKeyboard,
  editActionsKeyboard,
  rowConfirmKeyboard,
  moveConfirmKeyboard,
  newSubjectKeyboard,
  afterEditKeyboard,
  backCancelKeyboard,
} from '../keyboards.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { getUserByTgId } from '../../services/userService.js';
import {
  getClassKey,
  getDayData,
  collectPhotoIds,
  removePhotos,
  removeSubject,
  moveSubject,
  changeSubject,
  replaceText,
  addPhotoToTask,
  touchUserActivity,
} from '../../services/homeworkService.js';
import { formatDateHuman, toDateKey } from '../../services/dateService.js';
import { QUICK_SUBJECTS, subjectKey, findSubjectByKey, getSubjectIcon } from '../../utils/subjects.js';
import { escapeHtml, truncate } from '../../utils/normalize.js';
import { showCalendar } from './homework.js';

function isAdmin(user) {
  return user?.role === 'admin' || user?.role === 'creator';
}

async function requireAdmin(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered);
    return null;
  }
  if (!isAdmin(user)) {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return null;
  }
  return user;
}

async function resolveSubject(ctx, dateKey, key) {
  const user = await requireAdmin(ctx);
  if (!user) return null;
  const dayData = await getDayData(getClassKey(user), dateKey);
  const subject = Object.keys(dayData).find((item) => subjectKey(item) === key);
  return subject ? { user, subject, dayData } : { user, subject: null, dayData };
}

async function renderActions(ctx, dateKey, subject) {
  const user = await requireAdmin(ctx);
  if (!user) return;

  const dayData = await getDayData(getClassKey(user), dateKey);
  const task = dayData[subject];

  if (!task) {
    await ctx.reply(TEXTS.errors.staleMenu);
    await showCalendar(ctx, 'edit', 0);
    return;
  }

  const key = subjectKey(subject);
  const photos = collectPhotoIds(task).length;
  const text = TEXTS.edit.current
    .replace('{subject}', escapeHtml(subject))
    .replace('{date}', formatDateHuman(dateKey))
    .replace('{text}', escapeHtml(truncate(task.text || TEXTS.homework.nothing, 1500)))
    .replace('{photos}', photos);

  await setSession(ctx.from.id, 'edit:actions', { date: dateKey, subject });
  await replyOrEdit(ctx, text, editActionsKeyboard(dateKey, key));
}

export async function startEdit(ctx) {
  const user = await requireAdmin(ctx);
  if (!user) return;
  await answerCb(ctx);
  await setSession(ctx.from.id, 'edit:choose_day', {});
  await showCalendar(ctx, 'edit', 0);
}

async function showEditSubjects(ctx, dateKey) {
  const user = await requireAdmin(ctx);
  if (!user) return;

  const dayData = await getDayData(getClassKey(user), dateKey);
  const subjects = Object.keys(dayData);

  if (!subjects.length) {
    await ctx.reply(TEXTS.remove.noSubjects);
    await showCalendar(ctx, 'edit', 0);
    return;
  }

  await setSession(ctx.from.id, 'edit:subject', { date: dateKey });
  await replyOrEdit(
    ctx,
    TEXTS.edit.chooseSubject.replace('{date}', formatDateHuman(dateKey)),
    editSubjectKeyboard(dateKey, subjects)
  );
}

export async function handleEditText(ctx, session) {
  const user = await requireAdmin(ctx);
  if (!user) return false;

  if (session.step !== 'edit:text') return false;

  const text = ctx.message.text.trim();
  if (!text) {
    await ctx.reply(TEXTS.add.needText);
    return true;
  }

  await replaceText(getClassKey(user), session.data.date, session.data.subject, text);
  await touchUserActivity(user.tgId, { added: true });
  await clearSession(ctx.from.id);
  await ctx.reply(TEXTS.edit.textSaved);
  await renderActions(ctx, session.data.date, session.data.subject);
  return true;
}

export async function handleEditPhoto(ctx, session) {
  const user = await requireAdmin(ctx);
  if (!user) return false;
  if (session.step !== 'edit:text') return false;

  const photos = ctx.message.photo || [];
  const largest = photos[photos.length - 1];
  if (!largest) return true;

  const classKey = getClassKey(user);
  const { date, subject } = session.data;
  if (ctx.message.caption) {
    await replaceText(classKey, date, subject, ctx.message.caption);
  }
  await addPhotoToTask(classKey, date, subject, largest.file_id);

  await clearSession(ctx.from.id);
  await ctx.reply(TEXTS.homework.savedPhoto);
  await renderActions(ctx, date, subject);
  return true;
}

bot.action('adm:edit', async (ctx) => startEdit(ctx));

bot.action(/^edit_day_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  await answerCb(ctx);
  await showEditSubjects(ctx, ctx.match[1]);
});

bot.action(/^edit:sub:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  const resolved = await resolveSubject(ctx, ctx.match[1], ctx.match[2]);
  if (!resolved) return;
  if (!resolved.subject) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    await showEditSubjects(ctx, ctx.match[1]);
    return;
  }
  await answerCb(ctx);
  await renderActions(ctx, ctx.match[1], resolved.subject);
});

bot.action(/^edit:actions:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  const resolved = await resolveSubject(ctx, ctx.match[1], ctx.match[2]);
  if (!resolved?.subject) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    return;
  }
  await answerCb(ctx);
  await renderActions(ctx, ctx.match[1], resolved.subject);
});

bot.action(/^edit:rmphoto:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  const resolved = await resolveSubject(ctx, ctx.match[1], ctx.match[2]);
  if (!resolved?.subject) return;
  await answerCb(ctx);
  await replyOrEdit(
    ctx,
    TEXTS.edit.removePhotoConfirm.replace('{date}', formatDateHuman(ctx.match[1])).replace('{subject}', escapeHtml(resolved.subject)),
    rowConfirmKeyboard(`edit:actions:${ctx.match[1]}:${ctx.match[2]}`, `edit:rmphoto_yes:${ctx.match[1]}:${ctx.match[2]}`)
  );
});

bot.action(/^edit:rmphoto_yes:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  const resolved = await resolveSubject(ctx, ctx.match[1], ctx.match[2]);
  if (!resolved?.user) return;
  if (!resolved.subject) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    return;
  }
  await removePhotos(getClassKey(resolved.user), ctx.match[1], resolved.subject);
  await answerCb(ctx, TEXTS.edit.photoRemoved);
  await renderActions(ctx, ctx.match[1], resolved.subject);
});

bot.action(/^edit:delete:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  const resolved = await resolveSubject(ctx, ctx.match[1], ctx.match[2]);
  if (!resolved?.subject) return;
  await answerCb(ctx);
  await replyOrEdit(
    ctx,
    TEXTS.edit.deleteConfirm.replace('{date}', formatDateHuman(ctx.match[1])).replace('{subject}', escapeHtml(resolved.subject)),
    rowConfirmKeyboard(`edit:actions:${ctx.match[1]}:${ctx.match[2]}`, `edit:delete_yes:${ctx.match[1]}:${ctx.match[2]}`)
  );
});

bot.action(/^edit:delete_yes:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  const resolved = await resolveSubject(ctx, ctx.match[1], ctx.match[2]);
  if (!resolved?.user || !resolved.subject) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    return;
  }
  await removeSubject(getClassKey(resolved.user), ctx.match[1], resolved.subject);
  await clearSession(ctx.from.id);
  await answerCb(ctx, TEXTS.edit.deleted);
  await replyOrEdit(ctx, TEXTS.edit.deleted, afterEditKeyboard());
});

bot.action(/^edit:move:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  const resolved = await resolveSubject(ctx, ctx.match[1], ctx.match[2]);
  if (!resolved?.subject) return;
  await answerCb(ctx);
  await setSession(ctx.from.id, 'edit:move_choose', { date: ctx.match[1], subject: resolved.subject });
  await showCalendar(ctx, 'move', 0);
});

bot.action(/^move_day_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const session = await getSession(ctx.from.id);
  const user = await requireAdmin(ctx);
  if (!user) return;
  if (!session.data.subject) {
    await answerCb(ctx, TEXTS.errors.noSession);
    await showCalendar(ctx, 'edit', 0);
    return;
  }

  const target = ctx.match[1];
  const key = subjectKey(session.data.subject);
  await setSession(ctx.from.id, 'edit:move_confirm', { ...session.data, target });
  await answerCb(ctx);
  await replyOrEdit(
    ctx,
    TEXTS.edit.moveConfirm.replace('{date}', formatDateHuman(target)).replace('{subject}', escapeHtml(session.data.subject)),
    moveConfirmKeyboard(`${session.data.date}:${key}:${target}`)
  );
});

bot.action(/^edit:moveyes:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8}):(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const resolved = await resolveSubject(ctx, ctx.match[1], ctx.match[2]);
  if (!resolved?.user || !resolved.subject) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    return;
  }
  await moveSubject(getClassKey(resolved.user), ctx.match[1], resolved.subject, ctx.match[3]);
  await clearSession(ctx.from.id);
  await answerCb(ctx, TEXTS.edit.moved);
  await replyOrEdit(ctx, TEXTS.edit.moved, afterEditKeyboard());
});

bot.action(/^edit:subject:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  const resolved = await resolveSubject(ctx, ctx.match[1], ctx.match[2]);
  if (!resolved?.subject) return;
  await answerCb(ctx);
  await setSession(ctx.from.id, 'edit:new_subject', { date: ctx.match[1], subject: resolved.subject });
  await replyOrEdit(
    ctx,
    TEXTS.edit.newSubject,
    newSubjectKeyboard(ctx.match[1], QUICK_SUBJECTS.filter((subject) => subject !== resolved.subject))
  );
});

bot.action(/^edit:newsub:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  const session = await getSession(ctx.from.id);
  const user = await requireAdmin(ctx);
  if (!user) return;

  const newSubject = findSubjectByKey(QUICK_SUBJECTS, ctx.match[2]);
  if (!newSubject || !session.data.subject) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    return;
  }

  await changeSubject(getClassKey(user), session.data.date, session.data.subject, newSubject);
  await clearSession(ctx.from.id);
  await answerCb(ctx, `Теперь ${newSubject}`);
  await renderActions(ctx, session.data.date, newSubject);
});

bot.action(/^edit:text:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  const resolved = await resolveSubject(ctx, ctx.match[1], ctx.match[2]);
  if (!resolved?.subject) return;

  const task = resolved.dayData[resolved.subject];
  await answerCb(ctx);
  await setSession(ctx.from.id, 'edit:text', { date: ctx.match[1], subject: resolved.subject, key: ctx.match[2] });
  await replyOrEdit(
    ctx,
    TEXTS.edit.newTextPrompt.replace('{text}', escapeHtml(truncate(task.text || TEXTS.homework.nothing, 1500))),
    backCancelKeyboard(`edit:actions:${ctx.match[1]}:${ctx.match[2]}`)
  );
});

bot.action('edit:back', async (ctx) => {
  await answerCb(ctx);
  await showCalendar(ctx, 'edit', 0);
});

bot.action(/^cal:edit:(-?\d+)$/, async (ctx) => {
  await answerCb(ctx);
  await showCalendar(ctx, 'edit', Number(ctx.match[1]));
});

bot.action(/^cal:move:(-?\d+)$/, async (ctx) => {
  await answerCb(ctx);
  await showCalendar(ctx, 'move', Number(ctx.match[1]));
});
