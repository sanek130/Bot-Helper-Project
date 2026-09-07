const homeworkService = require('../services/homework.service');
const User = require('../models').User;
const logger = require('../config/logger').child({ module: 'homeworkHandler' });

/**
 * Обработчик кнопки "Все ДЗ"
 */
async function handleAllHomework(ctx) {
  try {
    const user = await User.findOne({ telegramId: ctx.from.id }).lean();
    
    if (!user) {
      return ctx.answerCbQuery('❌ Пользователь не найден.', { show_alert: true });
    }
    
    const { homeworks, classGrade, total } = await homeworkService.getClassHomework(
      ctx.from.id,
      { activeOnly: true, limit: 20 }
    );
    
    if (homeworks.length === 0) {
      const message = `📚 Домашнее задание для ${classGrade}\n\n` +
        '✅ На данный момент нет активных домашних заданий.';
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message);
      } else {
        await ctx.reply(message);
      }
      return;
    }
    
    // Формируем сообщение со списком ДЗ
    let message = `📚 Домашнее задание для ${classGrade}\n\n`;
    
    // Группируем по датам
    const groupedByDate = homeworks.reduce((acc, hw) => {
      const dateKey = hw.dueDate.toLocaleDateString('ru-RU');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(hw);
      return acc;
    }, {});
    
    for (const [date, hws] of Object.entries(groupedByDate)) {
      message += `📅 ${date}\n`;
      for (const hw of hws) {
        const icon = getSubjectIcon(hw.subject);
        message += `${icon} ${hw.subject}: ${truncateText(hw.task, 50)}\n`;
      }
      message += '\n';
    }
    
    message += `Всего: ${total} зад.`;
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message);
    } else {
      await ctx.reply(message);
    }
    
  } catch (error) {
    logger.error({ userId: ctx.from.id, error }, 'Ошибка в handleAllHomework');
    const errorMsg = ctx.callbackQuery ? 
      '❌ Ошибка при загрузке ДЗ' : 
      '❌ Произошла ошибка при загрузке ДЗ.';
    
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery(errorMsg, { show_alert: true });
    } else {
      await ctx.reply(errorMsg);
    }
  }
}

/**
 * Обработчик просмотра ДЗ на конкретный день
 */
async function handleHomeworkByDay(ctx, dayIndex) {
  try {
    const user = await User.findOne({ telegramId: ctx.from.id }).lean();
    
    if (!user) {
      return ctx.answerCbQuery('❌ Пользователь не найден.', { show_alert: true });
    }
    
    // Вычисляем дату для дня недели (1 = понедельник, 7 = воскресенье)
    const today = new Date();
    const currentDay = today.getDay() || 7; // Преобразуем воскресенье из 0 в 7
    const diff = dayIndex - currentDay;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + diff);
    
    const { homeworks } = await homeworkService.getClassHomework(ctx.from.id, {
      date: targetDate,
      limit: 20
    });
    
    const dateStr = targetDate.toLocaleDateString('ru-RU', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    if (homeworks.length === 0) {
      const message = `📅 ${capitalizeFirst(dateStr)}\n\n` +
        '✅ Домашних заданий нет.';
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message);
      } else {
        await ctx.reply(message);
      }
      return;
    }
    
    let message = `📅 ${capitalizeFirst(dateStr)}\n\n`;
    
    for (const hw of homeworks) {
      const icon = getSubjectIcon(hw.subject);
      message += `${icon} *${hw.subject}*\n`;
      message += `${hw.task}\n`;
      
      if (hw.attachments && hw.attachments.length > 0) {
        message += `📎 Вложений: ${hw.attachments.length}\n`;
      }
      message += '\n';
    }
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(message, { parse_mode: 'Markdown' });
    }
    
  } catch (error) {
    logger.error({ userId: ctx.from.id, error }, 'Ошибка в handleHomeworkByDay');
    const errorMsg = ctx.callbackQuery ? 
      '❌ Ошибка при загрузке ДЗ' : 
      '❌ Произошла ошибка.';
    
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery(errorMsg, { show_alert: true });
    } else {
      await ctx.reply(errorMsg);
    }
  }
}

/**
 * Обработчик добавления ДЗ (для админов)
 */
async function handleAddHomework(ctx) {
  try {
    const user = await User.findOne({ telegramId: ctx.from.id }).lean();
    
    if (!user || (user.role !== 'admin' && user.role !== 'class_admin')) {
      return ctx.answerCbQuery('❌ Недостаточно прав.', { show_alert: true });
    }
    
    // Запускаем сцену добавления ДЗ
    return ctx.scene.enter('add_homework');
    
  } catch (error) {
    logger.error({ userId: ctx.from.id, error }, 'Ошибка в handleAddHomework');
    await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
  }
}

/**
 * Обработчик редактирования ДЗ (для админов)
 */
async function handleEditHomework(ctx) {
  try {
    const user = await User.findOne({ telegramId: ctx.from.id }).lean();
    
    if (!user || (user.role !== 'admin' && user.role !== 'class_admin')) {
      return ctx.answerCbQuery('❌ Недостаточно прав.', { show_alert: true });
    }
    
    // Запускаем сцену редактирования ДЗ
    return ctx.scene.enter('edit_homework');
    
  } catch (error) {
    logger.error({ userId: ctx.from.id, error }, 'Ошибка в handleEditHomework');
    await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
  }
}

/**
 * Получить иконку предмета
 */
function getSubjectIcon(subject) {
  const icons = {
    'математика': '📐',
    'алгебра': '📐',
    'геометрия': '📐',
    'физика': '⚡',
    'химия': '🧪',
    'биология': '🧬',
    'история': '📜',
    'география': '🌍',
    'русский': '📝',
    'литература': '📚',
    'язык': '🗣',
    'english': '🇬🇧',
    'информатика': '💻',
    'физкультура': '⚽',
    'музыка': '🎵',
    'рисование': '🎨',
    'труд': '🔧',
    'обж': '🚨',
    'общество': '👥'
  };
  
  const lowerSubject = subject.toLowerCase();
  for (const [key, icon] of Object.entries(icons)) {
    if (lowerSubject.includes(key)) {
      return icon;
    }
  }
  
  return '📖'; // Иконка по умолчанию
}

/**
 * Обрезать текст до указанной длины
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
  handleAllHomework,
  handleHomeworkByDay,
  handleAddHomework,
  handleEditHomework
};
