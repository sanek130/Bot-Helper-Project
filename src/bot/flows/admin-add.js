import bot, { replyOrEdit, safeAnswerCb, setSessionStep, getSessionData, clearSession } from '../bot.js';
import { TEXTS } from '../texts.js';
import { subjectKeyboard } from '../keyboards.js';
import { getUserByTgId } from '../../services/userService.js';
import { getClassKey, getClassHomework, saveClassHomework, mergeHomeworkTask, incrementHomeworkAdded } from '../../services/homeworkService.js';
import { QUICK_SUBJECTS, getSubjectIcon } from '../../utils/subjects.js';
import { escapeHtml } from '../../utils/normalize.js';
import { toDateKey, formatDateShort, getWeekDates } from '../../services/dateService.js';

// Добавление ДЗ
bot.action('addHomework', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user || (user.role !== 'admin' && user.role !== 'creator')) {
    await safeAnswerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  
  await showCalendarForAdd(ctx, 0);
});

// Календарь для добавления
async function showCalendarForAdd(ctx, weekOffset) {
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
    
    return { text: label, callback_data: `add_date_${date}` };
  }));
  
  const navRow = [];
  if (weekOffset > 0) {
    navRow.push({ text: '◀️', callback_data: `add_cal_${weekOffset - 1}` });
  }
  navRow.push({ text: formatDateShort(dates[0]), callback_data: 'noop' });
  if (weekOffset < 8) {
    navRow.push({ text: '▶️', callback_data: `add_cal_${weekOffset + 1}` });
  }
  rows.push(navRow);
  
  rows.push([{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]);
  rows.push([{ text: TEXTS.buttons.menu, callback_data: 'menu' }]);
  
  const msg = '<b>Выбери день для добавления ДЗ</b>';
  const keyboard = { reply_markup: { inline_keyboard: rows } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Обработка выбора даты для добавления
bot.action(/^add_cal_(\d+)$/, async (ctx) => {
  const weekOffset = parseInt(ctx.match[1]);
  await showCalendarForAdd(ctx, weekOffset);
});

bot.action(/^add_date_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const dateKey = ctx.match[1];
  await setSessionStep(ctx, 'add_selectSubject', { date: dateKey });
  await showSubjectSelection(ctx);
});

// Выбор предмета
async function showSubjectSelection(ctx) {
  const data = getSessionData(ctx);
  const msg = `Дата: ${data.date}\n\nВыбери предмет или нажми «Другой».`;
  const keyboard = subjectKeyboard(QUICK_SUBJECTS);
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

bot.action(/^subject_(\d+)$/, async (ctx) => {
  const index = parseInt(ctx.match[1]);
  const data = getSessionData(ctx);
  const subjects = QUICK_SUBJECTS;
  const subject = subjects[index];
  
  if (!subject) return;
  
  await setSessionStep(ctx, 'add_enterHomework', { ...data, subject });
  await showEnterHomework(ctx);
});

bot.action('subject_other', async (ctx) => {
  await setSessionStep(ctx, 'add_customSubject', getSessionData(ctx));
  const msg = 'Напиши название предмета текстом, например: химия.';
  const keyboard = { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.back, callback_data: 'add_selectSubject' }], [{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]] } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

// Обработка ввода предмета
bot.on('message', async (ctx) => {
  const step = getSessionData(ctx, 'step');
  
  if (step === 'add_customSubject') {
    const text = ctx.message.text;
    if (!text) return;
    
    const subject = text.trim();
    await setSessionStep(ctx, 'add_enterHomework', { ...getSessionData(ctx), subject });
    await showEnterHomework(ctx);
  }
});

// Ввод ДЗ
async function showEnterHomework(ctx) {
  const data = getSessionData(ctx);
  const msg = `Предмет: ${data.subject}\nДата: ${data.date}\n\nНапиши задание текстом или отправь фото с подписью.`;
  const keyboard = { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.back, callback_data: 'add_selectSubject' }], [{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]] } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Обработка ввода ДЗ
bot.on('message', async (ctx) => {
  const step = getSessionData(ctx, 'step');
  
  if (step === 'add_enterHomework') {
    const user = await getUserByTgId(ctx.from?.id);
    if (!user) return;
    
    const data = getSessionData(ctx);
    const hasPhoto = !!ctx.message.photo;
    const text = ctx.message.text || ctx.message.caption;
    
    if (!text && !hasPhoto) return;
    
    const classKey = getClassKey(user);
    const homework = await getClassHomework(classKey);
    const dateKey = data.date;
    const subject = data.subject;
    
    let taskContent;
    
    if (hasPhoto) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      taskContent = {
        type: 'photo',
        photoId: photo.file_id,
        text: text || 'Домашнее задание с фото'
      };
    } else {
      taskContent = {
        type: 'text',
        text: text
      };
    }
    
    // Добавляем через merge
    if (!homework[dateKey]) homework[dateKey] = {};
    homework[dateKey][subject] = mergeHomeworkTask(homework[dateKey][subject], taskContent);
    
    await saveClassHomework(classKey, homework);
    await incrementHomeworkAdded(user.tgId);
    
    await clearSession(ctx);
    
    const msg = TEXTS.homework.added;
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: TEXTS.homework.addMore, callback_data: `add_more_${dateKey}_${subject}` }],
          [{ text: TEXTS.homework.finish, callback_data: `show_day_${dateKey}` }],
          [{ text: TEXTS.buttons.menu, callback_data: 'menu' }]
        ]
      }
    };
    
    await safeAnswerCb(ctx);
    await replyOrEdit(ctx, msg, keyboard);
  }
});

// Добавить ещё к этому же предмету
bot.action(/^add_more_(\d{4}-\d{2}-\d{2})_(.+)$/, async (ctx) => {
  const dateKey = ctx.match[1];
  const subject = ctx.match[2];
  
  await setSessionStep(ctx, 'add_enterHomework', { date: dateKey, subject });
  await showEnterHomework(ctx);
});
