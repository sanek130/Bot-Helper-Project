const { Scenes } = require('telegraf');
const Homework = require('../models').Homework;
const User = require('../models').User;
const logger = require('../config/logger').child({ module: 'addHomework' });

/**
 * Сцена добавления домашнего задания через WizardScene
 */
const addHomeworkWizard = new Scenes.WizardScene(
  'add_homework',
  
  // Шаг 0: Инициализация данных
  async (ctx) => {
    ctx.wizard.state.data = {
      attachments: []
    };
    
    await ctx.reply(
      '📚 Добавление домашнего задания\n\n' +
      'Введите предмет:',
      { reply_markup: { force_reply: true } }
    );
    
    return ctx.wizard.next();
  },
  
  // Шаг 1: Ввод предмета
  async (ctx) => {
    const subject = ctx.message?.text?.trim() || ctx.update?.message?.text?.trim();
    
    if (!subject) {
      await ctx.reply('❌ Пожалуйста, введите название предмета:');
      return ctx.wizard.selectStep(1);
    }
    
    ctx.wizard.state.data.subject = subject;
    logger.info({ userId: ctx.from.id, subject }, 'Предмет сохранён');
    
    await ctx.reply(
      `✅ Предмет: ${subject}\n\n` +
      'Теперь введите задание (текст):',
      { reply_markup: { force_reply: true } }
    );
    
    return ctx.wizard.next();
  },
  
  // Шаг 2: Ввод текста задания
  async (ctx) => {
    const taskText = ctx.message?.text?.trim() || ctx.update?.message?.text?.trim();
    
    if (!taskText) {
      await ctx.reply('❌ Пожалуйста, введите текст задания:');
      return ctx.wizard.selectStep(2);
    }
    
    ctx.wizard.state.data.taskText = taskText;
    
    await ctx.reply(
      `✅ Задание принято.\n\n` +
      'Укажите дату сдачи (ДД.ММ.ГГГГ) или выберите "Завтра":',
      { reply_markup: { force_reply: true } }
    );
    
    return ctx.wizard.next();
  },
  
  // Шаг 3: Ввод даты сдачи
  async (ctx) => {
    const dateInput = ctx.message?.text?.trim();
    
    if (!dateInput) {
      await ctx.reply('❌ Пожалуйста, введите дату:');
      return ctx.wizard.selectStep(3);
    }
    
    // Парсим дату
    let dueDate;
    if (dateInput.toLowerCase() === 'завтра') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dueDate = tomorrow;
    } else {
      const dateMatch = dateInput.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (!dateMatch) {
        await ctx.reply('❌ Неверный формат даты. Используйте ДД.ММ.ГГГГ или "Завтра":');
        return ctx.wizard.selectStep(3);
      }
      
      const [, day, month, year] = dateMatch;
      dueDate = new Date(year, month - 1, day);
      
      if (isNaN(dueDate.getTime())) {
        await ctx.reply('❌ Некорректная дата. Проверьте значения:');
        return ctx.wizard.selectStep(3);
      }
    }
    
    ctx.wizard.state.data.dueDate = dueDate;
    
    await ctx.reply(
      `✅ Дата: ${dueDate.toLocaleDateString('ru-RU')}\n\n` +
      'Прикрепите фото/файл с заданием (или отправьте "Пропустить"):');
    
    return ctx.wizard.next();
  },
  
  // Шаг 4: Загрузка вложений
  async (ctx) => {
    // Проверяем, есть ли вложение
    const photo = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id;
    const document = ctx.message?.document?.file_id;
    const skipText = ctx.message?.text?.toLowerCase();
    
    if (skipText && skipText.includes('пропустить')) {
      // Пропускаем вложение
      return finalizeHomework(ctx);
    }
    
    if (photo) {
      ctx.wizard.state.data.attachments.push({
        type: 'photo',
        file_id: photo
      });
      
      await ctx.reply(
        '✅ Фото принято. Можете отправить ещё одно или написать "Готово":'
      );
      return ctx.wizard.selectStep(4);
    }
    
    if (document) {
      ctx.wizard.state.data.attachments.push({
        type: 'document',
        file_id: document
      });
      
      await ctx.reply(
        '✅ Файл принят. Можете отправить ещё один или написать "Готово":'
      );
      return ctx.wizard.selectStep(4);
    }
    
    // Если ничего не пришло, спрашиваем снова
    await ctx.reply(
      '❌ Не удалось распознать вложение.\n\n' +
      'Отправьте фото/файл или напишите "Пропустить":'
    );
    
    return ctx.wizard.selectStep(4);
  }
);

/**
 * Финализация создания ДЗ
 */
async function finalizeHomework(ctx) {
  const { subject, taskText, dueDate, attachments } = ctx.wizard.state.data;
  
  try {
    // Получаем пользователя для определения класса
    const user = await User.findOne({ telegramId: ctx.from.id });
    
    if (!user) {
      await ctx.reply('❌ Пользователь не найден. Пройдите регистрацию.');
      return ctx.scene.leave();
    }
    
    // Создаём домашнее задание
    const homework = new Homework({
      classGrade: user.classGrade,
      subject,
      task: taskText,
      dueDate,
      attachments,
      postedBy: ctx.from.id
    });
    
    await homework.save();
    
    logger.info({ 
      userId: ctx.from.id, 
      homeworkId: homework._id,
      subject,
      classGrade: user.classGrade
    }, 'ДЗ создано');
    
    await ctx.reply(
      '✅ Домашнее задание успешно добавлено!\n\n' +
      `📚 Предмет: ${subject}\n` +
      `📅 Дата сдачи: ${dueDate.toLocaleDateString('ru-RU')}\n` +
      `📎 Вложений: ${attachments.length}`
    );
    
    return ctx.scene.leave();
  } catch (error) {
    logger.error({ userId: ctx.from.id, error }, 'Ошибка при создании ДЗ');
    await ctx.reply('❌ Произошла ошибка при сохранении ДЗ. Попробуйте позже.');
    return ctx.scene.leave();
  }
}

module.exports = {
  addHomeworkWizard
};
