import bot, { answerCb, replyOrEdit, isCreator } from '../bot.js';
import { TEXTS } from '../texts.js';
import {
  startKeyboard,
  successKeyboard,
  reRegisterKeyboard,
  regCityKeyboard,
  regSchoolKeyboard,
  regBackKeyboard,
  regLetterKeyboard,
  regNumberKeyboard,
  regRoleKeyboard,
  regConfirmKeyboard,
  replyKeyboard,
  adminRequestKeyboard,
} from '../keyboards.js';
import { getSession, setSession, patchSession, clearSession, setStep } from '../sessions.js';
import {
  createUser,
  getUserByTgId,
  getUserBySpecId,
  linkTelegram,
  promoteUser,
  updateByTgId,
  setPendingAdminRequest,
} from '../../services/userService.js';
import {
  getCities,
  findCity,
  suggestCity,
  getSchoolsForCity,
  getRegisteredSchoolsForCity,
  mergeSchoolOptions,
  findSchool,
} from '../../services/searchService.js';
import { renameClassKey, getClassKey } from '../../services/homeworkService.js';
import { sanitizeSchoolName, escapeHtml } from '../../utils/normalize.js';
import { showMenuPage1 } from './menu.js';
import { activateLink } from '../../services/loginService.js';
import config from '../../config.js';

const CITY_PAGE_SIZE = 4;
const SCHOOL_PAGE_SIZE = 6;

async function notifyCreators(text, keyboard) {
  for (const moderatorId of config.moderators.ids) {
    try {
      await bot.telegram.sendMessage(moderatorId, text, { parse_mode: 'HTML', ...keyboard });
    } catch (error) {
      console.error('Не удалось отправить заявку создателю', { moderatorId, message: error.message });
    }
  }
}

export async function showStart(ctx) {
  const payload = ctx.startPayload || (ctx.message?.text || '').match(/^\/start\s+(\S+)/)?.[1];

  if (payload?.startsWith('link_')) {
    const result = await activateLink(payload.slice(5), ctx.from.id, ctx.from);
    await clearSession(ctx.from.id);

    const messages = {
      not_found: 'Ссылка недействительна. Открой сайт и получи новую.',
      expired: 'Срок ссылки истёк. Открой сайт и получи новую.',
      telegram_busy: TEXTS.login.telegramBusy,
    };

    if (!result.ok) {
      await ctx.reply(messages[result.error] || 'Не удалось активировать аккаунт.', {
        reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.help, callback_data: 'help' }]] },
      });
      return;
    }

    await ctx.reply('Аккаунт активирован. Теперь можно пользоваться ботом и сайтом с одним спец-ID.');

    if (result.user.pendingAdminRequest) {
      await notifyCreators(
        `👑 <b>Заявка на администратора</b>\nПользователь: ${escapeHtml(result.user.firstName || '—')}\nШкола: ${escapeHtml(result.user.school || '—')}\nКласс: ${escapeHtml(result.user.class)}\n\nОдобрить или отклонить?`,
        adminRequestKeyboard(result.user.specId)
      );
    }

    await showMenuPage1(ctx, `<b>С возвращением, ${escapeHtml(result.user.firstName || 'друг')}!</b>`);
    return;
  }

  await clearSession(ctx.from.id);
  const user = await getUserByTgId(ctx.from.id);

  if (user) {
    if (!user.school) {
      await startSchoolMigration(ctx, user);
      return;
    }
    await showMenuPage1(ctx, `<b>${TEXTS.welcome.returning.replace('{firstName}', escapeHtml(user.firstName || 'друг'))}</b>`);
    return;
  }

  await replyOrEdit(ctx, `<b>${TEXTS.welcome.title}</b>\n${TEXTS.welcome.body}`, startKeyboard());
}

export async function beginRegistration(ctx) {
  await setSession(ctx.from.id, 'reg:city', { cityPage: 0 });
  await showCityStep(ctx, 0);
}

async function showCityStep(ctx, page = 0) {
  const cities = getCities();
  const pages = Math.max(1, Math.ceil(cities.length / CITY_PAGE_SIZE));
  const safePage = ((page % pages) + pages) % pages;
  await patchSession(ctx.from.id, { cityPage: safePage });
  await replyOrEdit(
    ctx,
    `<b>${TEXTS.registration.step1.title}</b>\n${TEXTS.registration.step1.body}`,
    regCityKeyboard(cities, safePage, CITY_PAGE_SIZE)
  );
}

async function showCityFullList(ctx) {
  const list = getCities().map((city, index) => `${index + 1}. ${city.name}`).join('\n');
  await replyOrEdit(ctx, TEXTS.registration.step1.fullList.replace('{list}', list), regBackKeyboard('city'));
}

async function showSchoolStep(ctx, session, page = 0) {
  const preset = getSchoolsForCity(session.data.cityId);
  const registered = await getRegisteredSchoolsForCity(session.data.city);
  const schools = mergeSchoolOptions(preset, registered);
  const pages = Math.max(1, Math.ceil(schools.length / SCHOOL_PAGE_SIZE));
  const safePage = ((page % pages) + pages) % pages;

  await setSession(ctx.from.id, 'reg:school', { ...session.data, schools, schoolPage: safePage });
  await replyOrEdit(
    ctx,
    `<b>${TEXTS.registration.step2.title}</b>\n${TEXTS.registration.step2.body}`,
    regSchoolKeyboard(schools, safePage, SCHOOL_PAGE_SIZE)
  );
}

async function showSchoolFullList(ctx, session) {
  const list = (session.data.schools || []).map((school, index) => `${index + 1}. ${escapeHtml(school)}`).join('\n');
  const text = TEXTS.registration.step2.fullList.replace('{city}', escapeHtml(session.data.city)).replace('{list}', list);
  await replyOrEdit(ctx, text, regBackKeyboard('school'));
}

async function showLetterStep(ctx, session) {
  await setSession(ctx.from.id, 'reg:letter', session.data);
  await replyOrEdit(ctx, `<b>${TEXTS.registration.step3_letter.title}</b>\n${TEXTS.registration.step3_letter.body}`, regLetterKeyboard());
}

async function showNumberStep(ctx, session) {
  await setSession(ctx.from.id, 'reg:number', session.data);
  await replyOrEdit(ctx, `<b>${TEXTS.registration.step3_number.title}</b>\n${TEXTS.registration.step3_number.body}`, regNumberKeyboard());
}

async function showRoleStep(ctx, session) {
  await setSession(ctx.from.id, 'reg:role', session.data);
  await replyOrEdit(ctx, `<b>${TEXTS.registration.step4.title}</b>\n${TEXTS.registration.step4.body}`, regRoleKeyboard());
}

async function showConfirmStep(ctx, session) {
  const data = session.data;
  const role = data.role === 'admin' ? 'Админ (заявка)' : 'Участник';
  const body = TEXTS.registration.step5.body
    .replace('{city}', escapeHtml(data.city))
    .replace('{school}', escapeHtml(data.school))
    .replace('{class}', escapeHtml(data.className))
    .replace('{role}', role);

  await setSession(ctx.from.id, 'reg:confirm', data);
  await replyOrEdit(ctx, `<b>${TEXTS.registration.step5.title}</b>\n${body}`, regConfirmKeyboard());
}

export async function startSchoolMigration(ctx, user) {
  const city = findCity(user.city);
  const preset = city ? getSchoolsForCity(city.id) : [];
  const registered = await getRegisteredSchoolsForCity(user.city);
  const schools = mergeSchoolOptions(preset, registered);

  await setSession(ctx.from.id, 'mig:school', { schools });

  const rows = [];
  for (let i = 0; i < Math.min(schools.length, 12); i += 2) {
    const row = [{ text: schools[i], callback_data: `mig:school:${i}` }];
    if (schools[i + 1]) row.push({ text: schools[i + 1], callback_data: `mig:school:${i + 1}` });
    rows.push(row);
  }
  rows.push([
    { text: TEXTS.registration.step2.otherSchool || TEXTS.buttons.otherSchool, callback_data: 'mig:other' },
    { text: TEXTS.buttons.fullList, callback_data: 'mig:list' },
  ]);
  rows.push([{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]);

  await replyOrEdit(
    ctx,
    '<b>Остался последний шаг: школа</b>\nУкажи школу, чтобы ДЗ твоего класса нашлись. Можно написать название текстом.',
    { reply_markup: { inline_keyboard: rows } }
  );
}

async function completeSchoolMigration(ctx, user, school) {
  const oldKey = user.class;
  const updated = await updateByTgId(user.tgId, { school });
  const newKey = `${school}::${updated.class}`;
  await renameClassKey(oldKey, newKey);
  await clearSession(ctx.from.id);
  await replyOrEdit(ctx, `Школа сохранена: ${escapeHtml(school)}. ДЗ класса перенесены.`, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.menu, callback_data: 'menu1' }]] },
  });
}

export async function handleRegistrationText(ctx, session) {
  const text = ctx.message.text.trim();
  const tgId = ctx.from.id;

  if (session.step === 'mig:school' || session.step === 'mig:custom') {
    const user = await getUserByTgId(tgId);
    if (!user) return false;

    const byNumber = /^\d+$/.test(text) ? session.data.schools?.[Number(text) - 1] : null;
    const school = session.step === 'mig:custom'
      ? sanitizeSchoolName(text)
      : byNumber || await findSchool(user.city, text);

    if (!school) {
      await ctx.reply('Школа не найдена. Напиши название иначе или выбери кнопкой.');
      return true;
    }

    await completeSchoolMigration(ctx, user, school);
    return true;
  }

  if (session.step === 'reg:city') {
    const byNumber = /^\d+$/.test(text) ? getCities()[Number(text) - 1] : null;
    const city = byNumber || findCity(text);
    if (city) {
      const next = { ...session.data, city: city.name, cityId: city.id };
      const withStep = { step: 'reg:school', data: next };
      await setSession(tgId, 'reg:school', next);
      await showSchoolStep(ctx, withStep, 0);
      return true;
    }

    const suggestions = suggestCity(text);
    if (suggestions.length) {
      await ctx.reply(TEXTS.registration.step1.suggestions.replace('{suggestions}', suggestions.join(', ')));
    } else {
      await ctx.reply('Город не найден. Напиши название ещё раз или выбери кнопками.');
    }
    return true;
  }

  if (session.step === 'reg:custom_school') {
    const school = sanitizeSchoolName(text);
    if (!school) {
      await ctx.reply('Название школы: от 2 до 80 символов.');
      return true;
    }
    const next = { ...session.data, school };
    await setSession(tgId, 'reg:letter', next);
    await showLetterStep(ctx, { step: 'reg:letter', data: next });
    return true;
  }

  if (session.step === 'reg:letter') {
    const letter = text.toUpperCase();
    if (!/^[А-ЯЁ]$/.test(letter)) {
      await ctx.reply('Напиши одну букву от А до Я.');
      return true;
    }
    const next = { ...session.data, letter };
    await setSession(tgId, 'reg:number', next);
    await showNumberStep(ctx, { step: 'reg:number', data: next });
    return true;
  }

  if (session.step === 'reg:number') {
    const number = text.replace(/\D/g, '');
    if (!/^(4|5|6|7|8|9|10|11)$/.test(number)) {
      await ctx.reply('Напиши цифру от 4 до 11.');
      return true;
    }
    const next = { ...session.data, number, className: `${number}${session.data.letter || ''}` };
    await setSession(tgId, 'reg:role', next);
    await showRoleStep(ctx, { step: 'reg:role', data: next });
    return true;
  }

  if (session.step === 'reg:school') {
    const byNumber = /^\d+$/.test(text) ? session.data.schools?.[Number(text) - 1] : null;
    const school = byNumber || await findSchool(session.data.city, text);
    if (!school) {
      await ctx.reply('Школа не найдена. Выбери из списка или нажми «Другая школа».');
      return true;
    }
    const next = { ...session.data, school };
    await setSession(tgId, 'reg:letter', next);
    await showLetterStep(ctx, { step: 'reg:letter', data: next });
    return true;
  }

  return false;
}

async function finishRegistration(ctx, session) {
  const tgId = ctx.from.id;
  const data = session.data;

  const existing = await getUserByTgId(tgId);
  if (existing) {
    await clearSession(tgId);
    await showMenuPage1(ctx, `<b>С возвращением, ${escapeHtml(existing.firstName || 'друг')}!</b>`);
    return;
  }

  const user = await createUser({
    tgId,
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    city: data.city,
    school: data.school,
    class: data.className,
    role: 'user',
    status: 'active',
    platforms: ['telegram'],
    customKeyboard: ['Сегодня', 'Завтра', 'Меню'],
    completedHomework: {},
    pendingAdminRequest: data.role === 'admin',
  });

  if (data.role === 'admin') {
    await notifyCreators(
      `👑 <b>Заявка на администратора</b>\nПользователь: ${escapeHtml(user.firstName || '—')}\nUsername: @${escapeHtml(user.username || 'нет')}\nШкола: ${escapeHtml(user.school)}\nКласс: ${escapeHtml(user.class)}\n\nОдобрить или отклонить?`,
      adminRequestKeyboard(user.specId)
    );
  }

  await clearSession(tgId);

  const body = TEXTS.registration.success.body
    .replace('{city}', escapeHtml(data.city))
    .replace('{school}', escapeHtml(data.school))
    .replace('{class}', escapeHtml(data.className))
    .replace('{role}', data.role === 'admin' ? 'Участник (заявка на админа отправлена)' : 'Участник')
    .replace('{specId}', user.specId);

  await replyOrEdit(ctx, `<b>${TEXTS.registration.success.title}</b>\n\n${body}`, successKeyboard());
  await ctx.reply('Кнопка «Меню» всегда под рукой.', replyKeyboard(user.customKeyboard));
}

// Заявки на админа, отправленные создателям
async function handleAdminRequest(ctx, specId, approve) {
  const moderator = await getUserByTgId(ctx.from.id);
  const allowed = isCreator(moderator) || config.moderators.ids.includes(ctx.from.id);
  if (!allowed) {
    await answerCb(ctx, 'Только для создателей');
    return;
  }

  const user = await getUserBySpecId(specId);
  if (!user) {
    await answerCb(ctx, 'Пользователь не найден');
    return;
  }

  if (approve) {
    await promoteUser(user.tgId);
    await answerCb(ctx, 'Одобрено');
  } else {
    await setPendingAdminRequest(user.tgId, false);
    await answerCb(ctx, 'Отклонено');
  }

  try {
    await bot.telegram.sendMessage(
      user.tgId,
      approve
        ? '🎉 Твоя заявка на роль админа одобрена! Открой меню и добавь первое ДЗ.'
        : 'Заявка отклонена. Ты можешь продолжить как участник.',
      { parse_mode: 'HTML' }
    );
  } catch {
    // пользователь мог заблокировать бота
  }
}

bot.command('start', async (ctx) => {
  await showStart(ctx);
});

bot.action('reg:start', async (ctx) => {
  await answerCb(ctx);
  await beginRegistration(ctx);
});

bot.action('reg:cancel', async (ctx) => {
  await answerCb(ctx);
  await clearSession(ctx.from.id);
  const user = await getUserByTgId(ctx.from.id);
  if (user) await showMenuPage1(ctx);
  else await replyOrEdit(ctx, `<b>${TEXTS.welcome.title}</b>\n${TEXTS.welcome.body}`, startKeyboard());
});

bot.action(/^reg:cities:next$/, async (ctx) => {
  const session = await getSession(ctx.from.id);
  await answerCb(ctx);
  await showCityStep(ctx, (session.data.cityPage || 0) + 1);
});

bot.action('reg:cities:list', async (ctx) => {
  await answerCb(ctx);
  await showCityFullList(ctx);
});

bot.action(/^reg:city:(\d+)$/, async (ctx) => {
  const city = getCities()[Number(ctx.match[1])];
  if (!city) {
    await answerCb(ctx, 'Город не найден');
    await showCityStep(ctx, 0);
    return;
  }

  const data = { ...(await getSession(ctx.from.id)).data, city: city.name, cityId: city.id };
  await setSession(ctx.from.id, 'reg:school', data);
  await answerCb(ctx);
  await showSchoolStep(ctx, { step: 'reg:school', data }, 0);
});

bot.action(/^reg:schools:page:(\d+)$/, async (ctx) => {
  const session = await getSession(ctx.from.id);
  await answerCb(ctx);
  await showSchoolStep(ctx, session, Number(ctx.match[1]));
});

bot.action('reg:schools:list', async (ctx) => {
  const session = await getSession(ctx.from.id);
  await answerCb(ctx);
  await showSchoolFullList(ctx, session);
});

bot.action(/^reg:school:(\d+)$/, async (ctx) => {
  const session = await getSession(ctx.from.id);
  const school = session.data.schools?.[Number(ctx.match[1])];
  if (!school) {
    await answerCb(ctx, 'Школа не найдена');
    await showSchoolStep(ctx, session, 0);
    return;
  }

  const data = { ...session.data, school };
  await setSession(ctx.from.id, 'reg:letter', data);
  await answerCb(ctx);
  await showLetterStep(ctx, { step: 'reg:letter', data });
});

bot.action('reg:other_school', async (ctx) => {
  const session = await getSession(ctx.from.id);
  await answerCb(ctx);
  if (!session.data.city) {
    await showCityStep(ctx, 0);
    return;
  }
  await setStep(ctx.from.id, 'reg:custom_school');
  await replyOrEdit(ctx, TEXTS.registration.step2.other, regBackKeyboard('school'));
});

bot.action(/^reg:letter:([А-ЯЁа-яё])$/, async (ctx) => {
  const session = await getSession(ctx.from.id);
  const data = { ...session.data, letter: ctx.match[1].toUpperCase() };
  await setSession(ctx.from.id, 'reg:number', data);
  await answerCb(ctx);
  await showNumberStep(ctx, { step: 'reg:number', data });
});

bot.action(/^reg:num:(\d+)$/, async (ctx) => {
  const session = await getSession(ctx.from.id);
  const number = ctx.match[1];
  const data = { ...session.data, number, className: `${number}${session.data.letter || ''}` };
  await setSession(ctx.from.id, 'reg:role', data);
  await answerCb(ctx);
  await showRoleStep(ctx, { step: 'reg:role', data });
});

bot.action(/^reg:role:(user|admin)$/, async (ctx) => {
  const session = await getSession(ctx.from.id);
  const data = { ...session.data, role: ctx.match[1] };
  await setSession(ctx.from.id, 'reg:confirm', data);
  await answerCb(ctx);
  await showConfirmStep(ctx, { step: 'reg:confirm', data });
});

bot.action(/^reg:back:(city|school|letter|number|role)$/, async (ctx) => {
  const target = ctx.match[1];
  const session = await getSession(ctx.from.id);
  await answerCb(ctx);

  if (target === 'city') return showCityStep(ctx, 0);
  if (target === 'school') return showSchoolStep(ctx, session, session.data.schoolPage || 0);
  if (target === 'letter') return showLetterStep(ctx, session);
  if (target === 'number') return showNumberStep(ctx, session);
  return showRoleStep(ctx, session);
});

bot.action('reg:done', async (ctx) => {
  const session = await getSession(ctx.from.id);
  await answerCb(ctx);
  if (!session.data.city || !session.data.school || !session.data.className) {
    await beginRegistration(ctx);
    return;
  }
  await finishRegistration(ctx, session);
});

bot.action('reg:rereg', async (ctx) => {
  await answerCb(ctx);
  await replyOrEdit(ctx, TEXTS.registration.reregisterWarning, reRegisterKeyboard());
});

bot.action('reg:rereg_yes', async (ctx) => {
  const user = await getUserByTgId(ctx.from.id);
  await answerCb(ctx);
  if (user) {
    // Старый аккаунт остаётся в базе: по спец-ID в него можно вернуться
    await bot.telegram.sendMessage(
      user.tgId,
      `Новый аккаунт создан. Спец-ID прошлого аккаунта: <code>${user.specId}</code>`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
    await import('../../services/userService.js').then(({ unlinkTelegram }) => unlinkTelegram(user.tgId));
  }
  await clearSession(ctx.from.id);
  await beginRegistration(ctx);
});

bot.action(/^mig:school:(\d+)$/, async (ctx) => {
  const session = await getSession(ctx.from.id);
  const user = await getUserByTgId(ctx.from.id);
  const school = session.data.schools?.[Number(ctx.match[1])];
  if (!user || !school) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    await showStart(ctx);
    return;
  }
  await answerCb(ctx);
  await completeSchoolMigration(ctx, user, school);
});

bot.action('mig:other', async (ctx) => {
  await answerCb(ctx);
  await setStep(ctx.from.id, 'mig:custom');
  await replyOrEdit(ctx, TEXTS.registration.step2.other, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]] },
  });
});

bot.action('mig:list', async (ctx) => {
  const session = await getSession(ctx.from.id);
  const list = (session.data.schools || []).map((school, index) => `${index + 1}. ${escapeHtml(school)}`).join('\n');
  await answerCb(ctx);
  await replyOrEdit(ctx, `Все школы:\n${list}\n\nНапиши номер или название школы.`, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]] },
  });
});

bot.action('reg:back:5', async (ctx) => {
  const session = await getSession(ctx.from.id);
  await answerCb(ctx);
  if (session.data.city && session.data.school && session.data.className) {
    await showConfirmStep(ctx, session);
    return;
  }
  await showStart(ctx);
});

bot.action(/^req:(approve|reject):([0-9a-f-]{36})$/, async (ctx) => {
  await handleAdminRequest(ctx, ctx.match[2], ctx.match[1] === 'approve');
});
