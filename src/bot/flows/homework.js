import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import { dayCardKeyboard, weekKeyboard, calendarKeyboard, allHomeworkKeyboard } from '../keyboards.js';
import { getUserByTgId, updateByTgId } from '../../services/userService.js';
import {
  getClassKey,
  getClassHomework,
  getDayData,
  collectPhotoIds,
  touchUserActivity,
} from '../../services/homeworkService.js';
import { toDateKey, addDaysToKey, dayTitle, formatDateShort, formatDateHuman, getWeekDates } from '../../services/dateService.js';
import { getSubjectIcon, subjectKey } from '../../utils/subjects.js';
import { escapeHtml, truncate } from '../../utils/normalize.js';
import config from '../../config.js';

function cardTitle(dateKey, todayKey) {
  const label = dayTitle(dateKey, todayKey);
  return ['Сегодня', 'Завтра', 'Послезавтра'].includes(label) ? `${label} · ${formatDateHuman(dateKey)}` : label;
}

function fitMessage(text) {
  const limit = 4000;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 130).trimEnd()}…\n\nПолная версия на сайте: ${config.site.url}`;
}

export async function showDayHomework(ctx, dateKey) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered, {
      reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.register, callback_data: 'reg:start' }]] },
    });
    return;
  }

  const classKey = getClassKey(user);
  const dayData = await getDayData(classKey, dateKey);
  const subjects = Object.keys(dayData);
  const doneSet = new Set(user.completedHomework?.[dateKey] || []);
  const todayKey = toDateKey();

  let text = `<b>📅 ${cardTitle(dateKey, todayKey)}</b>\n${escapeHtml(user.school || '')}, класс ${escapeHtml(user.class)}\n\n`;

  if (subjects.length === 0) {
    text += TEXTS.homework.noHomework.replace('{date}', formatDateHuman(dateKey));
  } else {
    for (const subject of subjects) {
      const task = dayData[subject] || {};
      const photos = collectPhotoIds(task).length;
      const mark = doneSet.has(subject) ? '✅' : '☐';
      text += `${mark} ${getSubjectIcon(subject)} <b>${escapeHtml(subject)}</b>\n`;
      text += `${escapeHtml(task.text || '') || TEXTS.homework.nothing}\n`;
      if (photos) text += `${TEXTS.homework.photoCount.replace('{count}', photos)}\n`;
      text += '\n';
    }
  }

  const hasPhotos = subjects.some((subject) => collectPhotoIds(dayData[subject]).length > 0);
  const keyboard = dayCardKeyboard(dateKey, {
    hasPhotos,
    isAdmin: user.role === 'admin' || user.role === 'creator',
    subjects,
    doneSet,
  });

  await touchUserActivity(user.tgId, { viewed: true });
  await replyOrEdit(ctx, fitMessage(text.trimEnd()), keyboard);
}

export async function showWeekHomework(ctx, offset = 0) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered);
    return;
  }

  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dates = getWeekDates(offset);
  const todayKey = toDateKey();
  const range = `${dates[0].slice(8, 10)}.${dates[0].slice(5, 7)}–${dates[6].slice(8, 10)}.${dates[6].slice(5, 7)}`;

  let text = `<b>${TEXTS.homework.weekTitle.replace('{dates}', range)}</b>\n`;
  text += `${escapeHtml(user.school || '')}, класс ${escapeHtml(user.class)}\n\n`;

  let hasAny = false;
  for (const dateKey of dates) {
    const dayData = homework[dateKey];
    if (!dayData || Object.keys(dayData).length === 0) continue;
    hasAny = true;
    text += `<b>${dayTitle(dateKey, todayKey)}</b>\n`;
    for (const [subject, task] of Object.entries(dayData)) {
      const short = truncate(task.text || '', 50) || TEXTS.homework.nothing;
      text += `${getSubjectIcon(subject)} ${escapeHtml(subject)}: ${escapeHtml(short)}\n`;
    }
    text += '\n';
  }

  if (!hasAny) text += TEXTS.homework.weekEmpty;

  await replyOrEdit(ctx, fitMessage(text.trimEnd()), weekKeyboard(offset));
}

export async function showCalendar(ctx, mode = 'show', offset = 0) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered);
    return;
  }

  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const todayKey = toDateKey();
  const maxOffset = 8;
  const minOffset = -Math.max(1, Math.floor(config.cleanup.days / 7));
  const safeOffset = Math.min(maxOffset, Math.max(minOffset, offset));
  const dates = getWeekDates(safeOffset, todayKey);

  const titles = {
    show: TEXTS.homework.calendar,
    add: TEXTS.add.chooseDay,
    del: TEXTS.remove.chooseDay,
    edit: TEXTS.edit.chooseDay,
    move: TEXTS.edit.moveChooseDay,
  };

  const keyboard = calendarKeyboard({
    mode,
    weekOffset: safeOffset,
    dates,
    data: homework,
    todayKey,
    minOffset,
    maxOffset,
  });

  await replyOrEdit(ctx, titles[mode] || TEXTS.homework.calendar, keyboard);
}

export async function showAllHomework(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered);
    return;
  }

  const homework = await getClassHomework(getClassKey(user));
  const todayKey = toDateKey();
  const days = [];

  for (let i = 0; i < 14; i += 1) {
    const dateKey = addDaysToKey(todayKey, i);
    const count = homework[dateKey] ? Object.keys(homework[dateKey]).length : 0;
    if (count > 0) days.push({ date: dateKey, count });
  }

  const text = days.length
    ? `<b>${TEXTS.homework.allTitle}</b>\n\n${TEXTS.homework.allHint}`
    : `<b>${TEXTS.homework.allTitle}</b>\n\n${TEXTS.homework.allEmpty}`;

  await replyOrEdit(ctx, text, allHomeworkKeyboard(days));
}

export async function showPhotos(ctx, dateKey) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;

  const dayData = await getDayData(getClassKey(user), dateKey);

  for (const [subject, task] of Object.entries(dayData)) {
    const photoIds = collectPhotoIds(task);
    for (let index = 0; index < photoIds.length; index += 1) {
      const caption = photoIds.length === 1
        ? `${getSubjectIcon(subject)} ${subject} · ${user.school || ''}`
        : `${getSubjectIcon(subject)} ${subject} · ${user.school || ''} · фото ${index + 1} из ${photoIds.length}`;

      try {
        await ctx.replyWithPhoto(photoIds[index], { caption: escapeHtml(caption) });
      } catch {
        await ctx.reply(TEXTS.errors.fileExpired);
      }
    }
  }
}

export function buildCopyText(user, dateKey, dayData) {
  const todayKey = toDateKey();
  let text = `${TEXTS.homework.copyTitle.replace('{title}', cardTitle(dateKey, todayKey))}\n`;
  text += TEXTS.homework.copyClass.replace('{school}', user.school || '').replace('{class}', user.class) + '\n\n';

  const subjects = Object.keys(dayData);
  if (!subjects.length) {
    text += TEXTS.homework.noHomework.replace('{date}', formatDateHuman(dateKey));
    return text;
  }

  for (const subject of subjects) {
    const task = dayData[subject] || {};
    text += `${subject}\n${task.text || TEXTS.homework.nothing}\n\n`;
  }
  return text.trimEnd();
}

async function toggleCheck(ctx, dateKey, key) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;

  const dayData = await getDayData(getClassKey(user), dateKey);
  const subject = Object.keys(dayData).find((item) => subjectKey(item) === key);

  if (!subject) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    await showDayHomework(ctx, dateKey);
    return;
  }

  const completed = { ...(user.completedHomework || {}) };
  const list = Array.isArray(completed[dateKey]) ? [...completed[dateKey]] : [];
  const index = list.indexOf(subject);
  if (index === -1) list.push(subject);
  else list.splice(index, 1);

  if (list.length) completed[dateKey] = list;
  else delete completed[dateKey];

  await updateByTgId(user.tgId, { completedHomework: completed });
  await answerCb(ctx, index === -1 ? `✅ ${subject}` : `☐ ${subject}`);
  await showDayHomework(ctx, dateKey);
}

bot.command('today', async (ctx) => showDayHomework(ctx, toDateKey()));
bot.command('tomorrow', async (ctx) => showDayHomework(ctx, addDaysToKey(toDateKey(), 1)));
bot.command('week', async (ctx) => showWeekHomework(ctx, 0));
bot.command('all', async (ctx) => showAllHomework(ctx));

bot.action('hw:today', async (ctx) => {
  await answerCb(ctx);
  await showDayHomework(ctx, toDateKey());
});

bot.action('hw:tomorrow', async (ctx) => {
  await answerCb(ctx);
  await showDayHomework(ctx, addDaysToKey(toDateKey(), 1));
});

bot.action('hw:after', async (ctx) => {
  await answerCb(ctx);
  await showDayHomework(ctx, addDaysToKey(toDateKey(), 2));
});

bot.action(/^hw:day:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  await answerCb(ctx);
  await showDayHomework(ctx, ctx.match[1]);
});

bot.action(/^week:(\d+)$/, async (ctx) => {
  await answerCb(ctx);
  await showWeekHomework(ctx, Number(ctx.match[1]));
});

bot.action(/^cal:show:(-?\d+)$/, async (ctx) => {
  await answerCb(ctx);
  await showCalendar(ctx, 'show', Number(ctx.match[1]));
});

bot.action(/^show_day_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  await answerCb(ctx);
  await showDayHomework(ctx, ctx.match[1]);
});

bot.action(/^chk:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
  await toggleCheck(ctx, ctx.match[1], ctx.match[2]);
});

bot.action(/^photos:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  await answerCb(ctx);
  await showPhotos(ctx, ctx.match[1]);
});

bot.action(/^copy:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  const dayData = await getDayData(getClassKey(user), ctx.match[1]);
  await answerCb(ctx, 'Скопировано');
  await ctx.reply(buildCopyText(user, ctx.match[1], dayData));
});

bot.action('all', async (ctx) => {
  await answerCb(ctx);
  await showAllHomework(ctx);
});
