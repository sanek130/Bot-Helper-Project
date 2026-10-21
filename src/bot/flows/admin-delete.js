import bot, { replyOrEdit, safeAnswerCb, setSessionStep, getSessionData, clearSession } from '../bot.js';
import { TEXTS } from '../texts.js';
import { getUserByTgId } from '../../services/userService.js';
import { getClassKey, getClassHomework, saveClassHomework } from '../../services/homeworkService.js';
import { toDateKey, formatDateShort, getWeekDates } from '../../services/dateService.js';

// Удаление ДЗ
bot.action('deleteHomework', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user || (user.role !== 'admin' && user.role !== 'creator')) {
    await safeAnswerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  
  await showCalendarForDelete(ctx, 0);
});

// Календарь для удаления
async function showCalendarForDelete(ctx, weekOffset) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dates = getWeekDates(weekOffset);
  const todayKey = toDateKey();
  
  const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  
  const rows = [];
  rows.push(dates.map(date => ({ text: weekDays[new Date(date).getDay()], callback_data: 'noop' })));
  
  rows.push(dates.map(date => {
    const day = date.split('-')[2];
    const hasHomework = homework[date] && Object.keys(homework[date]).length > 0;
    let label = day;
    
    if (date === todayKey) {
      label = `[${day}]`;
    } else if (hasHomework) {
      label = `${day}•`;
    }
    
    return { text: label, callback_data: `del_date_${date}` };
  }));
  
  const navRow = [];
  if (weekOffset > 0) {
    navRow.push({ text: '◀️', callback_data: `del_cal_${weekOffset - 1}` });
  }
  navRow.push({ text: formatDateShort(dates[0]), callback_data: 'noop' });
  if (weekOffset < 8) {
    navRow.push({ text: '▶️', callback_data: `del_cal_${weekOffset + 1}` });
  }
  rows.push(navRow);
  
  rows.push([{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]);
  rows.push([{ text: TEXTS.buttons.menu, callback_data: 'menu' }]);
  
  const msg = '<b>Выбери день для удаления ДЗ</b>';
  const keyboard = { reply_markup: { inline_keyboard: rows } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

bot.action(/^del_cal_(\d+)$/, async (ctx) => {
  const weekOffset = parseInt(ctx.match[1]);
  await showCalendarForDelete(ctx, weekOffset);
});

bot.action(/^del_date_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const dateKey = ctx.match[1];
  await setSessionStep(ctx, 'del_selectSubject', { date: dateKey });
  await showSubjectSelectionForDelete(ctx);
});

// Выбор предмета для удаления
async function showSubjectSelectionForDelete(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  const data = getSessionData(ctx);
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dayData = homework[data.date] || {};
  const subjects = Object.keys(dayData);
  
  if (subjects.length === 0) {
    await safeAnswerCb(ctx, 'На этот день ДЗ нет');
    await showCalendarForDelete(ctx, 0);
    return;
  }
  
  const rows = subjects.map(subject => [{
    text: subject,
    callback_data: `del_subject_${subject}`
  }]);
  
  rows.push([{ text: TEXTS.buttons.back, callback_data: 'deleteHomework' }]);
  rows.push([{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]);
  
  const msg = `Удаление ДЗ · ${data.date}\n\nВыбери предмет:`;
  const keyboard = { reply_markup: { inline_keyboard: rows } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

bot.action(/^del_subject_(.+)$/, async (ctx) => {
  const subject = ctx.match[1];
  const data = getSessionData(ctx);
  await setSessionStep(ctx, 'del_confirm', { ...data, subject });
  await showDeleteConfirmation(ctx);
});

async function showDeleteConfirmation(ctx) {
  const data = getSessionData(ctx);
  const msg = `Подтверди удаление ДЗ.\n\nДата: ${data.date}\nПредмет: ${data.subject}`;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.buttons.back, callback_data: 'del_selectSubject' }],
        [{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }],
        [{ text: TEXTS.buttons.confirm, callback_data: 'confirmDelete' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

bot.action('confirmDelete', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  const data = getSessionData(ctx);
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dateKey = data.date;
  const subject = data.subject;
  
  if (homework[dateKey] && homework[dateKey][subject]) {
    delete homework[dateKey][subject];
    
    // Если день стал пустым, удаляем день
    if (Object.keys(homework[dateKey]).length === 0) {
      delete homework[dateKey];
    }
    
    await saveClassHomework(classKey, homework);
  }
  
  await clearSession(ctx);
  
  const msg = '✅ Успешно удалено.';
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Удалить ещё', callback_data: 'deleteHomework' }],
        [{ text: TEXTS.buttons.menu, callback_data: 'menu' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});
