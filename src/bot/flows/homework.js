import { TEXTS } from '../texts.js';
import {
  getDayCardKeyboard,
  getEmptyDayKeyboard,
  getCopyDayKeyboard,
  getWeekKeyboard,
  getCalendarKeyboard,
  getPhotoExpiredKeyboard,
} from '../keyboards.js';
import { show, say, toast } from '../ui.js';
import { getSession, patchSession } from '../sessions.js';
import { requireActive, getWorkClassKey } from '../guards.js';
import { isAdmin } from '../roles.js';
import { config } from '../../config.js';
import { User } from '../../db/models/User.js';
import {
  getClassKey,
  getSubjectsForDate,
  toggleCompletedHomework,
  isCompleted,
  getDatesWithHomework,
} from '../../services/homeworkService.js';
import { touchUserActivity } from '../../services/statsService.js';
import {
  isDateKey,
  getToday,
  getTomorrow,
  getAfterTomorrow,
  getDayTitle,
  formatDateHuman,
  formatDayMonth,
  getWeekDates,
} from '../../utils/dateService.js';
import { fill, truncate } from '../../utils/normalize.js';
import { capitalize, getSubjectIcon } from '../../utils/subjects.js';

const MESSAGE_LIMIT = 3900;
export const CAL_FORWARD_LIMIT = 8;

export function calendarBackLimit() {
  // При CLEANUP_DAYS=0 очистка выключена, поэтому назад можно листать до года.
  if (!config.cleanupDays) return -52;
  return -Math.ceil(config.cleanupDays / 7);
}

async function requireClassUser(ctx) {
  const user = await requireActive(ctx);
  if (!user) return null;
  if (!user.school || !user.class) {
    await show(ctx, TEXTS.NO_CLASS);
    return null;
  }
  return user;
}

async function authorNames(items) {
  const ids = [...new Set(items.map((item) => item.addedBy).filter((id) => id !== null && id !== undefined))];
  const numeric = ids.map(Number).filter(Number.isFinite);
  const strings = ids.map(String).filter((id) => id.includes('-'));
  const users = await User.find({ $or: [{ tgId: { $in: numeric } }, { specId: { $in: strings } }] }, { tgId: 1, specId: 1, firstName: 1, username: 1 }).lean();
  const map = new Map();
  for (const u of users) {
    const name = u.username ? `@${u.username}` : u.firstName || 'админ';
    if (u.tgId) map.set(String(u.tgId), name);
    map.set(u.specId, name);
  }
  return map;
}

export async function buildDayCard(user, classKey, dateKey) {
  const subjects = await getSubjectsForDate(classKey, dateKey);
  const header = fill(TEXTS.DAY_HEADER, {
    dayTitle: getDayTitle(dateKey),
    dateHuman: formatDateHuman(dateKey),
    school: capitalize(user.school),
    class: user.class,
  });
  if (subjects.length === 0) {
    return { subjects, text: `${header}\n\n${fill(TEXTS.DAY_EMPTY, { dateKey: formatDayMonth(dateKey) })}` };
  }
  const authors = isAdmin(user) ? await authorNames(subjects) : null;
  // Карточка должна влезть в лимит Telegram (4096 символов): при множестве длинных заданий
  // текст каждого предмета укорачивается, полный текст доступен через «Скопировать ДЗ».
  const perSubject = Math.max(200, Math.floor(MESSAGE_LIMIT / subjects.length) - 120);
  const blocks = subjects.map((item) => {
    const completed = isCompleted(user, dateKey, item.subjectHash);
    let block = fill(TEXTS.DAY_SUBJECT, {
      mark: completed ? '✅' : '☐',
      icon: getSubjectIcon(item.subjectName),
      subject: capitalize(item.subjectName),
      text: truncate(item.text || TEXTS.DAY_NOTHING, perSubject),
    });
    if (item.photoIds.length > 0) block += `\n${fill(TEXTS.DAY_PHOTOS, { count: item.photoIds.length })}`;
    if (authors && item.addedBy !== null && item.addedBy !== undefined) {
      const author = authors.get(String(item.addedBy));
      if (author) block += `\n${fill(TEXTS.DAY_ADDED_BY, { author })}`;
    }
    return block;
  });
  const items = subjects.map((item) => ({ ...item, completed: isCompleted(user, dateKey, item.subjectHash) }));
  return { subjects: items, text: `${header}\n\n${blocks.join('\n\n')}` };
}

export async function showDayHomework(ctx, dateKey, { forceNew = false } = {}) {
  const user = await requireClassUser(ctx);
  if (!user) return null;
  if (!isDateKey(dateKey)) dateKey = getToday();
  const classKey = getClassKey(user.school, user.class);
  const { subjects, text } = await buildDayCard(user, classKey, dateKey);
  const keyboard = subjects.length === 0 ? getEmptyDayKeyboard(dateKey, user) : getDayCardKeyboard(dateKey, subjects, user);
  await touchUserActivity(user.tgId, { incrementViews: subjects.length > 0 });
  return (forceNew ? say : show)(ctx, text, keyboard);
}

export async function showWeekHomework(ctx, offset = 0) {
  const user = await requireClassUser(ctx);
  if (!user) return null;
  const classKey = getClassKey(user.school, user.class);
  const week = getWeekDates(offset);
  const header = fill(TEXTS.WEEK_HEADER, {
    range: `${formatDayMonth(week[0].dateKey)}–${formatDayMonth(week[6].dateKey)}`,
    school: capitalize(user.school),
    class: user.class,
  });
  const blocks = [];
  for (const day of week) {
    const subjects = await getSubjectsForDate(classKey, day.dateKey);
    if (subjects.length === 0) continue;
    const lines = [fill(TEXTS.WEEK_DAY, { dayTitle: getDayTitle(day.dateKey), dateHuman: formatDateHuman(day.dateKey) })];
    for (const item of subjects) {
      lines.push(
        fill(TEXTS.WEEK_LINE, {
          icon: getSubjectIcon(item.subjectName),
          subject: capitalize(item.subjectName),
          text: truncate((item.text || TEXTS.DAY_NOTHING).replace(/\s+/g, ' '), 50),
        }),
      );
    }
    blocks.push(lines.join('\n'));
  }
  const body = blocks.length > 0 ? blocks.join('\n\n') : TEXTS.WEEK_EMPTY;
  await touchUserActivity(user.tgId, { incrementViews: blocks.length > 0 });
  return show(ctx, truncate(`${header}\n\n${body}`, MESSAGE_LIMIT), getWeekKeyboard(Number(offset) || 0, user));
}

// mode: show | add | edit | del | move. Режим и сдвиг хранятся в сессии, чтобы cal:prev/cal:next
// укладывались в короткий callback и не теряли контекст админ-флоу.
export async function showCalendar(ctx, mode = 'show', offset = 0) {
  const user = mode === 'show' ? await requireClassUser(ctx) : await requireActive(ctx);
  if (!user) return null;
  const safeOffset = Math.min(CAL_FORWARD_LIMIT, Math.max(calendarBackLimit(), Number(offset) || 0));
  const classKey = mode === 'show' ? getClassKey(user.school, user.class) : getWorkClassKey(user);
  if (!classKey) return show(ctx, TEXTS.NO_CLASS);
  const week = getWeekDates(safeOffset);
  const dates = await getDatesWithHomework(classKey, week[0].dateKey, week[6].dateKey);
  await patchSession(ctx.from.id, 'telegram', { calMode: mode, calOffset: safeOffset });
  return show(ctx, TEXTS.CALENDAR, getCalendarKeyboard(mode, safeOffset, dates, user));
}

async function shiftCalendar(ctx, delta) {
  const session = await getSession(ctx.from.id, 'telegram');
  const mode = session?.data?.calMode || 'show';
  const current = Number(session?.data?.calOffset) || 0;
  const next = current + delta;
  if (next > CAL_FORWARD_LIMIT) {
    await toast(ctx, TEXTS.CALENDAR_LIMIT_FORWARD, true);
    return null;
  }
  if (next < calendarBackLimit()) {
    await toast(ctx, TEXTS.CALENDAR_LIMIT_BACK, true);
    return null;
  }
  return showCalendar(ctx, mode, next);
}

function splitText(text, limit = MESSAGE_LIMIT) {
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) parts.push(rest);
  return parts;
}

export function homeworkFlow(bot) {
  bot.action('hw:today', async (ctx) => showDayHomework(ctx, getToday()));
  bot.action('hw:tomorrow', async (ctx) => showDayHomework(ctx, getTomorrow()));
  bot.action('hw:after_tomorrow', async (ctx) => showDayHomework(ctx, getAfterTomorrow()));
  bot.action('hw:week', async (ctx) => showWeekHomework(ctx, 0));
  // Листание недель прямо из списка недели (раньше кнопки вели в календарь).
  bot.action(/^hw:week:(-?\d{1,2})$/, async (ctx) => {
    const offset = Number(ctx.match[1]);
    if (offset > CAL_FORWARD_LIMIT) {
      await toast(ctx, TEXTS.CALENDAR_LIMIT_FORWARD, true);
      return null;
    }
    if (offset < calendarBackLimit()) {
      await toast(ctx, TEXTS.CALENDAR_LIMIT_BACK, true);
      return null;
    }
    return showWeekHomework(ctx, offset);
  });
  bot.action(/^hw:day:(\d{4}-\d{2}-\d{2})$/, async (ctx) => showDayHomework(ctx, ctx.match[1]));
  bot.action(/^show_day:(\d{4}-\d{2}-\d{2})$/, async (ctx) => showDayHomework(ctx, ctx.match[1]));

  bot.action(/^cal:show:(-?\d{1,3})$/, async (ctx) => {
    const offset = Number(ctx.match[1]);
    if (offset > CAL_FORWARD_LIMIT) {
      await toast(ctx, TEXTS.CALENDAR_LIMIT_FORWARD, true);
      return null;
    }
    if (offset < calendarBackLimit()) {
      await toast(ctx, TEXTS.CALENDAR_LIMIT_BACK, true);
      return null;
    }
    return showCalendar(ctx, 'show', offset);
  });
  bot.action('cal:prev', async (ctx) => shiftCalendar(ctx, -1));
  bot.action('cal:next', async (ctx) => shiftCalendar(ctx, 1));

  // Отметка «сделано» привязана к хэшу предмета, а не к позиции в списке:
  // если админ изменил ДЗ между показом и нажатием, галочка не «съедет» на другой предмет.
  bot.action(/^chk:(\d{4}-\d{2}-\d{2}):([0-9a-f]{8})$/, async (ctx) => {
    const user = await requireClassUser(ctx);
    if (!user) return null;
    const [, dateKey, subjectHash] = ctx.match;
    const subjects = await getSubjectsForDate(getClassKey(user.school, user.class), dateKey);
    if (!subjects.some((item) => item.subjectHash === subjectHash)) {
      await toast(ctx, TEXTS.STALE_MENU);
      return showDayHomework(ctx, dateKey);
    }
    await toggleCompletedHomework(ctx.from.id, dateKey, subjectHash);
    return showDayHomework(ctx, dateKey);
  });

  bot.action(/^show_photos:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    const user = await requireClassUser(ctx);
    if (!user) return null;
    const dateKey = ctx.match[1];
    const subjects = await getSubjectsForDate(getClassKey(user.school, user.class), dateKey);
    const withPhotos = subjects.filter((item) => item.photoIds.length > 0);
    if (withPhotos.length === 0) return say(ctx, TEXTS.PHOTO_NONE, getPhotoExpiredKeyboard(dateKey, user));
    let expired = false;
    for (const item of withPhotos) {
      const total = item.photoIds.length;
      for (let i = 0; i < total; i += 1) {
        const vars = {
          icon: getSubjectIcon(item.subjectName),
          subject: capitalize(item.subjectName),
          school: capitalize(user.school),
          n: i + 1,
          total,
        };
        const caption = fill(total > 1 ? TEXTS.PHOTO_CAPTION_MULTI : TEXTS.PHOTO_CAPTION, vars);
        try {
          await ctx.replyWithPhoto(item.photoIds[i], { caption, parse_mode: 'HTML' });
        } catch {
          expired = true;
        }
      }
    }
    if (expired) return say(ctx, TEXTS.PHOTO_EXPIRED, getPhotoExpiredKeyboard(dateKey, user));
    return say(ctx, fill(TEXTS.DAY_HEADER, {
      dayTitle: getDayTitle(dateKey),
      dateHuman: formatDateHuman(dateKey),
      school: capitalize(user.school),
      class: user.class,
    }), getCopyDayKeyboard(dateKey, user));
  });

  bot.action(/^copy:day:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    const user = await requireClassUser(ctx);
    if (!user) return null;
    const dateKey = ctx.match[1];
    const subjects = await getSubjectsForDate(getClassKey(user.school, user.class), dateKey);
    const header = fill(
      TEXTS.COPY_HEADER,
      { dayTitle: getDayTitle(dateKey), dateHuman: formatDateHuman(dateKey), school: capitalize(user.school), class: user.class },
      { escape: false },
    );
    const body = subjects.length
      ? subjects.map((item) => `${capitalize(item.subjectName)}\n${item.text || TEXTS.DAY_NOTHING}`).join('\n\n')
      : fill(TEXTS.DAY_EMPTY, { dateKey: formatDayMonth(dateKey) }, { escape: false });
    // Текст для копирования отправляется без HTML-разметки, поэтому экранирование не нужно.
    const parts = splitText(`${header}\n\n${body}`);
    for (let i = 0; i < parts.length; i += 1) {
      const extra = i === parts.length - 1 ? getCopyDayKeyboard(dateKey, user) : {};
      await ctx.reply(parts[i], extra);
    }
    return toast(ctx, TEXTS.COPY_HINT);
  });

  bot.action('noop', async (ctx) => toast(ctx, ''));
}
