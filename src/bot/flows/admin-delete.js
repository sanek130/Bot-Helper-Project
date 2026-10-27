import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import { deleteSubjectKeyboard, rowConfirmKeyboard } from '../keyboards.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { getUserByTgId } from '../../services/userService.js';
import { getClassKey, getDayData, removeSubject } from '../../services/homeworkService.js';
import { formatDateHuman } from '../../services/dateService.js';
import { escapeHtml } from '../../utils/normalize.js';
import { subjectKey } from '../../utils/subjects.js';
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

export async function startDelete(ctx) {
  const user = await requireAdmin(ctx);
  if (!user) return;
  await answerCb(ctx);
  await setSession(ctx.from.id, 'del:choose_day', {});
  await showCalendar(ctx, 'del', 0);
}

async function showDeleteSubjects(ctx, dateKey) {
  const user = await requireAdmin(ctx);
  if (!user) return;

  const dayData = await getDayData(getClassKey(user), dateKey);
  const subjects = Object.keys(dayData);

  if (!subjects.length) {
    await ctx.reply(TEXTS.remove.noSubjects);
    await showCalendar(ctx, 'del', 0);
    return;
  }

  await setSession(ctx.from.id, 'del:subject', { date: dateKey });
  await replyOrEdit(
    ctx,
    TEXTS.remove.chooseSubject.replace('{date}', formatDateHuman(dateKey)),
    deleteSubjectKeyboard(dateKey, subjects)
  );
}

async function showDeleteConfirm(ctx, dateKey, key) {
  const user = await requireAdmin(ctx);
  if (!user) return;
  await answerCb(ctx);

  const dayData = await getDayData(getClassKey(user), dateKey);
  const subject = Object.keys(dayData).find((item) => subjectKey(item) === key);
  if (!subject) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    await showDeleteSubjects(ctx, dateKey);
    return;
  }

  await setSession(ctx.from.id, 'del:confirm', { date: dateKey, subject });
  await replyOrEdit(
    ctx,
    TEXTS.remove.confirm.replace('{date}', formatDateHuman(dateKey)).replace('{subject}', escapeHtml(subject)),
    rowConfirmKeyboard(`del_day_${dateKey}`, `del:yes:${dateKey}:${key}`)
  );
}

async function doDelete(ctx, dateKey, key) {
  const user = await requireAdmin(ctx);
  if (!user) return;

  const dayData = await getDayData(getClassKey(user), dateKey);
  const subject = Object.keys(dayData).find((item) => subjectKey(item) === key);
  if (!subject) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    await showCalendar(ctx, 'del', 0);
    return;
  }

  await removeSubject(getClassKey(user), dateKey, subject);
  await clearSession(ctx.from.id);
  await answerCb(ctx, TEXTS.remove.done);
  await replyOrEdit(ctx, TEXTS.remove.done, {
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.remove.again, callback_data: 'adm:del' }, { text: TEXTS.buttons.menu, callback_data: 'menu1' }],
      ],
    },
  });
}

bot.action('adm:del', async (ctx) => startDelete(ctx));

bot.action(/^del_day_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  await answerCb(ctx);
  await showDeleteSubjects(ctx, ctx.match[1]);
});

bot.action(/^del:sub:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  await showDeleteConfirm(ctx, ctx.match[1], ctx.match[2]);
});

bot.action(/^del:yes:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  await doDelete(ctx, ctx.match[1], ctx.match[2]);
});

bot.action(/^cal:del:(-?\d+)$/, async (ctx) => {
  await answerCb(ctx);
  await showCalendar(ctx, 'del', Number(ctx.match[1]));
});
