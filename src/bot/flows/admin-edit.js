import bot, { replyOrEdit, safeAnswerCb, setSessionStep, getSessionData, clearSession } from '../bot.js';
import { TEXTS } from '../texts.js';
import { subjectKeyboard } from '../keyboards.js';
import { getUserByTgId } from '../../services/userService.js';
import { getClassKey, getClassHomework, saveClassHomework, mergeHomeworkTask } from '../../services/homeworkService.js';
import { QUICK_SUBJECTS } from '../../utils/subjects.js';
import { toDateKey, formatDateShort, getWeekDates } from '../../services/dateService.js';

// Редактирование ДЗ
bot.action('editHomework', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user || (user.role !== 'admin' && user.role !== 'creator')) {
    await safeAnswerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  
  await showCalendarForEdit(ctx, 0);
});

// Календарь для редактирования
async function showCalendarForEdit(ctx, weekOffset) {
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
    
    return { text: label, callback_data: `edit_date_${date}` };
  }));
  
  const navRow = [];
  if (weekOffset > 0) {
    navRow.push({ text: '◀️', callback_data: `edit_cal_${weekOffset - 1}` });
  }
  navRow.push({ text: formatDateShort(dates[0]), callback_data: 'noop' });
  if (weekOffset < 8) {
    navRow.push({ text: '▶️', callback_data: `edit_cal_${weekOffset + 1}` });
  }
  rows.push(navRow);
  
  rows.push([{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]);
  rows.push([{ text: TEXTS.buttons.menu, callback_data: 'menu' }]);
  
  const msg = '<b>Редактирование ДЗ</b>\n\nВыбери день:';
  const keyboard = { reply_markup: { inline_keyboard: rows } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

bot.action(/^edit_cal_(\d+)$/, async (ctx) => {
  const weekOffset = parseInt(ctx.match[1]);
  await showCalendarForEdit(ctx, weekOffset);
});

bot.action(/^edit_date_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const dateKey = ctx.match[1];
  await setSessionStep(ctx, 'edit_selectSubject', { date: dateKey });
  await showSubjectSelectionForEdit(ctx);
});

// Выбор предмета для редактирования
async function showSubjectSelectionForEdit(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  const data = getSessionData(ctx);
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dayData = homework[data.date] || {};
  const subjects = Object.keys(dayData);
  
  if (subjects.length === 0) {
    await safeAnswerCb(ctx, 'На этот день ДЗ нет');
    await showCalendarForEdit(ctx, 0);
    return;
  }
  
  const rows = subjects.map(subject => [{
    text: subject,
    callback_data: `edit_subject_${subject}`
  }]);
  
  rows.push([{ text: TEXTS.buttons.back, callback_data: 'editHomework' }]);
  rows.push([{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]);
  
  const msg = `Редактирование ДЗ · ${data.date}\n\nВыбери предмет:`;
  const keyboard = { reply_markup: { inline_keyboard: rows } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

bot.action(/^edit_subject_(.+)$/, async (ctx) => {
  const subject = ctx.match[1];
  const data = getSessionData(ctx);
  await setSessionStep(ctx, 'edit_actions', { ...data, subject });
  await showEditActions(ctx);
});

async function showEditActions(ctx) {
  const data = getSessionData(ctx);
  const user = await getUserByTgId(ctx.from?.id);
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dayData = homework[data.date] || {};
  const task = dayData[data.subject];
  
  const text = typeof task === 'object' ? task.text : task;
  const hasPhoto = typeof task === 'object' && (task.photoId || (task.photoIds && task.photoIds.length > 0));
  
  let msg = `<b>Текущее ДЗ · ${data.subject} · ${data.date}</b>\n\n`;
  msg += text || '—';
  if (hasPhoto) {
    const photoCount = task.photoIds ? task.photoIds.length : 1;
    msg += `\n📷 фото: ${photoCount}`;
  }
  msg += '\n\nВведи отредактированное ДЗ или выбери действие кнопками.';
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Убрать фото', callback_data: 'edit_removePhoto' }],
        [{ text: 'Удалить полностью', callback_data: 'edit_deleteFully' }],
        [{ text: 'Перенести на другой день', callback_data: 'edit_moveDay' }],
        [{ text: 'Поменять предмет', callback_data: 'edit_changeSubject' }],
        [{ text: 'Ввести новое ДЗ', callback_data: 'edit_enterNew' }],
        [{ text: TEXTS.buttons.back, callback_data: 'edit_selectSubject' }],
        [{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Убрать фото
bot.action('edit_removePhoto', async (ctx) => {
  const data = getSessionData(ctx);
  const msg = `Подтверди удаление фото.\n\nДата: ${data.date}\nПредмет: ${data.subject}`;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.buttons.cancel, callback_data: 'edit_actions' }],
        [{ text: TEXTS.buttons.confirm, callback_data: 'confirmRemovePhoto' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

bot.action('confirmRemovePhoto', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  const data = getSessionData(ctx);
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dateKey = data.date;
  const subject = data.subject;
  
  if (homework[dateKey] && homework[dateKey][subject]) {
    const task = homework[dateKey][subject];
    if (typeof task === 'object') {
      delete task.photoId;
      delete task.photoIds;
      task.type = 'text';
    }
    
    await saveClassHomework(classKey, homework);
  }
  
  await setSessionStep(ctx, 'edit_actions', data);
  await showEditActions(ctx);
});

// Удалить полностью
bot.action('edit_deleteFully', async (ctx) => {
  const data = getSessionData(ctx);
  const msg = `Подтверди удаление ДЗ.\n\nДата: ${data.date}\nПредмет: ${data.subject}`;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.buttons.cancel, callback_data: 'edit_actions' }],
        [{ text: TEXTS.buttons.confirm, callback_data: 'confirmDeleteFully' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

bot.action('confirmDeleteFully', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  const data = getSessionData(ctx);
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dateKey = data.date;
  const subject = data.subject;
  
  if (homework[dateKey] && homework[dateKey][subject]) {
    delete homework[dateKey][subject];
    
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
        [{ text: 'Изменить ещё', callback_data: 'editHomework' }],
        [{ text: TEXTS.buttons.menu, callback_data: 'menu' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

// Перенести на другой день
bot.action('edit_moveDay', async (ctx) => {
  await showCalendarForMove(ctx, 0);
});

async function showCalendarForMove(ctx, weekOffset) {
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
    
    return { text: label, callback_data: `move_date_${date}` };
  }));
  
  const navRow = [];
  if (weekOffset > 0) {
    navRow.push({ text: '◀️', callback_data: `move_cal_${weekOffset - 1}` });
  }
  navRow.push({ text: formatDateShort(dates[0]), callback_data: 'noop' });
  if (weekOffset < 8) {
    navRow.push({ text: '▶️', callback_data: `move_cal_${weekOffset + 1}` });
  }
  rows.push(navRow);
  
  rows.push([{ text: TEXTS.buttons.back, callback_data: 'edit_actions' }]);
  rows.push([{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]);
  
  const msg = 'Выбери день для переноса ДЗ:';
  const keyboard = { reply_markup: { inline_keyboard: rows } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

bot.action(/^move_cal_(\d+)$/, async (ctx) => {
  const weekOffset = parseInt(ctx.match[1]);
  await showCalendarForMove(ctx, weekOffset);
});

bot.action(/^move_date_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const targetDate = ctx.match[1];
  const data = getSessionData(ctx);
  
  const msg = `Перенести ДЗ на ${targetDate}?\n\nПредмет: ${data.subject}`;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.buttons.back, callback_data: 'edit_actions' }],
        [{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }],
        [{ text: TEXTS.buttons.confirm, callback_data: `confirmMove_${targetDate}` }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

bot.action(/^confirmMove_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const targetDate = ctx.match[1];
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  const data = getSessionData(ctx);
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const sourceDate = data.date;
  const subject = data.subject;
  
  if (homework[sourceDate] && homework[sourceDate][subject]) {
    const task = homework[sourceDate][subject];
    
    if (!homework[targetDate]) homework[targetDate] = {};
    
    // Если на целевой дате уже есть ДЗ по этому предмету, объединяем
    homework[targetDate][subject] = mergeHomeworkTask(homework[targetDate][subject], task);
    
    // Удаляем из исходной даты
    delete homework[sourceDate][subject];
    if (Object.keys(homework[sourceDate]).length === 0) {
      delete homework[sourceDate];
    }
    
    await saveClassHomework(classKey, homework);
  }
  
  await clearSession(ctx);
  
  const msg = '✅ Успешно перенесено.';
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Изменить ещё', callback_data: 'editHomework' }],
        [{ text: TEXTS.buttons.menu, callback_data: 'menu' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

// Поменять предмет
bot.action('edit_changeSubject', async (ctx) => {
  const data = getSessionData(ctx);
  await setSessionStep(ctx, 'edit_newSubject', data);
  const msg = 'Выбери новый предмет:';
  const keyboard = subjectKeyboard(QUICK_SUBJECTS);
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

bot.action(/^subject_(\d+)$/, async (ctx) => {
  const index = parseInt(ctx.match[1]);
  const subjects = QUICK_SUBJECTS;
  const newSubject = subjects[index];
  
  if (!newSubject) return;
  
  const data = getSessionData(ctx);
  const oldSubject = data.subject;
  
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const dateKey = data.date;
  
  if (homework[dateKey] && homework[dateKey][oldSubject]) {
    homework[dateKey][newSubject] = homework[dateKey][oldSubject];
    delete homework[dateKey][oldSubject];
    
    await saveClassHomework(classKey, homework);
  }
  
  await clearSession(ctx);
  
  const msg = '✅ Предмет изменён.';
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Изменить ещё', callback_data: 'editHomework' }],
        [{ text: TEXTS.buttons.menu, callback_data: 'menu' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

// Ввести новое ДЗ
bot.action('edit_enterNew', async (ctx) => {
  const data = getSessionData(ctx);
  await setSessionStep(ctx, 'edit_enterNew', data);
  
  const user = await getUserByTgId(ctx.from?.id);
  const classKey = getClassKey(user);
  const homework = await getClassHomework(classKey);
  const task = homework[data.date]?.[data.subject];
  const oldText = typeof task === 'object' ? task.text : task;
  
  const msg = `Текущее ДЗ:\n${oldText || '—'}\n\nНапиши новый текст или отправь фото.`;
  const keyboard = { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.back, callback_data: 'edit_actions' }], [{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]] } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

// Обработка ввода нового ДЗ
bot.on('message', async (ctx) => {
  const step = getSessionData(ctx, 'step');
  
  if (step === 'edit_enterNew') {
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
    
    if (!homework[dateKey]) homework[dateKey] = {};
    homework[dateKey][subject] = taskContent;
    
    await saveClassHomework(classKey, homework);
    
    await clearSession(ctx);
    
    const msg = '✅ ДЗ обновлено.';
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Изменить ещё', callback_data: 'editHomework' }],
          [{ text: TEXTS.buttons.menu, callback_data: 'menu' }]
        ]
      }
    };
    
    await safeAnswerCb(ctx);
    await replyOrEdit(ctx, msg, keyboard);
  }
});
