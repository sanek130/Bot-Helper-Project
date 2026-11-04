import { TEXTS, ROLE_LABELS } from '../texts.js';
import {
  getStartKeyboard,
  getRegCityKeyboard,
  getCitySuggestKeyboard,
  getCityListKeyboard,
  getRegSchoolKeyboard,
  getRegSchoolNoneKeyboard,
  getRegLetterKeyboard,
  getRegNumberKeyboard,
  getRegRoleKeyboard,
  getRegConfirmKeyboard,
  getRegResetKeyboard,
  getReplyKeyboard,
  getMenuOnlyKeyboard,
} from '../keyboards.js';
import { show, say, toast } from '../ui.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import {
  getRawUserByTgId,
  createDraftUser,
  saveDraftStep,
  setDraft,
  discardDraft,
  activateDraft,
  getRegisteredSchoolsInCity,
} from '../../services/userService.js';
import { activateLink } from '../../services/loginService.js';
import {
  getCities,
  getCityById,
  findCity,
  getSchoolOptions,
  findSchoolInCity,
  createSchool,
} from '../../utils/searchService.js';
import { fill } from '../../utils/normalize.js';
import { capitalize } from '../../utils/subjects.js';
import { showMenuPage1 } from './menu.js';
import { showHelp } from './help.js';
import { handleProfileLetter, handleProfileNumber } from './profile.js';
import { offerDetachedAccounts } from './accounts.js';

const LETTER_RE = /^[а-яё]$/i;

export function buildRegDoneText(user) {
  return fill(TEXTS.REG_DONE, {
    city: user.city,
    school: capitalize(user.school),
    class: user.class,
    role: ROLE_LABELS[user.role] || user.role,
    specId: user.specId,
  });
}

function draftOf(user) {
  return user?.draft && typeof user.draft === 'object' ? user.draft : {};
}

function hasDraftData(user) {
  const draft = draftOf(user);
  return Boolean(draft.city || draft.school || draft.letter || draft.number || draft.role);
}

export function nextStepFor(draft) {
  if (!draft.city) return 1;
  if (!draft.school) return 2;
  if (!draft.letter) return 3.1;
  if (!draft.number || !draft.class) return 3.2;
  if (!draft.role) return 4;
  return 5;
}

export async function showStartScreen(ctx) {
  return show(ctx, TEXTS.START_WELCOME, getStartKeyboard());
}

// Возвращает черновик пользователя или null, если он уже зарегистрирован
// (тогда показывается меню — кнопки регистрации в старом сообщении устарели).
async function ensureDraft(ctx) {
  const raw = await getRawUserByTgId(ctx.from.id);
  if (raw && raw.status !== 'unregistered') {
    await toast(ctx, TEXTS.REG_ALREADY_ACTIVE);
    await showMenuPage1(ctx);
    return null;
  }
  if (raw) return raw;
  return createDraftUser(ctx.from.id, ctx.from.first_name, ctx.from.username);
}

export async function showCityStep(ctx, page = 0) {
  await setSession(ctx.from.id, 'telegram', 'reg:city', { page });
  return show(ctx, TEXTS.REG_STEP_1_CITY, getRegCityKeyboard(getCities(), page));
}

// handleRegText получает только session-объект (без данных шага), поэтому список школ
// для выбора номером кэшируем здесь при каждом показе шага школы.
const sessionSchoolsCache = new Map();

async function loadSchoolOptions(draft) {
  const registered = await getRegisteredSchoolsInCity(draft.city);
  return getSchoolOptions(draft.cityId || 'other', registered);
}

export async function showSchoolStep(ctx, user, page = 0) {
  const draft = draftOf(user);
  const schools = await loadSchoolOptions(draft);
  sessionSchoolsCache.set(ctx.from.id, schools);
  await setSession(ctx.from.id, 'telegram', 'reg:school', { schools, page });
  if (schools.length === 0) {
    return show(ctx, `${TEXTS.REG_STEP_2_SCHOOL}\n\n${TEXTS.REG_SCHOOL_EMPTY}`, getRegSchoolKeyboard(schools, page, user));
  }
  return show(ctx, TEXTS.REG_STEP_2_SCHOOL, getRegSchoolKeyboard(schools, page, user));
}

async function showSchoolNoneStep(ctx) {
  await setSession(ctx.from.id, 'telegram', 'reg:school_none', {});
  return show(ctx, TEXTS.REG_SCHOOL_NONE, getRegSchoolNoneKeyboard());
}

async function showSchoolTypeStep(ctx, type) {
  await setSession(ctx.from.id, 'telegram', 'reg:school_number', { type });
  return say(ctx, TEXTS.REG_SCHOOL_TYPE, getRegSchoolNoneKeyboard());
}

// Школа по текстовому вводу: сначала ищем в справочнике города, иначе создаём новую.
async function resolveSchoolByText(ctx, user, text) {
  const draft = draftOf(user);
  const cityId = draft.cityId || 'other';
  const found = findSchoolInCity(cityId, text);
  if (found) return selectSchool(ctx, user, found.name);
  const parsedType = String(text).match(/лицей|гимназия|школ[ау]/i);
  const parsedNumber = String(text).match(/\d+/);
  if (parsedType && parsedNumber) {
    const type = parsedType[0].toLowerCase().replace('школу', 'школа');
    const created = createSchool({ cityId, type, number: parsedNumber[0] });
    if (created) {
      await say(ctx, fill(TEXTS.REG_SCHOOL_CREATED, { school: capitalize(created.name) }), getRegSchoolNoneKeyboard(user));
      return selectSchool(ctx, user, created.name);
    }
  }
  return say(ctx, TEXTS.REG_SCHOOL_ONLY_LIST, getRegSchoolKeyboard(await loadSchoolOptions(draft), 0, user));
}

// Создание школы по кнопкам: тип -> номер. Если такая школа уже есть — выбираем её.
async function createSchoolByType(ctx, user, type, number) {
  const draft = draftOf(user);
  const cityId = draft.cityId || 'other';
  const created = createSchool({ cityId, type, number });
  if (!created) return say(ctx, TEXTS.REG_SCHOOL_NUMBER_INVALID, getRegSchoolNoneKeyboard(user));
  await say(ctx, fill(TEXTS.REG_SCHOOL_CREATED, { school: capitalize(created.name) }), getRegSchoolNoneKeyboard(user));
  return selectSchool(ctx, user, created.name);
}

async function showLetterStep(ctx) {
  await setSession(ctx.from.id, 'telegram', 'reg:letter', {});
  return show(ctx, TEXTS.REG_STEP_3_LETTER, getRegLetterKeyboard());
}

async function showNumberStep(ctx) {
  await setSession(ctx.from.id, 'telegram', 'reg:number', {});
  return show(ctx, TEXTS.REG_STEP_3_NUMBER, getRegNumberKeyboard());
}

async function showRoleStep(ctx) {
  await setSession(ctx.from.id, 'telegram', 'reg:role', {});
  return show(ctx, TEXTS.REG_STEP_4_ROLE, getRegRoleKeyboard());
}

async function showConfirmStep(ctx, user) {
  const draft = draftOf(user);
  await setSession(ctx.from.id, 'telegram', 'reg:confirm', {});
  const text = fill(TEXTS.REG_STEP_5_CONFIRM, {
    city: draft.city,
    school: capitalize(draft.school),
    class: draft.class,
    role: ROLE_LABELS[draft.role] || draft.role,
  });
  return show(ctx, text, getRegConfirmKeyboard(user));
}

export async function goToStep(ctx, user, step) {
  if (step === 1) return showCityStep(ctx, 0);
  if (step === 2) return showSchoolStep(ctx, user, 0);
  if (step === 3.1) return showLetterStep(ctx);
  if (step === 3.2) return showNumberStep(ctx);
  if (step === 4) return showRoleStep(ctx);
  return showConfirmStep(ctx, user);
}

// Перед новой регистрацией бот показывает аккаунты, из которых этот Telegram ID вышел,
// чтобы человек вернулся в старый аккаунт, а не плодил новые.
export async function resumeRegistration(ctx, { skipAccounts = false } = {}) {
  const user = await ensureDraft(ctx);
  if (!user) return null;
  if (!skipAccounts && !hasDraftData(user) && (await offerDetachedAccounts(ctx))) return null;
  return goToStep(ctx, user, nextStepFor(draftOf(user)));
}

async function selectCity(ctx, user, city) {
  const draft = draftOf(user);
  // Смена города обнуляет школу: школы привязаны к городу.
  const cityChanged = draft.city && draft.city !== city.name;
  let updated = await saveDraftStep(ctx.from.id, 1, { city: city.name, cityId: city.id });
  if (cityChanged) {
    const next = { ...draftOf(updated) };
    delete next.school;
    updated = await setDraft(ctx.from.id, next);
  }
  return goToStep(ctx, updated, nextStepFor(draftOf(updated)));
}

async function selectSchool(ctx, user, schoolName) {
  const updated = await saveDraftStep(ctx.from.id, 2, { school: schoolName });
  return goToStep(ctx, updated, nextStepFor(draftOf(updated)));
}

async function selectLetter(ctx, letter) {
  const user = await getRawUserByTgId(ctx.from.id);
  const draft = draftOf(user);
  const data = { letter };
  if (draft.number) data.class = `${draft.number}${letter}`;
  const updated = await saveDraftStep(ctx.from.id, 3.1, data);
  return goToStep(ctx, updated, nextStepFor(draftOf(updated)));
}

async function selectNumber(ctx, number) {
  const user = await getRawUserByTgId(ctx.from.id);
  const draft = draftOf(user);
  const updated = await saveDraftStep(ctx.from.id, 3.2, { number, class: `${number}${String(draft.letter || '').toUpperCase()}` });
  return goToStep(ctx, updated, nextStepFor(draftOf(updated)));
}

function cityListText() {
  const list = getCities()
    .map((city, i) => `${i + 1}. ${city.name}`)
    .join('\n');
  return fill(TEXTS.REG_CITY_LIST, { list });
}

function schoolListText(cityName, schools) {
  const list = schools.map((name, i) => `${i + 1}. ${capitalize(name)}`).join('\n');
  return fill(TEXTS.REG_SCHOOL_LIST, { city: cityName, list });
}

function parseLetter(value) {
  const text = String(value ?? '').trim();
  if (!LETTER_RE.test(text)) return null;
  return text.toUpperCase().replace('Ё', 'Е');
}

function parseNumber(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const number = Number(text);
  return number >= 4 && number <= 11 ? String(number) : null;
}

// Текстовый ввод на шагах регистрации (вызывается из router.js).
export async function handleRegText(ctx, session, text) {
  const user = await getRawUserByTgId(ctx.from.id);
  if (!user || user.status !== 'unregistered') {
    await clearSession(ctx.from.id, 'telegram');
    return showMenuPage1(ctx);
  }
  const step = session.step;

  if (step === 'reg:city' || step === 'reg:city_list') {
    if (step === 'reg:city_list' && /^\d+$/.test(text.trim())) {
      const city = getCities()[Number(text.trim()) - 1];
      if (city) return selectCity(ctx, user, city);
    }
    const found = findCity(text);
    if (found.length === 1) return selectCity(ctx, user, found[0]);
    if (found.length > 1) return say(ctx, TEXTS.REG_CITY_SUGGEST, getCitySuggestKeyboard(found, user));
    return say(ctx, TEXTS.REG_CITY_NOT_FOUND, getRegCityKeyboard(getCities(), 0, user));
  }

  if (step === 'reg:school' || step === 'reg:school_list') {
    const schools = Array.isArray(session.data?.schools) ? session.data.schools : await loadSchoolOptions(draftOf(user));
    sessionSchoolsCache.set(ctx.from.id, schools);
    const value = text.trim();
    if (/^\d+$/.test(value)) {
      const school = schools[Number(value) - 1];
      if (school) return selectSchool(ctx, user, school);
    }
    return resolveSchoolByText(ctx, user, text);
  }

  if (step === 'reg:school_number') {
    const number = String(text).replace(/[^\d]/g, '');
    if (!/^\d{1,4}$/.test(number)) return say(ctx, TEXTS.REG_SCHOOL_NUMBER_INVALID, getRegSchoolNoneKeyboard(user));
    return createSchoolByType(ctx, user, session.data?.type, number);
  }

  if (step === 'reg:letter') {
    const letter = parseLetter(text);
    if (!letter) return say(ctx, TEXTS.REG_LETTER_INVALID, getRegLetterKeyboard());
    return selectLetter(ctx, letter);
  }

  if (step === 'reg:number') {
    const number = parseNumber(text);
    if (!number) return say(ctx, TEXTS.REG_NUMBER_INVALID, getRegNumberKeyboard());
    return selectNumber(ctx, number);
  }

  return goToStep(ctx, user, nextStepFor(draftOf(user)));
}

export async function handleStart(ctx) {
  const payload = String(ctx.payload || ctx.startPayload || '').trim();
  if (payload.startsWith('link_')) {
    try {
      const linked = await activateLink(payload.slice(5), ctx.from.id, {
        firstName: ctx.from.first_name,
        username: ctx.from.username,
      });
      if (!linked) return say(ctx, TEXTS.LINK_INVALID, getStartKeyboard());
      await clearSession(ctx.from.id, 'telegram');
      await say(ctx, TEXTS.LINK_DONE, getReplyKeyboard(linked));
      return showMenuPage1(ctx);
    } catch (err) {
      if (err?.code === 'tg_already_linked') return say(ctx, TEXTS.LINK_TG_TAKEN, getMenuOnlyKeyboard());
      throw err;
    }
  }

  const raw = await getRawUserByTgId(ctx.from.id);
  if (raw && raw.status === 'active') {
    await clearSession(ctx.from.id, 'telegram');
    await say(ctx, fill(TEXTS.WELCOME_BACK, { firstName: raw.firstName || ctx.from.first_name || '' }), getReplyKeyboard(raw));
    return showMenuPage1(ctx);
  }
  if (raw && raw.status === 'pending') {
    return say(ctx, TEXTS.LOGIN_PENDING, getMenuOnlyKeyboard());
  }
  const session = await getSession(ctx.from.id, 'telegram');
  if (raw && (hasDraftData(raw) || session?.step?.startsWith('reg:'))) {
    return say(ctx, TEXTS.REG_RESET_CONFIRM, getRegResetKeyboard());
  }
  if (await offerDetachedAccounts(ctx, { forceNew: true })) return null;
  return say(ctx, TEXTS.START_WELCOME, getStartKeyboard());
}

export function registrationFlow(bot) {
  bot.start(handleStart);

  bot.action('reg:start', async (ctx) => resumeRegistration(ctx));

  bot.action('reg:resume', async (ctx) => resumeRegistration(ctx));

  bot.action('reg:reset_yes', async (ctx) => {
    await discardDraft(ctx.from.id);
    await clearSession(ctx.from.id, 'telegram');
    const user = await ensureDraft(ctx);
    if (!user) return null;
    return showCityStep(ctx, 0);
  });

  bot.action('reg:back', async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    await discardDraft(ctx.from.id);
    await clearSession(ctx.from.id, 'telegram');
    return showStartScreen(ctx);
  });

  bot.action(/^reg:city:([a-z0-9_-]{1,40})$/, async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    const city = getCityById(ctx.match[1]);
    if (!city) {
      await toast(ctx, TEXTS.STALE_MENU);
      return showCityStep(ctx, 0);
    }
    return selectCity(ctx, user, city);
  });

  bot.action(/^reg:city_next:(\d{1,3})$/, async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    return showCityStep(ctx, Number(ctx.match[1]));
  });

  bot.action('reg:city_list', async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    await setSession(ctx.from.id, 'telegram', 'reg:city_list', {});
    return show(ctx, cityListText(), getCityListKeyboard(user));
  });

  bot.action(/^reg:school:(\d{1,4})$/, async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    const session = await getSession(ctx.from.id, 'telegram');
    const schools = Array.isArray(session?.data?.schools) ? session.data.schools : null;
    const school = schools ? schools[Number(ctx.match[1])] : null;
    if (!school) {
      await toast(ctx, TEXTS.STALE_MENU);
      return showSchoolStep(ctx, user, 0);
    }
    return selectSchool(ctx, user, school);
  });

  bot.action(/^reg:school_next:(\d{1,3})$/, async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    if (!draftOf(user).city) return showCityStep(ctx, 0);
    return showSchoolStep(ctx, user, Number(ctx.match[1]));
  });

  bot.action('reg:school_list', async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    const draft = draftOf(user);
    if (!draft.city) return showCityStep(ctx, 0);
    const schools = await loadSchoolOptions(draft);
    sessionSchoolsCache.set(ctx.from.id, schools);
    await setSession(ctx.from.id, 'telegram', 'reg:school_list', { schools, page: 0 });
    return say(ctx, schoolListText(draft.city, schools), getRegSchoolNoneKeyboard(user));
  });

  bot.action('reg:school_none', async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    if (!draftOf(user).city) return showCityStep(ctx, 0);
    return showSchoolNoneStep(ctx);
  });

  bot.action(/^reg:school_type:(лицей|гимназия|школа)$/, async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    if (!draftOf(user).city) return showCityStep(ctx, 0);
    return showSchoolTypeStep(ctx, ctx.match[1]);
  });

  bot.action(/^reg:letter:([А-ЯЁ])$/, async (ctx) => {
    const session = await getSession(ctx.from.id, 'telegram');
    if (session?.step === 'prof:change_letter') return handleProfileLetter(ctx, ctx.match[1]);
    const user = await ensureDraft(ctx);
    if (!user) return null;
    return selectLetter(ctx, ctx.match[1]);
  });

  bot.action(/^reg:number:(\d{1,2})$/, async (ctx) => {
    const number = parseNumber(ctx.match[1]);
    const session = await getSession(ctx.from.id, 'telegram');
    if (session?.step === 'prof:change_number') return handleProfileNumber(ctx, number);
    const user = await ensureDraft(ctx);
    if (!user) return null;
    if (!number) return showNumberStep(ctx);
    if (!draftOf(user).letter) return showLetterStep(ctx);
    return selectNumber(ctx, number);
  });

  bot.action(/^reg:role:(user|admin)$/, async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    // Роль админа выдаётся сразу, без заявки создателю.
    const updated = await saveDraftStep(ctx.from.id, 4, { role: ctx.match[1] });
    return goToStep(ctx, updated, nextStepFor(draftOf(updated)));
  });

  bot.action(/^reg:step:(1|2|3\.1|3\.2|4|5)$/, async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    const step = Number(ctx.match[1]);
    const draft = draftOf(user);
    if (step === 2 && !draft.city) return showCityStep(ctx, 0);
    return goToStep(ctx, user, step);
  });

  // «Поменять N»: 1 — город, 2 — школа, 3 — буква, 4 — номер, 5 — роль.
  bot.action(/^reg:change:([1-5])$/, async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    const map = { 1: 1, 2: 2, 3: 3.1, 4: 3.2, 5: 4 };
    const step = map[ctx.match[1]];
    if (step === 2 && !draftOf(user).city) return showCityStep(ctx, 0);
    return goToStep(ctx, user, step);
  });

  bot.action('reg:confirm', async (ctx) => {
    const user = await ensureDraft(ctx);
    if (!user) return null;
    const draft = draftOf(user);
    if (nextStepFor(draft) !== 5) {
      await toast(ctx, TEXTS.REG_INCOMPLETE);
      return goToStep(ctx, user, nextStepFor(draft));
    }
    const active = await activateDraft(ctx.from.id);
    await clearSession(ctx.from.id, 'telegram');
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageReplyMarkup(undefined).catch(() => true);
    }
    await say(ctx, buildRegDoneText(active), getReplyKeyboard(active));
    return showMenuPage1(ctx, { forceNew: true });
  });

  bot.action('help', async (ctx) => showHelp(ctx));
}
