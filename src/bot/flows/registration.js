import bot, { replyOrEdit, safeAnswerCb, setSessionStep, getSessionData, clearSession } from '../bot.js';
import { TEXTS } from '../texts.js';
import { 
  notRegisteredKeyboard, 
  registrationSuccessKeyboard, 
  regStep1Keyboard, 
  regStep2Keyboard, 
  regStep3LetterKeyboard, 
  regStep3NumberKeyboard, 
  regStep4Keyboard, 
  regStep5Keyboard,
  reRegisterWarningKeyboard
} from '../keyboards.js';
import { getUserByTgId, createUser, updateUser } from '../../services/userService.js';
import { getCities, findCity, suggestCity, getSchoolsForCity, getRegisteredSchoolsForCity, mergeSchoolOptions, findSchool } from '../../services/searchService.js';
import { sanitizeSchoolName } from '../../utils/normalize.js';
import config from '../../config.js';

// Команда /start
bot.command('start', async (ctx) => {
  await showStart(ctx);
});

bot.action('reg_step1', async (ctx) => {
  await showRegStep1(ctx);
});

bot.action('fullList', async (ctx) => {
  await showFullCityList(ctx);
});

async function showStart(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  const firstName = ctx.from?.first_name || 'друг';
  
  if (user) {
    const msg = `<b>${TEXTS.welcome.returning.replace('{firstName}', firstName)}</b>`;
    const keyboard = registrationSuccessKeyboard();
    await safeAnswerCb(ctx);
    await replyOrEdit(ctx, msg, keyboard);
  } else {
    const msg = `<b>${TEXTS.welcome.title}</b>\n\n${TEXTS.welcome.body}`;
    const keyboard = notRegisteredKeyboard();
    await safeAnswerCb(ctx);
    await replyOrEdit(ctx, msg, keyboard);
  }
}

async function showRegStep1(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (user) {
    await showStart(ctx);
    return;
  }
  
  const cities = getCities();
  const msg = `<b>${TEXTS.registration.step1.title}</b>\n\n${TEXTS.registration.step1.body}`;
  const keyboard = regStep1Keyboard(cities.map(c => c.name));
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

async function showFullCityList(ctx) {
  const cities = getCities();
  const list = cities.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
  const msg = TEXTS.registration.step1.fullList.replace('{list}', list);
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.back, callback_data: 'reg_step1' }]] } });
}

// Обработка выбора города
bot.action(/^city_(\d+)$/, async (ctx) => {
  const index = parseInt(ctx.match[1]);
  const cities = getCities();
  const city = cities[index];
  
  if (!city) {
    await safeAnswerCb(ctx, 'Город не найден');
    await showRegStep1(ctx);
    return;
  }
  
  await setSessionStep(ctx, 'reg_step2', { city: city.name, cityId: city.id });
  await showRegStep2(ctx);
});

// Обработка текстового ввода города
bot.on('message', async (ctx) => {
  const step = getSessionData(ctx, 'step');
  if (step === 'reg_step1') {
    const text = ctx.message.text;
    if (!text) return;
    
    const city = findCity(text);
    if (city) {
      await setSessionStep(ctx, 'reg_step2', { city: city.name, cityId: city.id });
      await showRegStep2(ctx);
    } else {
      const suggestions = suggestCity(text);
      if (suggestions.length > 0) {
        const msg = TEXTS.registration.step1.suggestions.replace('{suggestions}', suggestions.join(', '));
        await ctx.reply(msg);
      } else {
        // Сохраняем как "Другой город"
        await setSessionStep(ctx, 'reg_step2', { city: 'Другой город', cityId: 'other' });
        await showRegStep2(ctx);
      }
    }
  }
});

async function showRegStep2(ctx) {
  const data = getSessionData(ctx);
  const city = data.city;
  const cityId = data.cityId;
  
  const presetSchools = getSchoolsForCity(cityId);
  const registeredSchools = await getRegisteredSchoolsForCity(city);
  const schools = mergeSchoolOptions(presetSchools, registeredSchools);
  
  const msg = `<b>${TEXTS.registration.step2.title}</b>\n\n${TEXTS.registration.step2.body}`;
  const keyboard = regStep2Keyboard(schools);
  
  await setSessionStep(ctx, 'reg_step2', { ...data, schools });
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Обработка выбора школы
bot.action(/^school_(\d+)$/, async (ctx) => {
  const index = parseInt(ctx.match[1]);
  const data = getSessionData(ctx);
  const schools = data.schools || [];
  const school = schools[index];
  
  if (!school) {
    await safeAnswerCb(ctx, 'Школа не найдена');
    await showRegStep2(ctx);
    return;
  }
  
  await setSessionStep(ctx, 'reg_step3_letter', { ...data, school });
  await showRegStep3Letter(ctx);
});

// Обработка "Другая школа"
bot.action('school_other', async (ctx) => {
  await setSessionStep(ctx, 'reg_step2_custom', getSessionData(ctx));
  const msg = TEXTS.registration.step2.other;
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.back, callback_data: 'reg_step2' }], [{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]] } });
});

// Обработка ручного ввода школы
bot.on('message', async (ctx) => {
  const step = getSessionData(ctx, 'step');
  if (step === 'reg_step2_custom') {
    const text = ctx.message.text;
    if (!text) return;
    
    const school = sanitizeSchoolName(text);
    if (!school) {
      await ctx.reply('Название школы: от 2 до 80 символов.');
      return;
    }
    
    const data = getSessionData(ctx);
    await setSessionStep(ctx, 'reg_step3_letter', { ...data, school });
    await showRegStep3Letter(ctx);
  }
});

// Обработка кнопки "Назад" к шагу 2
bot.action('reg_step2', async (ctx) => {
  await showRegStep2(ctx);
});

async function showRegStep3Letter(ctx) {
  const msg = `<b>${TEXTS.registration.step3_letter.title}</b>\n\n${TEXTS.registration.step3_letter.body}`;
  const keyboard = regStep3LetterKeyboard();
  
  await setSessionStep(ctx, 'reg_step3_letter', getSessionData(ctx));
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Обработка выбора буквы
bot.action(/^letter_([А-Яа-я])$/, async (ctx) => {
  const letter = ctx.match[1].toUpperCase();
  const data = getSessionData(ctx);
  await setSessionStep(ctx, 'reg_step3_number', { ...data, letter });
  await showRegStep3Number(ctx);
});

// Обработка текстового ввода буквы
bot.on('message', async (ctx) => {
  const step = getSessionData(ctx, 'step');
  if (step === 'reg_step3_letter') {
    const text = ctx.message.text;
    if (!text) return;
    
    const letter = text.trim().toUpperCase();
    if (/^[А-Я]$/.test(letter)) {
      const data = getSessionData(ctx);
      await setSessionStep(ctx, 'reg_step3_number', { ...data, letter });
      await showRegStep3Number(ctx);
    } else {
      await ctx.reply('Напиши одну букву от А до Я.');
    }
  }
});

async function showRegStep3Number(ctx) {
  const data = getSessionData(ctx);
  const msg = `<b>${TEXTS.registration.step3_number.title}</b>\n\n${TEXTS.registration.step3_number.body}`;
  const keyboard = regStep3NumberKeyboard();
  
  await setSessionStep(ctx, 'reg_step3_number', data);
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Обработка выбора номера класса
bot.action(/^class_(\d+)$/, async (ctx) => {
  const number = ctx.match[1];
  const data = getSessionData(ctx);
  const className = `${number}${data.letter}`;
  await setSessionStep(ctx, 'reg_step4', { ...data, class: className });
  await showRegStep4(ctx);
});

// Обработка текстового ввода номера
bot.on('message', async (ctx) => {
  const step = getSessionData(ctx, 'step');
  if (step === 'reg_step3_number') {
    const text = ctx.message.text;
    if (!text) return;
    
    const number = text.trim();
    if (/^[4-9]|10|11$/.test(number)) {
      const data = getSessionData(ctx);
      const className = `${number}${data.letter}`;
      await setSessionStep(ctx, 'reg_step4', { ...data, class: className });
      await showRegStep4(ctx);
    } else {
      await ctx.reply('Напиши цифру от 4 до 11.');
    }
  }
});

async function showRegStep4(ctx) {
  const data = getSessionData(ctx);
  const msg = `<b>${TEXTS.registration.step4.title}</b>\n\n${TEXTS.registration.step4.body}`;
  const keyboard = regStep4Keyboard();
  
  await setSessionStep(ctx, 'reg_step4', data);
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Обработка выбора роли
bot.action(/^role_(user|admin)$/, async (ctx) => {
  const role = ctx.match[1];
  const data = getSessionData(ctx);
  await setSessionStep(ctx, 'reg_step5', { ...data, role });
  await showRegStep5(ctx);
});

async function showRegStep5(ctx) {
  const data = getSessionData(ctx);
  const body = TEXTS.registration.step5.body
    .replace('{city}', data.city)
    .replace('{school}', data.school)
    .replace('{class}', data.class)
    .replace('{role}', data.role === 'admin' ? 'Админ' : 'Участник');
  
  const msg = `<b>${TEXTS.registration.step5.title}</b>\n\n${body}`;
  const keyboard = regStep5Keyboard();
  
  await setSessionStep(ctx, 'reg_step5', data);
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Подтверждение регистрации
bot.action('complete', async (ctx) => {
  const data = getSessionData(ctx);
  const userId = ctx.from?.id;
  
  if (!data) {
    await safeAnswerCb(ctx, 'Данные потеряны. Начни снова.');
    await showRegStep1(ctx);
    return;
  }
  
  const userData = {
    tgId: userId,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    city: data.city,
    school: data.school,
    class: data.class,
    role: data.role === 'admin' ? 'user' : data.role, // Сначала как user, админ требует одобрения
    platforms: ['telegram'],
    status: 'active',
    customKeyboard: ['Сегодня', 'Завтра', 'Меню'],
    completedHomework: {},
    stats: {
      homeworkViews: 0,
      homeworkAdded: 0,
      lastActive: new Date()
    }
  };
  
  const user = await createUser(userData);
  
  if (!user) {
    await safeAnswerCb(ctx, 'Ошибка регистрации. Попробуй ещё раз.');
    return;
  }
  
  // Если запрашивали роль админа - отправляем заявку создателям
  if (data.role === 'admin') {
    user.pendingAdminRequest = true;
    await user.save();
    
    // Отправляем заявку создателям
    for (const moderatorId of config.moderators.ids) {
      try {
        await bot.telegram.sendMessage(moderatorId, 
          `👑 <b>НОВАЯ ЗАЯВКА НА АДМИНИСТРАТОРА</b>\n\n` +
          `👤 Пользователь: ${userData.firstName}\n` +
          `💬 Username: @${userData.username || 'отсутствует'}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `🏫 Школа: ${userData.school}\n` +
          `🏫 Класс: ${userData.class}\n\n` +
          `Одобрить или отклонить?`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Одобрить', callback_data: `approve_admin_${userId}` }],
                [{ text: '❌ Отклонить', callback_data: `reject_admin_${userId}` }]
              ]
            }
          }
        );
      } catch (e) {
        console.error(`Ошибка отправки заявки модератору ${moderatorId}:`, e);
      }
    }
  }
  
  await clearSession(ctx);
  
  const body = TEXTS.registration.success.body
    .replace('{city}', data.city)
    .replace('{school}', data.school)
    .replace('{class}', data.class)
    .replace('{role}', data.role === 'admin' ? 'Участник (заявка на админа отправлена)' : 'Участник')
    .replace('{specId}', user.specId);
  
  const msg = `<b>${TEXTS.registration.success.title}</b>\n\n${body}`;
  const keyboard = registrationSuccessKeyboard();
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

// Обработка одобрения/отклонения админа (только для модераторов)
bot.action(/^approve_admin_(\d+)$/, async (ctx) => {
  const moderatorId = ctx.from?.id;
  if (!config.moderators.ids.includes(moderatorId)) {
    await safeAnswerCb(ctx, 'Только для создателей');
    return;
  }
  
  const userId = parseInt(ctx.match[1]);
  const user = await getUserByTgId(userId);
  
  if (!user) {
    await safeAnswerCb(ctx, 'Пользователь не найден');
    return;
  }
  
  user.role = 'admin';
  user.pendingAdminRequest = false;
  await user.save();
  
  await safeAnswerCb(ctx, 'Одобрено');
  
  // Уведомляем пользователя
  try {
    await bot.telegram.sendMessage(userId, '🎉 Твоя заявка на роль админа одобрена!');
  } catch (e) {
    console.error('Ошибка уведомления пользователя:', e);
  }
});

bot.action(/^reject_admin_(\d+)$/, async (ctx) => {
  const moderatorId = ctx.from?.id;
  if (!config.moderators.ids.includes(moderatorId)) {
    await safeAnswerCb(ctx, 'Только для создателей');
    return;
  }
  
  const userId = parseInt(ctx.match[1]);
  const user = await getUserByTgId(userId);
  
  if (!user) {
    await safeAnswerCb(ctx, 'Пользователь не найден');
    return;
  }
  
  user.pendingAdminRequest = false;
  await user.save();
  
  await safeAnswerCb(ctx, 'Отклонено');
  
  // Уведомляем пользователя
  try {
    await bot.telegram.sendMessage(userId, '❌ Твоя заявка на роль админа отклонена. Ты можешь продолжать как участник.');
  } catch (e) {
    console.error('Ошибка уведомления пользователя:', e);
  }
});

// Перерегистрация
bot.action('reRegister', async (ctx) => {
  const msg = TEXTS.registration.reregisterWarning;
  const keyboard = reRegisterWarningKeyboard();
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

bot.action('confirm_reRegister', async (ctx) => {
  const userId = ctx.from?.id;
  await updateUser(userId, { tgId: null }); // Отвязываем Telegram
  await clearSession(ctx);
  await showRegStep1(ctx);
});
