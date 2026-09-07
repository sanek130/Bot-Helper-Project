const { Markup } = require('telegraf');
const User = require('../models').User;
const Homework = require('../models').Homework;
const logger = require('../config/logger').child({ module: 'mainMenuHandler' });

/**
 * Обработчик команды /start и главного меню
 */
async function handleStart(ctx) {
  try {
    const user = await User.findOne({ telegramId: ctx.from.id }).lean();
    
    // Если пользователь не найден - запускаем онбординг
    if (!user) {
      logger.info({ userId: ctx.from.id }, 'Новый пользователь, запуск онбординга');
      
      await ctx.reply(
        '👋 Добро пожаловать в школьный бот!\n\n' +
        'Похоже, вы ещё не зарегистрированы. Давайте начнём регистрацию:'
      );
      
      return ctx.scene.enter('onboarding');
    }
    
    // Обновляем last_active
    await User.updateOne(
      { telegramId: ctx.from.id },
      { $set: { 'stats.last_active': new Date() } }
    );
    
    // Формируем приветственное сообщение
    const greeting = getGreeting(user);
    const menuText = `${greeting}\n\nВыберите действие:`;
    
    // Отправляем главное меню с динамической клавиатурой
    const keyboard = require('../keyboards').buildMainMenu(
      user, 
      new Date(), 
      ctx.i18n.t.bind(ctx.i18n)
    );
    
    await ctx.reply(menuText, keyboard);
    
  } catch (error) {
    logger.error({ userId: ctx.from.id, error }, 'Ошибка в handleStart');
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

/**
 * Обработчик кнопки главного действия дня
 */
async function handleMainDayAction(ctx) {
  try {
    const user = await User.findOne({ telegramId: ctx.from.id }).lean();
    
    if (!user) {
      return ctx.answerCbQuery('❌ Пользователь не найден.', { show_alert: true });
    }
    
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;
    const isEvening = hour >= 16;
    
    let actionText, actionCallback;
    
    if (isWeekend) {
      actionText = 'Просмотр расписания на следующую неделю';
      actionCallback = 'schedule_week';
    } else if (isEvening) {
      actionText = 'Просмотр ДЗ на завтра';
      actionCallback = 'homework_tomorrow';
    } else {
      actionText = 'Просмотр расписания на сегодня';
      actionCallback = 'schedule_today';
    }
    
    await ctx.answerCbQuery(actionText);
    
    // Эмулируем нажатие соответствующей кнопки
    await ctx.editMessageText(`ℹ️ ${actionText}`);
    
  } catch (error) {
    logger.error({ userId: ctx.from.id, error }, 'Ошибка в handleMainDayAction');
    await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
  }
}

/**
 * Обработчик кнопки профиля
 */
async function handleProfile(ctx) {
  try {
    const user = await User.findOne({ telegramId: ctx.from.id }).lean();
    
    if (!user) {
      return ctx.answerCbQuery('❌ Пользователь не найден.', { show_alert: true });
    }
    
    // Получаем город и школу (если есть ссылки)
    let cityText = 'Не указан';
    let schoolText = 'Не указана';
    
    if (user.city) {
      const City = require('../models').City;
      const city = await City.findById(user.city).lean();
      if (city) cityText = city.name;
    }
    
    if (user.school) {
      const School = require('../models').School;
      const school = await School.findById(user.school).lean();
      if (school) schoolText = school.name;
    }
    
    const profileText = `👤 Профиль пользователя\n\n` +
      `📛 ФИО: ${user.fullName}\n` +
      `🏙 Город: ${cityText}\n` +
      `🏫 Школа: ${schoolText}\n` +
      `📖 Класс: ${user.classGrade}\n` +
      `🎭 Роль: ${getRoleName(user.role)}\n` +
      `🌍 Часовой пояс: ${user.timezone || 'Europe/Moscow'}\n` +
      `🔔 Уведомления: ${user.notifications_enabled ? '✅ Вкл' : '❌ Выкл'}`;
    
    const keyboard = require('../keyboards').getProfileMenu(ctx.i18n.t.bind(ctx.i18n));
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(profileText, { reply_markup: keyboard.reply_markup });
    } else {
      await ctx.reply(profileText, keyboard);
    }
    
  } catch (error) {
    logger.error({ userId: ctx.from.id, error }, 'Ошибка в handleProfile');
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
    } else {
      await ctx.reply('❌ Произошла ошибка.');
    }
  }
}

/**
 * Обработчик кнопки настроек
 */
async function handleSettings(ctx) {
  try {
    const settingsText = '⚙️ Настройки\n\n' +
      'Здесь вы можете изменить язык интерфейса,\n' +
      'время напоминаний о ДЗ и другие параметры.';
    
    const keyboard = require('../keyboards').getSettingsMenu(ctx.i18n.t.bind(ctx.i18n));
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(settingsText, { reply_markup: keyboard.reply_markup });
    } else {
      await ctx.reply(settingsText, keyboard);
    }
    
  } catch (error) {
    logger.error({ userId: ctx.from.id, error }, 'Ошибка в handleSettings');
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
    } else {
      await ctx.reply('❌ Произошла ошибка.');
    }
  }
}

/**
 * Обработчик кнопки админ-панели
 */
async function handleAdminPanel(ctx) {
  try {
    const user = await User.findOne({ telegramId: ctx.from.id }).lean();
    
    if (!user || (user.role !== 'admin' && user.role !== 'class_admin')) {
      return ctx.answerCbQuery('❌ Недостаточно прав.', { show_alert: true });
    }
    
    const adminText = '🛠 Панель управления\n\n' +
      'Выберите действие:';
    
    const keyboard = require('../keyboards').getAdminMenu(ctx.i18n.t.bind(ctx.i18n));
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(adminText, { reply_markup: keyboard.reply_markup });
    } else {
      await ctx.reply(adminText, keyboard);
    }
    
  } catch (error) {
    logger.error({ userId: ctx.from.id, error }, 'Ошибка в handleAdminPanel');
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
    } else {
      await ctx.reply('❌ Произошла ошибка.');
    }
  }
}

/**
 * Обработчик кнопки "Назад"
 */
async function handleBackToMain(ctx) {
  try {
    const user = await User.findOne({ telegramId: ctx.from.id }).lean();
    
    if (!user) {
      return ctx.scene.enter('onboarding');
    }
    
    const menuText = '📱 Главное меню\n\nВыберите действие:';
    const keyboard = require('../keyboards').buildMainMenu(
      user, 
      new Date(), 
      ctx.i18n.t.bind(ctx.i18n)
    );
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(menuText, { reply_markup: keyboard.reply_markup });
    } else {
      await ctx.reply(menuText, keyboard);
    }
    
  } catch (error) {
    logger.error({ userId: ctx.from.id, error }, 'Ошибка в handleBackToMain');
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
    }
  }
}

/**
 * Получить приветствие в зависимости от времени суток
 */
function getGreeting(user) {
  const hour = new Date().getHours();
  
  let greeting;
  if (hour >= 5 && hour < 12) {
    greeting = 'Доброе утро';
  } else if (hour >= 12 && hour < 18) {
    greeting = 'Добрый день';
  } else if (hour >= 18 && hour < 23) {
    greeting = 'Добрый вечер';
  } else {
    greeting = 'Доброй ночи';
  }
  
  const firstName = user.fullName.split(' ')[0];
  return `${greeting}, ${firstName}!`;
}

/**
 * Получить название роли
 */
function getRoleName(role) {
  const roleNames = {
    student: 'Ученик',
    class_admin: 'Классный руководитель',
    admin: 'Администратор'
  };
  return roleNames[role] || role;
}

module.exports = {
  handleStart,
  handleMainDayAction,
  handleProfile,
  handleSettings,
  handleAdminPanel,
  handleBackToMain
};
