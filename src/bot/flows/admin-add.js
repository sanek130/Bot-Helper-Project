import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import { subjectKeyboard, afterSaveKeyboard, backCancelKeyboard } from '../keyboards.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { getUserByTgId } from '../../services/userService.js';
import { addHomework, getClassKey, touchUserActivity } from '../../services/homeworkService.js';
import { formatDateHuman, toDateKey } from '../../services/dateService.js';
import { QUICK_SUBJECTS, subjectKey, findSubjectByKey, getSubjectIcon } from '../../utils/subjects.js';
import { escapeHtml, sanitizeSubjectName, truncate } from '../../utils/normalize.js';
import { showCalendar, showDayHomework } from './homework.js';

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

export async function startAdd(ctx) {
  const user = await requireAdmin(ctx);
  if (!user) return;
  await answerCb(ctx);
  await setSession(ctx.from.id, 'add:choose_day', {});
  await showCalendar(ctx, 'add', 0);
}

async function showSubjectPrompt(ctx, dateKey) {
  await setSession(ctx.from.id, 'add:subject', { date: dateKey });
  await replyOrEdit(
    ctx,
    TEXTS.add.subjectPrompt.replace('{date}', formatDateHuman(dateKey)),
    subjectKeyboard(dateKey, QUICK_SUBJECTS)
  );
}

async function showTaskPrompt(ctx, data) {
  await setSession(ctx.from.id, 'add:task', data);
  await replyOrEdit(
    ctx,
    TEXTS.add.taskPrompt.replace('{subject}', escapeHtml(data.subject)).replace('{date}', formatDateHuman(data.date)),
    backCancelKeyboard('add:back_subject')
  );
}

export async function handleAddText(ctx, session) {
  const text = ctx.message.text.trim();
  const user = await requireAdmin(ctx);
  if (!user) return true;

  if (session.step === 'add:subject_text') {
    const subject = sanitizeSubjectName(text);
    if (!subject) {
      await ctx.reply(TEXTS.add.invalidSubject);
      return true;
    }
    await showTaskPrompt(ctx, { ...session.data, subject });
    return true;
  }

  if (session.step === 'add:task') {
    if (!text) {
      await ctx.reply(TEXTS.add.needText);
      return true;
    }
    await saveTask(ctx, user, { ...session.data, text, photoIds: [] });
    return true;
  }

  return false;
}

export async function handleAddPhoto(ctx, session) {
  const user = await requireAdmin(ctx);
  if (!user) return true;
  if (session.step !== 'add:task') return false;

  const photos = ctx.message.photo || [];
  const largest = photos[photos.length - 1];
  if (!largest) {
    await ctx.reply(TEXTS.add.needText);
    return true;
  }

  const caption = ctx.message.caption || '';
  await saveTask(ctx, user, { ...session.data, text: caption, photoIds: [largest.file_id] });
  return true;
}

async function saveTask(ctx, user, { date, subject, text, photoIds }) {
  const { task, merged } = await addHomework({
    classKey: getClassKey(user),
    dateKey: date,
    subject,
    text,
    photoIds,
    addedBy: user.tgId,
    addedAt: new Date(),
  });

  await touchUserActivity(user.tgId, { added: true });

  const photos = task.photoIds?.length || 0;
  const preview = truncate(task.text || TEXTS.homework.nothing, 700);
  let message = `<b>${TEXTS.add.saved.replace(/[<>]/g, '')}</b>`;
  if (merged) message += `\n${TEXTS.add.savedMerged}`;
  message += `\n\n${getSubjectIcon(subject)} <b>${escapeHtml(subject)}</b> · ${formatDateHuman(date)}\n${escapeHtml(preview)}`;
  if (photos) message += `\n${TEXTS.homework.photoCount.replace('{count}', photos)}`;

  await setSession(ctx.from.id, 'add:task', { date, subject });
  await ctx.reply(message, { parse_mode: 'HTML', ...afterSaveKeyboard() });
}

export async function handleAddCallback(ctx, action, payload = {}) {
  const user = await requireAdmin(ctx);
  if (!user) return true;

  if (action === 'add:subject') {
    const subject = findSubjectByKey(QUICK_SUBJECTS, payload.key);
    if (!subject) {
      await answerCb(ctx, TEXTS.errors.staleMenu);
      await showCalendar(ctx, 'add', 0);
      return true;
    }
    await answerCb(ctx);
    await showTaskPrompt(ctx, { date: payload.date, subject });
    return true;
  }

  if (action === 'add:day') {
    await answerCb(ctx);
    await showSubjectPrompt(ctx, payload.date);
    return true;
  }

  if (action === 'add:other') {
    const session = await getSession(ctx.from.id);
    await answerCb(ctx);
    await setSession(ctx.from.id, 'add:subject_text', session.data);
    await replyOrEdit(ctx, TEXTS.add.otherSubject, backCancelKeyboard('add:back_subject'));
    return true;
  }

  if (action === 'add:more') {
    const session = await getSession(ctx.from.id);
    if (!session.data.subject) {
      await answerCb(ctx, TEXTS.errors.noSession);
      await startAdd(ctx);
      return true;
    }
    await answerCb(ctx);
    await showTaskPrompt(ctx, session.data);
    return true;
  }

  if (action === 'add:finish') {
    const session = await getSession(ctx.from.id);
    await answerCb(ctx);
    await clearSession(ctx.from.id);
    await showDayHomework(ctx, session.data.date || toDateKey());
    return true;
  }

  if (action === 'add:back_subject') {
    const session = await getSession(ctx.from.id);
    await answerCb(ctx);
    await showSubjectPrompt(ctx, session.data.date);
    return true;
  }

  return false;
}

bot.action(/^add_day_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  await handleAddCallback(ctx, 'add:day', { date: ctx.match[1] });
});

bot.action(/^add:subject:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  await handleAddCallback(ctx, 'add:subject', { date: ctx.match[1], key: ctx.match[2] });
});

bot.action('add:other', async (ctx) => handleAddCallback(ctx, 'add:other'));
bot.action('add:more', async (ctx) => handleAddCallback(ctx, 'add:more'));
bot.action('add:finish', async (ctx) => handleAddCallback(ctx, 'add:finish'));
bot.action('add:back_subject', async (ctx) => handleAddCallback(ctx, 'add:back_subject'));

bot.action(/^cal:add:(-?\d+)$/, async (ctx) => {
  await answerCb(ctx);
  await showCalendar(ctx, 'add', Number(ctx.match[1]));
});
