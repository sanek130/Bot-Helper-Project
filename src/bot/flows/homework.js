import bot, { replyOrEdit, safeAnswerCb } from '../bot.js';
import { TEXTS } from '../texts.js';
import { dayCardKeyboard, calendarKeyboard, checklistKeyboard } from '../keyboards.js';
import { getUserByTgId, updateUserStats } from '../../services/userService.js';
import { getClassKey, getClassHomework, getSubjectIcon } from '../../services/homeworkService.js';
import { toDateKey, addDaysToKey, dayTitle, formatDateShort, getWeekDates } from '../../services/dateService.js';
import { escapeHtml } from '../../utils/normalize.js';

// Команды ДЗ
bot.command('today', async (ctx) => {
  await showDayHomework(ctx, toDateKey());
});

bot.command('tomorrow', async (ctx) => {
  await showDayHomework(ctx, addDaysToKey(toDateKey(), 1));
});

bot.action('today', async (ctx) => {
  await showDayHomework(ctx, toDateKey());
});

bot.action('tomorrow', async (ctx) => {
  await showDayHomework(ctx, addDaysToKey(toDateKey(), 1));
});

bot.action('dayAfterTomorrow', async (ctx) => {
  await showDayHomework(ctx, addDaysToKey(toDateKey(), 2));
});

bot.action('week', async (ctx) => {
  await showWeekHomework(ctx);
});

bot.action('otherWeek', async (ctx) => {
  await showWeekHomework(ctx, 1);
});

bot.action('selectDay', async (ctx) => {
  await showCalendar(ctx, 0);
});

bot.action('allHomework', async (ctx) => {
  await showAllHomework(ctx);
});

// Показать ДЗ на конкретный день
async function showDayHomework(ctx, dateKey) {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user) {
    await ctx.reply(TEXTS.errors.notRegistered, { parse_mode: 'HTML' });
    return;
  }
  
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dayData = homework[dateKey] || {};
  const completedSet = new Set(user.completedHomework?.[dateKey] || []);
  
  const title = dayTitle(dateKey);
  const todayKey = toDateKey();
  
  let msg = `<b>${TEXTS.homework[title.includes('Сегодня') ? 'today' : title.includes('Завтра') ? 'tomorrow' : 'dayAfterTomorrow']} · ${formatDateShort(dateKey)}</b>\n`;
  msg += `<b>${classKey}</b>\n\n`;
  
  if (Object.keys(dayData).length === 0) {
    msg += TEXTS.homework.noHomework.replace('{date}', formatDateShort(dateKey));
  } else {
    for (const [subject, task] of Object.entries(dayData)) {
      const icon = getSubjectIcon(subject);
      const text = typeof task === 'object' ? task.text : task;
      const hasPhoto = typeof task === 'object' && (task.photoId || (task.photoIds && task.photoIds.length > 0));
      const done = completedSet.has(subject);
      const mark = done ? '✅ ' : '☐ ';
      
      msg += `${mark}${icon} <b>${escapeHtml(subject)}</b>\n`;
      msg += `${escapeHtml(text || TEXTS.homework.nothing)}\n`;
      
      if (hasPhoto) {
        const photoCount = task.photoIds ? task.photoIds.length : 1;
        msg += TEXTS.homework.photoCount.replace('{count}', photoCount) + '\n';
      }
      
      msg += '\n';
    }
  }
  
  const hasPhotos = Object.values(dayData).some(task => 
    typeof task === 'object' && (task.photoId || (task.photoIds && task.photoIds.length > 0))
  );
  
  const isAdmin = user.role === 'admin' || user.role === 'creator';
  const keyboard = dayCardKeyboard(dateKey, hasPhotos, isAdmin);
  
  await updateUserStats(user.tgId, 'view_homework');
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Показать ДЗ на неделю
async function showWeekHomework(ctx, weekOffset = 0) {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user) {
    await ctx.reply(TEXTS.errors.notRegistered, { parse_mode: 'HTML' });
    return;
  }
  
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dates = getWeekDates(weekOffset);
  const todayKey = toDateKey();
  
  let msg = `<b>📅 Неделя</b>\n`;
  msg += `<b>${classKey}</b>\n\n`;
  
  for (const dateKey of dates) {
    const dayData = homework[dateKey] || {};
    
    if (Object.keys(dayData).length === 0) continue;
    
    const title = dayTitle(dateKey, todayKey);
    msg += `<b>${title}</b>\n`;
    
    for (const [subject, task] of Object.entries(dayData)) {
      const icon = getSubjectIcon(subject);
      const text = typeof task === 'object' ? task.text : task;
      const shortText = text ? text.slice(0, 50) + (text.length > 50 ? '…' : '') : TEXTS.homework.nothing;
      
      msg += `${icon} ${escapeHtml(subject)}: ${escapeHtml(shortText)}\n`;
    }
    
    msg += '\n';
  }
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.buttons.today, callback_data: 'today' }, { text: TEXTS.buttons.tomorrow, callback_data: 'tomorrow' }],
        [{ text: TEXTS.buttons.schedule, callback_data: 'schedule' }],
        [{ text: TEXTS.buttons.help, callback_data: 'help' }],
        [{ text: TEXTS.buttons.menu, callback_data: 'menu' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Показать календарь
async function showCalendar(ctx, weekOffset = 0) {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user) {
    await ctx.reply(TEXTS.errors.notRegistered, { parse_mode: 'HTML' });
    return;
  }
  
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dates = getWeekDates(weekOffset);
  const todayKey = toDateKey();
  
  const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  
  const rows = [];
  
  // Заголовок дней недели
  rows.push(dates.map(date => ({ text: weekDays[new Date(date).getDay()], callback_data: 'noop' })));
  
  // Даты
  rows.push(dates.map(date => {
    const day = date.split('-')[2];
    const hasHomework = homework[date] && Object.keys(homework[date]).length > 0;
    let label = day;
    
    if (date === todayKey) {
      label = `[${day}]`;
    } else if (hasHomework) {
      label = `${day}•`;
    }
    
    return { text: label, callback_data: `show_day_${date}` };
  }));
  
  // Навигация
  const navRow = [];
  if (weekOffset > 0) {
    navRow.push({ text: '◀️', callback_data: `calendar_${weekOffset - 1}` });
  }
  navRow.push({ text: formatDateShort(dates[0]), callback_data: 'noop' });
  if (weekOffset < 8) {
    navRow.push({ text: '▶️', callback_data: `calendar_${weekOffset + 1}` });
  }
  rows.push(navRow);
  
  rows.push([{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]);
  rows.push([{ text: TEXTS.buttons.menu, callback_data: 'menu' }]);
  
  const msg = '<b>Выбери день</b>\n\n[число] — сегодня\n• — есть ДЗ';
  const keyboard = { reply_markup: { inline_keyboard: rows } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Обработка выбора дня из календаря
bot.action(/^calendar_(\d+)$/, async (ctx) => {
  const weekOffset = parseInt(ctx.match[1]);
  await showCalendar(ctx, weekOffset);
});

bot.action(/^show_day_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const dateKey = ctx.match[1];
  await showDayHomework(ctx, dateKey);
});

// Показать все ДЗ от сегодня
async function showAllHomework(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user) {
    await ctx.reply(TEXTS.errors.notRegistered, { parse_mode: 'HTML' });
    return;
  }
  
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const todayKey = toDateKey();
  
  const dates = Object.keys(homework)
    .filter(date => date >= todayKey)
    .sort()
    .slice(0, 14);
  
  if (dates.length === 0) {
    const msg = `<b>📚 Всё ДЗ</b>\n\n${TEXTS.homework.noHomework.replace('{date}', 'от сегодня')}`;
    await safeAnswerCb(ctx);
    await replyOrEdit(ctx, msg, { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.menu, callback_data: 'menu' }]] } });
    return;
  }
  
  const rows = dates.map(date => [{
    text: `${formatDateShort(date)} · ${Object.keys(homework[date]).length}`,
    callback_data: `show_day_${date}`
  }]);
  
  rows.push([{ text: TEXTS.buttons.menu, callback_data: 'menu' }]);
  
  const msg = `<b>📚 Всё ДЗ от сегодня</b>\n\nВыбери день:`;
  const keyboard = { reply_markup: { inline_keyboard: rows } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Переключение чеклиста
bot.action(/^toggle_(\d{4}-\d{2}-\d{2})_(\d+)$/, async (ctx) => {
  const dateKey = ctx.match[1];
  const subjectIndex = parseInt(ctx.match[2]);
  
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dayData = homework[dateKey] || {};
  const subjects = Object.keys(dayData);
  
  if (subjectIndex >= subjects.length) {
    await safeAnswerCb(ctx, 'Предмет не найден');
    await showDayHomework(ctx, dateKey);
    return;
  }
  
  const subject = subjects[subjectIndex];
  const completed = { ...(user.completedHomework || {}) };
  const list = Array.isArray(completed[dateKey]) ? [...completed[dateKey]] : [];
  const idx = list.indexOf(subject);
  
  if (idx === -1) {
    list.push(subject);
  } else {
    list.splice(idx, 1);
  }
  
  completed[dateKey] = list;
  
  await updateUser(user.tgId, { completedHomework: completed });
  await showDayHomework(ctx, dateKey);
});

// Показать фото
bot.action(/^show_photos_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const dateKey = ctx.match[1];
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user) return;
  
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dayData = homework[dateKey] || {};
  
  for (const [subject, task] of Object.entries(dayData)) {
    if (typeof task === 'object' && (task.photoId || (task.photoIds && task.photoIds.length > 0))) {
      const icon = getSubjectIcon(subject);
      const photoIds = task.photoIds || [task.photoId];
      
      for (let i = 0; i < photoIds.length; i++) {
        const caption = photoIds.length === 1 
          ? `${icon} ${subject} · ${classKey}`
          : `${icon} ${subject} · ${classKey} · фото ${i + 1} из ${photoIds.length}`;
        
        try {
          await ctx.replyWithPhoto(photoIds[i], { caption });
        } catch (e) {
          console.error('Ошибка отправки фото:', e);
        }
      }
    }
  }
  
  await safeAnswerCb(ctx);
  await showDayHomework(ctx, dateKey);
});

// Скопировать ДЗ
bot.action(/^copy_day_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const dateKey = ctx.match[1];
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user) return;
  
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dayData = homework[dateKey] || {};
  
  let text = `${dayTitle(dateKey)}\nКласс ${classKey}\n\n`;
  
  if (Object.keys(dayData).length === 0) {
    text += TEXTS.homework.noHomework.replace('{date}', formatDateShort(dateKey));
  } else {
    for (const [subject, task] of Object.entries(dayData)) {
      const taskText = typeof task === 'object' ? task.text : task;
      text += `${subject}\n${taskText || TEXTS.homework.nothing}\n\n`;
    }
  }
  
  await ctx.reply(text);
  await safeAnswerCb(ctx);
});
