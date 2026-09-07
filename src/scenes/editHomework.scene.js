const { Scenes } = require('telegraf');
const Homework = require('../models').Homework;
const User = require('../models').User;
const logger = require('../config/logger').child({ module: 'editHomework' });

/**
 * Сцена редактирования домашнего задания через WizardScene
 */
const editHomeworkWizard = new Scenes.WizardScene(
  'edit_homework',
  
  // Шаг 0: Выбор ДЗ для редактирования
  async (ctx) => {
    ctx.wizard.state.data = {};
    
    const user = await User.findOne({ telegramId: ctx.from.id }).lean();
    
    if (!user || (user.role !== 'admin' && user.role !== 'class_admin')) {
      await ctx.reply('❌ У вас нет прав для редактирования ДЗ.');
      return ctx.scene.leave();
    }
    
    // Получаем все ДЗ для класса пользователя
    const homeworks = await Homework.find({ classGrade: user.classGrade })
      .sort({ dueDate: 1 })
      .limit(10)
      .lean();
    
    if (homeworks.length === 0) {
      await ctx.reply('📭 Нет домашних заданий для редактирования.');
      return ctx.scene.leave();
    }
    
    const keyboard = homeworks.map(hw => [
      { 
        text: `${hw.subject} (${hw.dueDate.toLocaleDateString('ru-RU')})`, 
        callback_data: `edit_hw_${hw._id}` 
      }
    ]);
    
    await ctx.reply(
      '✏️ Выберите домашнее задание для редактирования:',
      { reply_markup: { inline_keyboard: keyboard } }
    );
    
    return ctx.wizard.next();
  },
  
  // Шаг 1: Ожидание выбора ДЗ
  async (ctx) => {
    // Этот шаг обрабатывается через bot.action('edit_hw_...')
    return ctx.wizard.next();
  },
  
  // Шаг 2: Выбор поля для редактирования
  async (ctx) => {
    const { homeworkId, homework } = ctx.wizard.state.data;
    
    await ctx.reply(
      `📚 Предмет: ${homework.subject}\n` +
      `📝 Задание: ${homework.task}\n` +
      `📅 Дата: ${homework.dueDate.toLocaleDateString('ru-RU')}\n\n` +
      'Что хотите изменить?',
      Markup.inlineKeyboard([
        ['✏️ Изменить предмет', 'edit_field_subject'],
        ['📝 Изменить задание', 'edit_field_task'],
        ['📅 Изменить дату', 'edit_field_date'],
        ['🗑 Удалить ДЗ', 'edit_field_delete']
      ])
    );
    
    return ctx.wizard.next();
  },
  
  // Шаг 3: Ввод нового значения
  async (ctx) => {
    const { fieldToEdit } = ctx.wizard.state.data;
    
    let promptText;
    switch (fieldToEdit) {
      case 'subject':
        promptText = 'Введите новое название предмета:';
        break;
      case 'task':
        promptText = 'Введите новый текст задания:';
        break;
      case 'date':
        promptText = 'Введите новую дату (ДД.ММ.ГГГГ) или "Завтра":';
        break;
      default:
        promptText = 'Произошла ошибка. Попробуйте снова.';
    }
    
    await ctx.reply(promptText);
    
    return ctx.wizard.next();
  },
  
  // Шаг 4: Сохранение изменений
  async (ctx) => {
    const { homeworkId, fieldToEdit } = ctx.wizard.state.data;
    const newValue = ctx.message?.text?.trim();
    
    if (!newValue) {
      await ctx.reply('❌ Введите значение:');
      return ctx.wizard.selectStep(4);
    }
    
    try {
      const updateData = {};
      
      if (fieldToEdit === 'subject') {
        updateData.subject = newValue;
      } else if (fieldToEdit === 'task') {
        updateData.task = newValue;
      } else if (fieldToEdit === 'date') {
        let dueDate;
        if (newValue.toLowerCase() === 'завтра') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          dueDate = tomorrow;
        } else {
          const dateMatch = newValue.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
          if (!dateMatch) {
            await ctx.reply('❌ Неверный формат даты. Используйте ДД.ММ.ГГГГ или "Завтра":');
            return ctx.wizard.selectStep(4);
          }
          
          const [, day, month, year] = dateMatch;
          dueDate = new Date(year, month - 1, day);
          
          if (isNaN(dueDate.getTime())) {
            await ctx.reply('❌ Некорректная дата.');
            return ctx.wizard.selectStep(4);
          }
        }
        updateData.dueDate = dueDate;
      }
      
      const homework = await Homework.findByIdAndUpdate(
        homeworkId,
        updateData,
        { new: true }
      );
      
      logger.info({ 
        userId: ctx.from.id, 
        homeworkId, 
        field: fieldToEdit,
        newValue 
      }, 'ДЗ обновлено');
      
      await ctx.reply(
        '✅ Домашнее задание обновлено!\n\n' +
        `📚 Предмет: ${homework.subject}\n` +
        `📝 Задание: ${homework.task}\n` +
        `📅 Дата: ${homework.dueDate.toLocaleDateString('ru-RU')}`
      );
      
      return ctx.scene.leave();
    } catch (error) {
      logger.error({ userId: ctx.from.id, error }, 'Ошибка при обновлении ДЗ');
      await ctx.reply('❌ Произошла ошибка при обновлении ДЗ.');
      return ctx.scene.leave();
    }
  }
);

// Обработчики inline-кнопок для сцены редактирования
function setupEditHomeworkHandlers(bot) {
  // Выбор ДЗ для редактирования
  bot.action(/^edit_hw_(.+)/, async (ctx) => {
    if (ctx.scene.current?.id !== 'edit_homework' || ctx.wizard.cursor < 1) {
      return ctx.answerCbQuery();
    }
    
    const homeworkId = ctx.match[1];
    const homework = await Homework.findById(homeworkId);
    
    if (!homework) {
      await ctx.answerCbQuery('❌ ДЗ не найдено.', { show_alert: true });
      return ctx.scene.leave();
    }
    
    ctx.wizard.state.data.homeworkId = homeworkId;
    ctx.wizard.state.data.homework = homework;
    ctx.wizard.selectStep(2);
    
    const Markup = require('telegraf').Markup;
    await ctx.editMessageText(
      `📚 Предмет: ${homework.subject}\n` +
      `📝 Задание: ${homework.task}\n` +
      `📅 Дата: ${homework.dueDate.toLocaleDateString('ru-RU')}\n\n` +
      'Что хотите изменить?',
      {
        reply_markup: Markup.inlineKeyboard([
          ['✏️ Изменить предмет', 'edit_field_subject'],
          ['📝 Изменить задание', 'edit_field_task'],
          ['📅 Изменить дату', 'edit_field_date'],
          ['🗑 Удалить ДЗ', 'edit_field_delete']
        ]).reply_markup
      }
    );
    
    return ctx.answerCbQuery();
  });
  
  // Выбор поля для редактирования
  bot.action(/^edit_field_(.+)/, async (ctx) => {
    if (ctx.scene.current?.id !== 'edit_homework' || ctx.wizard.cursor < 2) {
      return ctx.answerCbQuery();
    }
    
    const field = ctx.match[1];
    
    if (field === 'delete') {
      // Удаляем ДЗ
      try {
        await Homework.findByIdAndDelete(ctx.wizard.state.data.homeworkId);
        
        logger.info({ 
          userId: ctx.from.id, 
          homeworkId: ctx.wizard.state.data.homeworkId 
        }, 'ДЗ удалено');
        
        await ctx.editMessageText('✅ Домашнее задание удалено.');
        return ctx.scene.leave();
      } catch (error) {
        logger.error({ userId: ctx.from.id, error }, 'Ошибка при удалении ДЗ');
        await ctx.editMessageText('❌ Произошла ошибка при удалении ДЗ.');
        return ctx.scene.leave();
      }
    }
    
    ctx.wizard.state.data.fieldToEdit = field;
    ctx.wizard.selectStep(3);
    
    let promptText;
    switch (field) {
      case 'subject':
        promptText = 'Введите новое название предмета:';
        break;
      case 'task':
        promptText = 'Введите новый текст задания:';
        break;
      case 'date':
        promptText = 'Введите новую дату (ДД.ММ.ГГГГ) или "Завтра":';
        break;
    }
    
    await ctx.editMessageText(promptText);
    
    return ctx.answerCbQuery();
  });
}

const Markup = require('telegraf').Markup;

module.exports = {
  editHomeworkWizard,
  setupEditHomeworkHandlers
};
