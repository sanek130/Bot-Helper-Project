const { Scenes } = require('telegraf');
const { Composer } = require('telegraf');
const { z } = require('zod');
const { buildMainMenu, getBackKeyboard } = require('../keyboards');
const { getGradeKeyboard, getLetterKeyboard, getConfirmKeyboard, getAddCustomButton } = require('../keyboards/inline');
const { validateFullName } = require('../utils/validators');
const User = require('../models').User;
const City = require('../models').City;
const School = require('../models').School;
const logger = require('../config/logger').child({ module: 'onboarding' });

/**
 * Сцена онбординга пользователя через WizardScene
 */
const onboardingWizard = new Scenes.WizardScene(
  'onboarding',
  
  // Шаг 0: Приветствие и запрос ФИО
  async (ctx) => {
    ctx.wizard.state.data = {};
    await ctx.reply(
      '👋 Добро пожаловать в школьный бот!\n\n' +
      'Для начала давайте познакомимся. Напишите ваше ФИО полностью:',
      getBackKeyboard(ctx.i18n.t.bind(ctx.i18n))
    );
    return ctx.wizard.next();
  },
  
  // Шаг 1: Ввод ФИО с валидацией
  async (ctx) => {
    const fullName = ctx.message?.text?.trim();
    
    if (!fullName) {
      await ctx.reply('❌ Пожалуйста, введите ваше ФИО.');
      return ctx.wizard.selectStep(1);
    }
    
    const validation = validateFullName(fullName);
    if (!validation.success) {
      await ctx.reply(`❌ ${validation.error}\n\nПожалуйста, введите корректное ФИО (только буквы, пробелы и дефис):`);
      return ctx.wizard.selectStep(1);
    }
    
    ctx.wizard.state.data.fullName = fullName;
    logger.info({ userId: ctx.from.id, fullName }, 'ФИО сохранено');
    
    await ctx.reply(
      `✅ Принято: ${fullName}\n\nТеперь выберите ваш город:`,
      getAddCustomButton('Добавить свой город', 'city_add_custom')
    );
    
    // Загружаем список городов
    const cities = await City.find({ status: 'approved' }).limit(20).lean();
    if (cities.length > 0) {
      const keyboard = cities.map(city => 
        [Composer.optional(
          () => true,
          { text: city.name, callback_data: `city_${city._id}` }
        )]
      );
      await ctx.editMessageText(
        `✅ Принято: ${fullName}\n\nТеперь выберите ваш город:`,
        { reply_markup: { inline_keyboard: keyboard } }
      );
    }
    
    return ctx.wizard.next();
  },
  
  // Шаг 2: Выбор города
  async (ctx) => {
    // Этот шаг обрабатывается через bot.action('city_...')
    // Здесь просто ждём выбора
    return ctx.wizard.next();
  },
  
  // Шаг 3: Выбор школы
  async (ctx) => {
    const { cityId, cityName } = ctx.wizard.state.data;
    
    await ctx.reply(
      `🏫 Город: ${cityName}\n\nВыберите вашу школу:`,
      getAddCustomButton('Добавить свою школу', 'school_add_custom')
    );
    
    const schools = await School.find({ city: cityId, status: 'approved' }).limit(20).lean();
    if (schools.length > 0) {
      const keyboard = schools.map(school => 
        [{ text: school.name, callback_data: `school_${school._id}` }]
      );
      await ctx.editMessageText(
        `🏫 Город: ${cityName}\n\nВыберите вашу школу:`,
        { reply_markup: { inline_keyboard: keyboard } }
      );
    }
    
    return ctx.wizard.next();
  },
  
  // Шаг 4: Выбор параллели класса (1-11)
  async (ctx) => {
    const { schoolId, schoolName } = ctx.wizard.state.data;
    ctx.wizard.state.data.school = schoolId;
    
    await ctx.reply(
      `📚 Школа: ${schoolName}\n\nВыберите параллель вашего класса:`,
      getGradeKeyboard()
    );
    
    return ctx.wizard.next();
  },
  
  // Шаг 5: Выбор буквы класса
  async (ctx) => {
    const { grade } = ctx.wizard.state.data;
    
    // Получаем существующие буквы для этой школы и параллели
    const existingClasses = await User.find({ 
      school: ctx.wizard.state.data.school,
      classGrade: new RegExp(`^${grade}`) 
    }).distinct('classGrade').lean();
    
    const existingLetters = existingClasses.map(c => c.replace(grade, ''));
    
    await ctx.reply(
      `📖 Параллель: ${grade}\n\nВыберите букву класса:`,
      getLetterKeyboard(existingLetters)
    );
    
    return ctx.wizard.next();
  },
  
  // Шаг 6: Выбор роли
  async (ctx) => {
    const { letter } = ctx.wizard.state.data;
    ctx.wizard.state.data.classGrade = `${ctx.wizard.state.data.grade}${letter}`;
    
    await ctx.reply(
      `🎓 Ваш класс: ${ctx.wizard.state.data.classGrade}\n\nВыберите вашу роль:`,
      Markup.inlineKeyboard([
        ['👨‍🎓 Ученик', 'role_student'],
        ['👩‍🏫 Классный руководитель', 'role_class_admin']
      ])
    );
    
    return ctx.wizard.next();
  },
  
  // Шаг 7: Часовой пояс
  async (ctx) => {
    const { role } = ctx.wizard.state.data;
    ctx.wizard.state.data.role = role === 'role_class_admin' ? 'class_admin' : 'student';
    
    await ctx.reply(
      '🌍 Выберите часовой пояс:\n\n' +
      'Можете отправить геолокацию для автоопределения,\n' +
      'или выберите из списка:',
      Markup.inlineKeyboard([
        ['🇷🇺 Москва (UTC+3)', 'tz_europe_moscow'],
        ['🇷🇺 СПб (UTC+3)', 'tz_europe_moscow'],
        ['🇷🇺 Екатеринбург (UTC+5)', 'tz_asia_yekaterinburg'],
        ['🇷🇺 Новосибирск (UTC+7)', 'tz_asia_novosibirsk'],
        ['🇷🇺 Владивосток (UTC+10)', 'tz_asia_vladivostok'],
        ['🇰🇿 Алматы (UTC+5)', 'tz_asia_almaty'],
        ['🇧🇾 Минск (UTC+3)', 'tz_europe_minsk']
      ])
    );
    
    return ctx.wizard.next();
  },
  
  // Шаг 8: Подтверждение
  async (ctx) => {
    const { fullName, cityName, schoolName, classGrade, role, timezone } = ctx.wizard.state.data;
    
    const summary = `📋 Проверьте данные:\n\n` +
      `👤 ФИО: ${fullName}\n` +
      `🏙 Город: ${cityName}\n` +
      `🏫 Школа: ${schoolName}\n` +
      `📖 Класс: ${classGrade}\n` +
      `🎭 Роль: ${role === 'class_admin' ? 'Классный руководитель' : 'Ученик'}\n` +
      `🌍 Часовой пояс: ${timezone || 'Europe/Moscow'}\n\n` +
      `Всё верно?`;
    
    await ctx.reply(summary, getConfirmKeyboard());
    
    return ctx.wizard.next();
  },
  
  // Шаг 9: Финализация - сохранение в БД
  async (ctx) => {
    const { fullName, cityId, schoolId, classGrade, role, timezone } = ctx.wizard.state.data;
    
    try {
      // Проверяем, нет ли уже пользователя с таким telegramId
      const existingUser = await User.findOne({ telegramId: ctx.from.id });
      
      if (existingUser) {
        await ctx.reply('⚠️ Вы уже зарегистрированы в системе.');
        return ctx.scene.leave();
      }
      
      // Создаём нового пользователя
      const user = new User({
        telegramId: ctx.from.id,
        fullName,
        city: cityId,
        school: schoolId,
        classGrade,
        role,
        timezone: timezone || 'Europe/Moscow',
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name
      });
      
      await user.save();
      
      logger.info({ userId: ctx.from.id, user }, 'Пользователь зарегистрирован');
      
      await ctx.reply(
        `🎉 Регистрация завершена!\n\n` +
        `Добро пожаловать, ${fullName}!\n\n` +
        `Теперь вы можете пользоваться всеми функциями бота.`,
        buildMainMenu(user, new Date(), ctx.i18n.t.bind(ctx.i18n))
      );
      
      return ctx.scene.leave();
    } catch (error) {
      logger.error({ userId: ctx.from.id, error }, 'Ошибка при регистрации');
      await ctx.reply('❌ Произошла ошибка при регистрации. Попробуйте позже или обратитесь к администратору.');
      return ctx.scene.leave();
    }
  }
);

// Обработчики inline-кнопок для онбординга
function setupOnboardingHandlers(bot) {
  // Выбор города
  bot.action(/^city_(.+)/, async (ctx) => {
    if (ctx.scene.current?.id !== 'onboarding' || ctx.wizard.cursor < 2) {
      return ctx.answerCbQuery();
    }
    
    const cityId = ctx.match[1];
    const city = await City.findById(cityId);
    
    if (city) {
      ctx.wizard.state.data.cityId = cityId;
      ctx.wizard.state.data.cityName = city.name;
      ctx.wizard.selectStep(3); // Переход к шагу выбора школы
      
      const schools = await School.find({ city: cityId, status: 'approved' }).limit(20).lean();
      let keyboard = [];
      if (schools.length > 0) {
        keyboard = schools.map(school => 
          [{ text: school.name, callback_data: `school_${school._id}` }]
        );
      }
      keyboard.push([{ text: '➕ Добавить свою школу', callback_data: 'school_add_custom' }]);
      
      await ctx.editMessageText(
        `🏫 Город: ${city.name}\n\nВыберите вашу школу:`,
        { reply_markup: { inline_keyboard: keyboard } }
      );
    }
    
    return ctx.answerCbQuery();
  });
  
  // Добавление своего города
  bot.action('city_add_custom', async (ctx) => {
    if (ctx.scene.current?.id !== 'onboarding' || ctx.wizard.cursor < 2) {
      return ctx.answerCbQuery();
    }
    
    await ctx.reply('✏️ Введите название вашего города:');
    ctx.wizard.state.data.awaitingCustomCity = true;
    return ctx.answerCbQuery();
  });
  
  // Выбор школы
  bot.action(/^school_(.+)/, async (ctx) => {
    if (ctx.scene.current?.id !== 'onboarding' || ctx.wizard.cursor < 3) {
      return ctx.answerCbQuery();
    }
    
    const schoolId = ctx.match[1];
    const school = await School.findById(schoolId);
    
    if (school) {
      ctx.wizard.state.data.schoolId = schoolId;
      ctx.wizard.state.data.schoolName = school.name;
      ctx.wizard.selectStep(4); // Переход к шагу выбора параллели
      
      await ctx.editMessageText(
        `📚 Школа: ${school.name}\n\nВыберите параллель вашего класса:`,
        { reply_markup: getGradeKeyboard().reply_markup }
      );
    }
    
    return ctx.answerCbQuery();
  });
  
  // Добавление своей школы
  bot.action('school_add_custom', async (ctx) => {
    if (ctx.scene.current?.id !== 'onboarding' || ctx.wizard.cursor < 3) {
      return ctx.answerCbQuery();
    }
    
    await ctx.reply('✏️ Введите название вашей школы:');
    ctx.wizard.state.data.awaitingCustomSchool = true;
    return ctx.answerCbQuery();
  });
  
  // Выбор параллели
  bot.action(/^grade_(\d+)/, async (ctx) => {
    if (ctx.scene.current?.id !== 'onboarding' || ctx.wizard.cursor < 4) {
      return ctx.answerCbQuery();
    }
    
    ctx.wizard.state.data.grade = ctx.match[1];
    ctx.wizard.selectStep(5); // Переход к шагу выбора буквы
    
    const existingClasses = await User.find({ 
      school: ctx.wizard.state.data.schoolId,
      classGrade: new RegExp(`^${ctx.match[1]}`) 
    }).distinct('classGrade').lean();
    
    const existingLetters = existingClasses.map(c => c.replace(ctx.match[1], ''));
    
    await ctx.editMessageText(
      `📖 Параллель: ${ctx.match[1]}\n\nВыберите букву класса:`,
      { reply_markup: getLetterKeyboard(existingLetters).reply_markup }
    );
    
    return ctx.answerCbQuery();
  });
  
  // Выбор буквы класса
  bot.action(/^letter_(.+)/, async (ctx) => {
    if (ctx.scene.current?.id !== 'onboarding' || ctx.wizard.cursor < 5) {
      return ctx.answerCbQuery();
    }
    
    ctx.wizard.state.data.letter = ctx.match[1];
    ctx.wizard.selectStep(6); // Переход к шагу выбора роли
    
    await ctx.editMessageText(
      `🎓 Ваш класс: ${ctx.wizard.state.data.grade}${ctx.match[1]}\n\nВыберите вашу роль:`,
      {
        reply_markup: Markup.inlineKeyboard([
          ['👨‍🎓 Ученик', 'role_student'],
          ['👩‍🏫 Классный руководитель', 'role_class_admin']
        ]).reply_markup
      }
    );
    
    return ctx.answerCbQuery();
  });
  
  // Выбор роли
  bot.action(/^role_(.+)/, async (ctx) => {
    if (ctx.scene.current?.id !== 'onboarding' || ctx.wizard.cursor < 6) {
      return ctx.answerCbQuery();
    }
    
    ctx.wizard.state.data.role = ctx.match[1];
    ctx.wizard.selectStep(7); // Переход к шагу часового пояса
    
    await ctx.editMessageText(
      '🌍 Выберите часовой пояс:\n\n' +
      'Можете отправить геолокацию для автоопределения,\n' +
      'или выберите из списка:',
      {
        reply_markup: Markup.inlineKeyboard([
          ['🇷🇺 Москва (UTC+3)', 'tz_europe_moscow'],
          ['🇷🇺 СПб (UTC+3)', 'tz_europe_moscow'],
          ['🇷🇺 Екатеринбург (UTC+5)', 'tz_asia_yekaterinburg'],
          ['🇷🇺 Новосибирск (UTC+7)', 'tz_asia_novosibirsk'],
          ['🇷🇺 Владивосток (UTC+10)', 'tz_asia_vladivostok'],
          ['🇰🇿 Алматы (UTC+5)', 'tz_asia_almaty'],
          ['🇧🇾 Минск (UTC+3)', 'tz_europe_minsk']
        ]).reply_markup
      }
    );
    
    return ctx.answerCbQuery();
  });
  
  // Выбор часового пояса
  bot.action(/^tz_(.+)/, async (ctx) => {
    if (ctx.scene.current?.id !== 'onboarding' || ctx.wizard.cursor < 7) {
      return ctx.answerCbQuery();
    }
    
    const tzMap = {
      'europe_moscow': 'Europe/Moscow',
      'asia_yekaterinburg': 'Asia/Yekaterinburg',
      'asia_novosibirsk': 'Asia/Novosibirsk',
      'asia_vladivostok': 'Asia/Vladivostok',
      'asia_almaty': 'Asia/Almaty',
      'europe_minsk': 'Europe/Minsk'
    };
    
    ctx.wizard.state.data.timezone = tzMap[ctx.match[1]] || 'Europe/Moscow';
    ctx.wizard.selectStep(8); // Переход к шагу подтверждения
    
    const { fullName, cityName, schoolName, classGrade, role } = ctx.wizard.state.data;
    const classGradeFull = `${ctx.wizard.state.data.grade}${ctx.wizard.state.data.letter}`;
    
    const summary = `📋 Проверьте данные:\n\n` +
      `👤 ФИО: ${fullName}\n` +
      `🏙 Город: ${cityName}\n` +
      `🏫 Школа: ${schoolName}\n` +
      `📖 Класс: ${classGradeFull}\n` +
      `🎭 Роль: ${role === 'class_admin' ? 'Классный руководитель' : 'Ученик'}\n` +
      `🌍 Часовой пояс: ${ctx.wizard.state.data.timezone}\n\n` +
      `Всё верно?`;
    
    await ctx.editMessageText(summary, {
      reply_markup: getConfirmKeyboard().reply_markup
    });
    
    return ctx.answerCbQuery();
  });
  
  // Подтверждение регистрации
  bot.action('confirm_yes', async (ctx) => {
    if (ctx.scene.current?.id !== 'onboarding' || ctx.wizard.cursor < 8) {
      return ctx.answerCbQuery();
    }
    
    ctx.wizard.selectStep(9); // Переход к финальному шагу
    await ctx.wizard.next();
    
    return ctx.answerCbQuery();
  });
  
  // Исправить данные - возврат на шаг подтверждения
  bot.action('back_to_main', async (ctx) => {
    if (ctx.scene.current?.id !== 'onboarding') {
      return ctx.answerCbQuery();
    }
    
    // Возвращаем на шаг 8 (подтверждение) для повторного просмотра
    ctx.wizard.selectStep(8);
    await ctx.reply('Вы можете исправить данные на предыдущих шагах.');
    
    return ctx.answerCbQuery();
  });
}

module.exports = {
  onboardingWizard,
  setupOnboardingHandlers
};
