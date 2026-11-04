import { Markup } from 'telegraf';
import { config } from '../config.js';
import { KEYBOARD_ITEMS, BUTTON_STYLES, getStyleById, STYLE_EMOJI, STYLE_EXTRA, STYLE_MINIMAL } from './texts.js';
import { isAdmin, isModerator, isCreator } from './roles.js';
import { getToday, getTomorrow, getAfterTomorrow, addDaysKey, getWeekDates, SHORT_DAYS } from '../utils/dateService.js';
import { QUICK_SUBJECTS, getSubjectHash, capitalize, getSubjectIcon } from '../utils/subjects.js';
import { truncate } from '../utils/normalize.js';

// ---------- Система стилей кнопок ----------
// Каждая кнопка описана ключом из KEY_LABELS; подпись собирается по стилю пользователя
// (поле user.buttonStyle): без эмодзи, с эмодзи, яркий (двойные эмодзи + капс) или минимализм (только значки).
export const DEFAULT_STYLE = 'emoji';

const KEY_LABELS = {
  menu: 'Меню', back: 'Назад', forward: 'Вперёд', next: 'Дальше', cancel: 'Отмена', help: 'Помощь',
  contacts: 'Контакты', support: 'Поддержка', start: 'Начать', register: 'Регистрация', login: 'У меня есть аккаунт',
  today: 'Сегодня', tomorrow: 'Завтра', after_tomorrow: 'Послезавтра', week: 'Неделя', calendar: 'Выбор дня',
  schedule: 'Расписание', profile: 'Профиль', more: 'Ещё', web: 'Веб-версия', stats: 'Статистика', style: 'Стиль',
  admin_add: 'Добавить ДЗ', admin_edit: 'Изменить ДЗ', admin_delete: 'Удалить ДЗ', admin_panel: 'Админ-панель',
  edit_day: 'Редактировать этот день', broadcast: 'Рассылка классу', reports: 'Жалобы', creator_panel: 'Панель создателя',
  logout: 'Выйти из аккаунта', copy_id: 'Скопировать ID', accounts: 'Мои аккаунты', kb_settings: 'Настройки клавиатуры',
  change_class: 'Поменять класс', become_admin: 'Стать админом', demote: 'Стать участником', complain: 'Пожаловаться на админа',
  full_list: 'Полный список', no_school: 'Нет моей школы', to_city: 'К выбору города', to_school: 'К выбору школы',
  to_letter: 'К выбору буквы', to_number: 'К выбору номера', yes_confirm: 'Да, завершить', have_account: 'У меня есть аккаунт',
  change_1: 'Поменять 1', change_2: 'Поменять 2', change_3: 'Поменять 3', change_4: 'Поменять 4', change_5: 'Поменять 5',
  reset_yes: 'Да, сбросить', reg_help: 'Помощь', retry: 'Повторить', login_by_id: 'Войти по спец-ID',
  reg_new: 'Зарегистрировать новый', confirm_login: 'Подтвердить вход', approve_yes: 'Да, это я', deny_no: 'Нет',
  change_data: 'Изменить данные', check_status: 'Проверить статус', open_site: 'Открыть сайт', open_web: 'Открыть веб-версию',
  open_tg: 'Открыть в Telegram', apply: 'Применить', preview: 'Посмотреть', prev_week: 'Прошлая неделя', next_week: 'Следующая неделя',
  show_photos: 'Показать фото', copy_hw: 'Скопировать ДЗ', add_more_same: 'Добавить ещё к этому', add_other_hw: 'Добавить другое ДЗ',
  finish: 'Завершить', other_subject: 'Другой', rm_photos: 'Убрать фото', rm_full: 'Удалить полностью', move_day: 'Перенести на другой день',
  change_subj: 'Поменять предмет', new_text: 'Ввести новое ДЗ', move_confirm: 'Подтвердить перенос', confirm_action: 'Подтвердить',
  update_schedule: 'Обновить расписание', view: 'Посмотреть', users: 'Все пользователи', pick_class: 'Выбрать класс',
  warn: 'Выдать варн', reject: 'Отклонить', demote_user: 'Понизить до участника', escalate: 'Эскалировать создателю',
  ban: 'Забанить', unban: 'Разбанить', reset_warns: 'Сбросить варны', admin_unban: 'Снять запрет на админа',
  delete_account: 'Удалить аккаунт', ban_id: 'Бан по ID', unban_id: 'Разбан по ID', news: 'Новости (сайт)',
  recent_10: 'Последние 10', details: 'Подробнее', promote: 'Повысить до админа', ban_noreason: 'Без причины',
  bc_all: 'Всем', bc_city: 'По городу', bc_school: 'По школе', bc_class: 'По классу', reply_support: 'Ответить',
  close_ticket: 'Закрыть', write_again: 'Написать ещё', donate: 'Поддержать проект', creator_msg: 'Написать создателю',
  bot_chat: 'Чат бота', to_profile_menu: 'Назад в профиль', to_settings: 'Назад к настройкам', to_panel: 'Назад',
  yes_logout: 'Да, выйти', no_logout: 'Нет, остаться', yes_demote: 'Да, понизить', yes_delete: 'Удалить навсегда',
  enter_account: 'Войти', del_account: 'Удалить', to_user_card: 'К пользователю', to_users: 'Назад',
};

function userStyle(user) {
  return getStyleById(user?.buttonStyle || DEFAULT_STYLE);
}

function styledLabel(key, plain, user) {
  const style = userStyle(user);
  if (style.id === 'classic') return plain;
  if (style.id === 'bright') return `${STYLE_EMOJI[key] || '✨'} ${STYLE_EXTRA[key] || '🔥'} ${String(plain).toUpperCase()}`;
  if (style.id === 'minimal') return STYLE_MINIMAL[key] || STYLE_EMOJI[key] || '✨';
  return `${STYLE_EMOJI[key] || '✨'} ${plain}`;
}

// Кнопка с подписью по стилю пользователя.
const kcb = (user, key, data, plainOverride) => {
  const plain = plainOverride ?? KEY_LABELS[key] ?? key;
  return cb(styledLabel(key, plain, user), data);
};
// Кнопка со свободным текстом (динамические данные), но с эмодзи стиля.
const ecb = (user, key, text, data) => cb(`${styledLabel(key, '', user).trim()} ${text}`.trim(), data);

const cb = (text, data) => Markup.button.callback(text, data);
const url = (text, link) => Markup.button.url(text, link);
const inline = (rows) => Markup.inlineKeyboard(rows.filter((row) => row && row.length > 0));

export const PAGE_SIZE = 4;

function pageSlice(items, page) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = ((Number(page) || 0) % pages + pages) % pages;
  const start = safePage * PAGE_SIZE;
  return { pages, page: safePage, start, slice: items.slice(start, start + PAGE_SIZE) };
}

function pairs(buttons) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

function isHttps(link) {
  return typeof link === 'string' && link.startsWith('https://');
}

// ---------- Общие ----------

export function getMenuOnlyKeyboard(user) {
  return inline([[kcb(user, 'menu', 'menu:page:1')]]);
}

export function getCancelKeyboard(user) {
  return inline([[kcb(user, 'cancel', 'cancel')]]);
}

export function getUnregisteredKeyboard(user) {
  return inline([[kcb(user, 'register', 'reg:start'), cb('Помощь', 'help:open')]]);
}

export function getStartKeyboard(user) {
  return inline([
    [kcb(user, 'cancel', 'cancel'), cb('Начать', 'reg:start')],
    [kcb(user, 'help', 'help')],
    [kcb(user, 'login', 'login:start')],
  ]);
}

// ---------- Регистрация ----------

export function getRegCityKeyboard(cities, page = 0, user = null) {
  const { slice, page: current, pages } = pageSlice(cities, page);
  const buttons = slice.map((city) => cb(city.name, `reg:city:${city.id}`));
  const next = pages > 1 ? (current + 1) % pages : 0;
  return inline([
    buttons.slice(0, 2),
    buttons.slice(2, 4),
    [kcb(user, 'back', 'reg:back'), cb('Дальше', `reg:city_next:${next}`)],
    [kcb(user, 'full_list', 'reg:city_list')],
  ]);
}

export function getCitySuggestKeyboard(cities, user = null) {
  const rows = cities.slice(0, 6).map((city) => [cb(city.name, `reg:city:${city.id}`)]);
  rows.push([kcb(user, 'full_list', 'reg:city_list')]);
  return inline(rows);
}

export function getCityListKeyboard(user) {
  return inline([[kcb(user, 'back', 'reg:step:1')], [cb('Отмена', 'cancel')]]);
}

// Школы передаются в callback по индексу в отсортированном списке: названия на кириллице
// легко превышают 64 байта, а список стабилен в пределах одного шага.
export function getRegSchoolKeyboard(schools, page = 0, user = null) {
  const { slice, start, page: current, pages } = pageSlice(schools, page);
  const buttons = slice.map((name, i) => cb(truncate(capitalize(name), 40), `reg:school:${start + i}`));
  const prev = current > 0 ? `reg:school_next:${current - 1}` : 'reg:step:1';
  const next = pages > 1 ? (current + 1) % pages : 0;
  return inline([
    buttons.slice(0, 2),
    buttons.slice(2, 4),
    [kcb(user, 'back', prev), cb('Дальше', `reg:school_next:${next}`)],
    [kcb(user, 'full_list', 'reg:school_list')],
    [kcb(user, 'no_school', 'reg:school_none')],
    [kcb(user, 'to_city', 'reg:step:1')],
  ]);
}

export function getRegSchoolNoneKeyboard(user) {
  return inline([
    [cb('Лицей', 'reg:school_type:лицей'), cb('Гимназия', 'reg:school_type:гимназия')],
    [cb('Школа', 'reg:school_type:школа')],
    [kcb(user, 'back', 'reg:step:2'), cb('К выбору города', 'reg:step:1')],
  ]);
}

export function getSchoolListKeyboard(user) {
  return inline([[kcb(user, 'back', 'reg:step:2')], [cb('К выбору города', 'reg:step:1')]]);
}

export function getRegLetterKeyboard(mode = 'reg', user = null) {
  const rows = [
    [cb('А', 'reg:letter:А'), cb('Б', 'reg:letter:Б'), cb('В', 'reg:letter:В')],
    [cb('Г', 'reg:letter:Г'), cb('Д', 'reg:letter:Д'), cb('Е', 'reg:letter:Е')],
  ];
  if (mode === 'prof') {
    rows.push([kcb(user, 'cancel', 'prof:open')]);
  } else {
    rows.push([kcb(user, 'to_school', 'reg:step:2')]);
    rows.push([kcb(user, 'to_city', 'reg:step:1')]);
  }
  return inline(rows);
}

export function getRegNumberKeyboard(mode = 'reg', user = null) {
  const rows = [
    [cb('4', 'reg:number:4'), cb('5', 'reg:number:5'), cb('6', 'reg:number:6'), cb('7', 'reg:number:7')],
    [cb('8', 'reg:number:8'), cb('9', 'reg:number:9'), cb('10', 'reg:number:10'), cb('11', 'reg:number:11')],
  ];
  if (mode === 'prof') {
    rows.push([kcb(user, 'to_letter', 'prof:change_class')]);
    rows.push([kcb(user, 'cancel', 'prof:open')]);
  } else {
    rows.push([kcb(user, 'to_school', 'reg:step:2')]);
    rows.push([kcb(user, 'to_letter', 'reg:step:3.1')]);
  }
  return inline(rows);
}

export function getRegRoleKeyboard(user) {
  return inline([
    [cb('Участник', 'reg:role:user')],
    [cb('Админ', 'reg:role:admin')],
    [kcb(user, 'to_number', 'reg:step:3.2')],
    [kcb(user, 'to_letter', 'reg:step:3.1')],
  ]);
}

export function getRegConfirmKeyboard(user) {
  return inline([
    [kcb(user, 'yes_confirm', 'reg:confirm')],
    [kcb(user, 'login', 'login:start')],
    [kcb(user, 'cancel', 'cancel'), cb('Помощь', 'help')],
    [kcb(user, 'change_1', 'reg:change:1'), cb('Поменять 2', 'reg:change:2'), cb('Поменять 3', 'reg:change:3')],
    [kcb(user, 'change_4', 'reg:change:4'), cb('Поменять 5', 'reg:change:5')],
  ]);
}

export function getRegResetKeyboard(user) {
  return inline([[kcb(user, 'reset_yes', 'reg:reset_yes'), cb('Отмена', 'reg:resume')]]);
}

export function getRegDoneKeyboard(user) {
  return inline([[kcb(user, 'menu', 'menu:page:1')], [cb('Профиль', 'prof:open'), cb('Помощь', 'help:open')]]);
}

// ---------- Вход ----------

export function getLoginStartKeyboard(user) {
  return inline([[kcb(user, 'back', 'login:back'), cb('Помощь', 'help:open')], [cb('Отмена', 'cancel')]]);
}

export function getLoginNotFoundKeyboard(user) {
  return inline([[kcb(user, 'retry', 'login:start'), cb('Регистрация', 'reg:start')]]);
}

export function getLoginConfirmKeyboard(requestId, user = null) {
  return inline([[kcb(user, 'confirm_login', `login:confirm:${requestId}`), cb('Отмена', 'cancel')]]);
}

export function getLoginOwnerKeyboard(requestId, user = null) {
  return inline([[kcb(user, 'approve_yes', `login:approve:${requestId}`), cb('Нет', `login:deny:${requestId}`)]]);
}

export function getLoginDeniedKeyboard(user) {
  return inline([[kcb(user, 'retry', 'login:start'), cb('Изменить данные', 'reg:start')]]);
}

export function getLoginExpiredKeyboard(user) {
  return inline([[kcb(user, 'retry', 'login:start'), cb('Отмена', 'cancel')]]);
}

export function getLoginWaitingKeyboard(requestId, user = null) {
  return inline([[kcb(user, 'check_status', `login:status:${requestId}`)], [cb('Отмена', 'cancel')]]);
}

export function getOpenSiteKeyboard(path = '/login') {
  const link = `${config.siteUrl}${path}`;
  if (!/^https?:\/\//.test(link)) return getMenuOnlyKeyboard();
  return inline([[url('Открыть сайт', link)]]);
}

// ---------- Reply-клавиатура ----------

export function getReplyItems(user) {
  const saved = Array.isArray(user?.customKeyboard) ? user.customKeyboard : [];
  const items = KEYBOARD_ITEMS.filter((item) => saved.includes(item)).filter(
    (item) => item !== 'Админ-панель' || isAdmin(user),
  );
  return [...items, 'Меню'];
}

export function getReplyKeyboard(user, items = null) {
  const list = items ? [...items.filter((item) => item !== 'Меню'), 'Меню'] : getReplyItems(user);
  const rows = [];
  for (let i = 0; i < list.length; i += 3) rows.push(list.slice(i, i + 3));
  return Markup.keyboard(rows).resize().persistent();
}

export function getRemoveKeyboard() {
  return Markup.removeKeyboard();
}

// ---------- Меню ----------

export function getMenuPage1Keyboard(user) {
  const rows = [
    [kcb(user, 'tomorrow', 'hw:tomorrow')],
    [kcb(user, 'today', 'hw:today'), cb('Послезавтра', 'hw:after_tomorrow')],
    [kcb(user, 'week', 'hw:week'), cb('Выбор дня', 'cal:show:0')],
    [kcb(user, 'schedule', 'schedule:show')],
    [kcb(user, 'profile', 'prof:open'), cb('Ещё', 'menu:page:2')],
  ];
  if (isAdmin(user)) {
    rows.push([kcb(user, 'admin_add', 'adm:add')]);
    rows.push([kcb(user, 'admin_edit', 'adm:edit')]);
    rows.push([kcb(user, 'broadcast', 'bc:class')]);
  }
  if (isModerator(user)) rows.push([kcb(user, 'reports', 'adm:reports')]);
  if (isCreator(user)) rows.push([kcb(user, 'creator_panel', 'crt:panel')]);
  return inline(rows);
}

export function getMenuPage2Keyboard(user) {
  const rows = [
    [kcb(user, 'web', 'web:open')],
    [kcb(user, 'stats', 'stats:open'), cb('Помощь', 'help:open')],
    [kcb(user, 'support', 'sup:start')],
  ];
  if (isAdmin(user)) rows.push([kcb(user, 'admin_panel', 'adm:panel')]);
  rows.push([kcb(user, 'back', 'menu:page:1')]);
  return inline(rows);
}

export function getWebAppKeyboard(user) {
  const link = `${config.siteUrl}/tma`;
  if (isHttps(link)) return inline([[Markup.button.webApp('Открыть веб-версию', link)], [kcb(user, 'menu', 'menu:page:1')]]);
  return inline([[url('Открыть веб-версию', link)], [kcb(user, 'menu', 'menu:page:1')]]);
}

export function getWebSiteKeyboard(user) {
  return inline([[url('Открыть сайт', config.siteUrl)], [kcb(user, 'menu', 'menu:page:1')]]);
}

export function getWebOpenKeyboard(user) {
  const rows = [[url('Открыть сайт', config.siteUrl)]];
  const tma = `${config.siteUrl}/tma`;
  if (isHttps(tma)) rows.push([Markup.button.webApp('Открыть в Telegram', tma)]);
  rows.push([kcb(user, 'menu', 'menu:page:1')]);
  return inline(rows);
}

// ---------- Профиль ----------

export function getProfileKeyboard(user) {
  const rows = [
    [kcb(user, 'back', 'menu:page:1'), cb('В меню', 'menu:page:1')],
    [kcb(user, 'logout', 'prof:logout')],
    [kcb(user, 'copy_id', 'prof:copy_id'), cb('Мои аккаунты', 'acc:list')],
    [kcb(user, 'kb_settings', 'prof:kb_open')],
    [kcb(user, 'help', 'help:open'), cb('Веб-версия', 'web:open')],
  ];
  if (user.role === 'user' && !user.adminBanned) {
    rows.push([kcb(user, 'change_class', 'prof:change_class')]);
    rows.push([kcb(user, 'become_admin', 'prof:become_admin')]);
  }
  if (user.role === 'admin') rows.push([kcb(user, 'demote', 'prof:demote')]);
  return inline(rows);
}

export function getBackToProfileKeyboard(user) {
  return inline([[kcb(user, 'to_profile_menu', 'prof:open')]]);
}

export function getLogoutConfirmKeyboard(user) {
  return inline([[kcb(user, 'yes_logout', 'prof:logout_yes')], [cb('Нет, остаться', 'prof:logout_no')]]);
}

export function getLogoutDoneKeyboard(user) {
  return inline([[kcb(user, 'register', 'reg:start')], [cb('Помощь', 'help:open')]]);
}

// ---------- Аккаунты, привязанные к Telegram ID ----------

// mode='reg' — экран при регистрации, mode='profile' — переключение из профиля.
export function getAccountsKeyboard(accounts, mode = 'reg', user = null) {
  const rows = accounts.map((account, i) => [
    cb(`Войти: ${i + 1}`, `acc:use:${account.specId}`),
    cb(`Удалить: ${i + 1}`, `acc:del:${account.specId}`),
  ]);
  if (mode === 'reg') {
    rows.push([kcb(user, 'reg_new', 'reg:new')]);
    rows.push([kcb(user, 'login_by_id', 'login:start'), cb('Помощь', 'help')]);
  } else {
    rows.push([kcb(user, 'to_profile_menu', 'prof:open')]);
  }
  return inline(rows);
}

export function getAccountSwitchKeyboard(specId) {
  return inline([[cb('Да, перейти', `acc:swyes:${specId}`)], [cb('Отмена', 'prof:open')]]);
}

export function getAccountDeleteKeyboard(specId, user = null) {
  return inline([[kcb(user, 'yes_delete', `acc:delyes:${specId}`)], [cb('Отмена', 'acc:list')]]);
}

export function getAccountsBackKeyboard(user) {
  return inline([[kcb(user, 'accounts', 'acc:list')], [cb('Меню', 'menu:page:1')]]);
}

export function getProfileMenuKeyboard(user) {
  return inline([[kcb(user, 'profile', 'prof:open')], [cb('Меню', 'menu:page:1')]]);
}

export function getMenuProfileKeyboard(user) {
  return inline([[kcb(user, 'menu', 'menu:page:1')], [cb('Профиль', 'prof:open')]]);
}

export function getDemoteConfirmKeyboard(user) {
  return inline([[kcb(user, 'yes_demote', 'prof:demote_yes')], [cb('Отмена', 'prof:open')]]);
}

export function getKbSettingsKeyboard(selected, user) {
  const mark = (item) => `${selected.includes(item) ? '✅' : '☐'} ${item}`;
  const toggle = (item) => cb(mark(item), `prof:kb_toggle:${item}`);
  const rows = [
    [toggle('Сегодня'), toggle('Завтра')],
    [toggle('Послезавтра'), toggle('Неделя')],
    [toggle('Расписание'), toggle('Профиль')],
    [toggle('Помощь'), toggle('Веб-версия')],
    [toggle('Статистика')],
  ];
  if (isAdmin(user)) rows.push([toggle('Админ-панель')]);
  rows.push([kcb(user, 'apply', 'prof:kb_apply'), cb('Посмотреть', 'prof:kb_preview')]);
  rows.push([kcb(user, 'cancel', 'prof:open')]);
  return inline(rows);
}

export function getKbPreviewBackKeyboard(user) {
  return inline([[kcb(user, 'to_settings', 'prof:kb_open')]]);
}

// ---------- Помощь и статистика ----------

export function getHelpKeyboard(user) {
  const rows = [[kcb(user, 'menu', 'menu:page:1'), cb('Контакты', 'help:contacts')]];
  if (!user || user.status !== 'active') {
    rows.push([kcb(user, 'register', 'reg:start')]);
  } else {
    rows.push([kcb(user, 'complain', 'cmp:start'), cb('Отмена', 'menu:page:1')]);
  }
  return inline(rows);
}

export function getContactsKeyboard(contacts, user = null) {
  const rows = [];
  if (contacts.creatorUrl) rows.push([url('Написать создателю', contacts.creatorUrl)]);
  if (contacts.chatUrl) rows.push([url('Чат бота', contacts.chatUrl)]);
  if (contacts.donateUrl) rows.push([url('Поддержать проект', contacts.donateUrl)]);
  rows.push([kcb(user, 'support', 'sup:start'), cb('Меню', 'menu:page:1')]);
  return inline(rows);
}

export function getDonateKeyboard(contacts, user = null) {
  const rows = [];
  if (contacts.donateUrl) rows.push([url('Поддержать проект', contacts.donateUrl)]);
  rows.push([kcb(user, 'menu', 'menu:page:1')]);
  return inline(rows);
}

export function getStatsKeyboard(user) {
  const rows = [[kcb(user, 'menu', 'menu:page:1')], [cb('Профиль', 'prof:open'), cb('Помощь', 'help:open')]];
  if (user.role === 'user' && !user.adminBanned) rows.push([kcb(user, 'become_admin', 'prof:become_admin')]);
  return inline(rows);
}

// ---------- Просмотр ДЗ ----------

export function getDayNavRow(dateKey, user = null) {
  const today = getToday();
  const tomorrow = getTomorrow();
  const afterTomorrow = getAfterTomorrow();
  if (dateKey === today) return [kcb(user, 'tomorrow', 'hw:tomorrow'), cb('Послезавтра', 'hw:after_tomorrow')];
  if (dateKey === tomorrow) return [kcb(user, 'today', 'hw:today'), cb('Послезавтра', 'hw:after_tomorrow')];
  if (dateKey === afterTomorrow) return [kcb(user, 'today', 'hw:today'), cb('Завтра', 'hw:tomorrow')];
  return [kcb(user, 'back', `hw:day:${addDaysKey(dateKey, -1)}`), cb('Вперёд', `hw:day:${addDaysKey(dateKey, 1)}`)];
}

// subjects — массив { subjectHash, subjectName, photoIds, completed }.
export function getDayCardKeyboard(dateKey, subjects, user) {
  const rows = [getDayNavRow(dateKey)];
  for (const item of subjects.slice(0, 10)) {
    const label = `${item.completed ? '✅' : '☐'} ${truncate(capitalize(item.subjectName), 40)}`;
    rows.push([cb(label, `chk:${dateKey}:${item.subjectHash}`)]);
  }
  const hasPhotos = subjects.some((item) => (item.photoIds || []).length > 0);
  const mediaRow = [];
  if (hasPhotos) mediaRow.push(kcb(user, 'show_photos', `show_photos:${dateKey}`));
  mediaRow.push(kcb(user, 'schedule', 'schedule:show'));
  rows.push(mediaRow);
  if (isAdmin(user)) rows.push([kcb(user, 'edit_day', `edit:day:${dateKey}`)]);
  rows.push([kcb(user, 'copy_hw', `copy:day:${dateKey}`), cb('Помощь', 'help:open')]);
  rows.push([kcb(user, 'menu', 'menu:page:1')]);
  return inline(rows);
}

export function getEmptyDayKeyboard(dateKey, user) {
  const rows = [getDayNavRow(dateKey), [kcb(user, 'schedule', 'schedule:show')]];
  if (isAdmin(user)) rows.push([kcb(user, 'admin_add', `add_day:${dateKey}`)]);
  rows.push([kcb(user, 'help', 'help:open')]);
  rows.push([kcb(user, 'menu', 'menu:page:1')]);
  return inline(rows);
}

export function getCopyDayKeyboard(dateKey, user = null) {
  return inline([[kcb(user, 'back', `hw:day:${dateKey}`)], [cb('Меню', 'menu:page:1')]]);
}

export function getWeekKeyboard(offset, user = null) {
  return inline([
    [kcb(user, 'today', 'hw:today'), cb('Завтра', 'hw:tomorrow'), cb('Послезавтра', 'hw:after_tomorrow')],
    [kcb(user, 'schedule', 'schedule:show'), cb('Помощь', 'help:open')],
    [kcb(user, 'prev_week', `cal:show:${offset - 1}`), cb('Следующая неделя', `cal:show:${offset + 1}`)],
    [kcb(user, 'menu', 'menu:page:1')],
  ]);
}

// Ячейки календаря: [дд] — сегодня, дд• — есть ДЗ. Заголовок дней недели не кликабелен (noop).
export function getCalendarKeyboard(mode, offset, datesWithHomework = [], user = null) {
  const today = getToday();
  const marked = new Set(datesWithHomework);
  const header = SHORT_DAYS.map((day) => cb(day, 'noop'));
  const days = getWeekDates(offset).map(({ dateKey }) => {
    const dd = dateKey.slice(8, 10);
    let label = dd;
    if (dateKey === today) label = `[${dd}]`;
    if (marked.has(dateKey)) label = `${label}•`;
    return cb(label, `${mode}_day:${dateKey}`);
  });
  return inline([
    header,
    days,
    [kcb(user, 'prev_week', 'cal:prev'), cb('Следующая неделя', 'cal:next')],
    [kcb(user, 'cancel', 'cancel'), cb('Меню', 'menu:page:1')],
  ]);
}

export function getPhotoExpiredKeyboard(dateKey, user = null) {
  return inline([[kcb(user, 'back', `hw:day:${dateKey}`)], [cb('Меню', 'menu:page:1')]]);
}

// ---------- Расписание ----------

export function getScheduleKeyboard(user, hasPhoto) {
  const rows = hasPhoto ? [[kcb(user, 'menu', 'menu:page:1')]] : [[cb('Меню', 'menu:page:1'), cb('Помощь', 'help:open')]];
  if (isAdmin(user)) rows.push([kcb(user, 'update_schedule', 'schedule:upload')]);
  return inline(rows);
}

export function getScheduleUpdatedKeyboard(user) {
  return inline([[kcb(user, 'preview', 'schedule:show')], [cb('Меню', 'menu:page:1')]]);
}

// ---------- Админ: ДЗ ----------

// prefix: add_subj или edit_new_subj. Быстрые предметы — 5 рядов по 3 (14 предметов + пустое место).
export function getQuickSubjectsKeyboard(prefix = 'add_subj', backData = 'adm:add', user = null) {
  const buttons = QUICK_SUBJECTS.map((name) => cb(`${getSubjectIcon(name)} ${capitalize(name)}`, `${prefix}:${getSubjectHash(name)}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
  rows.push([kcb(user, 'other_subject', `${prefix}:other`)]);
  rows.push([kcb(user, 'back', backData), cb('Отмена', 'cancel')]);
  return inline(rows);
}

export function getBackCancelKeyboard(backData, user = null) {
  return inline([[kcb(user, 'back', backData), cb('Отмена', 'cancel')]]);
}

export function getAddTaskKeyboard(subjectHash, user = null) {
  return inline([[kcb(user, 'back', `add_subj:${subjectHash}`)], [cb('Отмена', 'cancel')]]);
}

export function getAddDoneKeyboard(dateKey, user = null) {
  return inline([
    [kcb(user, 'add_more_same', 'add:more_same')],
    [kcb(user, 'add_other_hw', 'adm:add')],
    [kcb(user, 'finish', `hw:day:${dateKey}`)],
  ]);
}

export function getSubjectPickKeyboard(prefix, subjects, backData, user = null) {
  const rows = subjects.slice(0, 20).map((item) => [
    cb(`${getSubjectIcon(item.subjectName)} ${truncate(capitalize(item.subjectName), 40)}`, `${prefix}:${item.subjectHash}`),
  ]);
  rows.push([kcb(user, 'back', backData), cb('Отмена', 'cancel')]);
  return inline(rows);
}

export function getBackMenuKeyboard(backData, backLabel = 'Назад', user = null) {
  return inline([[cb(backLabel, backData)], [kcb(user, 'menu', 'menu:page:1')]]);
}

export function getEditCardKeyboard(subjectHash, dateKey, user = null) {
  return inline([
    [kcb(user, 'rm_photos', 'edit:rmphotos'), cb('Удалить полностью', 'edit:rmfull')],
    [kcb(user, 'move_day', 'edit:move'), cb('Поменять предмет', 'edit:change_subj')],
    [kcb(user, 'new_text', 'edit:new_text')],
    [kcb(user, 'back', `edit_day:${dateKey}`), cb('Отмена', 'cancel')],
  ]);
}

export function getConfirmKeyboard(cancelData, confirmData, confirmLabel = 'Подтвердить', user = null) {
  return inline([[kcb(user, 'cancel', cancelData), cb(confirmLabel, confirmData)]]);
}

export function getMoveConfirmKeyboard(fromDateKey, toDateKey, subjectHash, user = null) {
  return inline([
    [kcb(user, 'back', `edit_subj:${subjectHash}`), cb('Отмена', 'cancel')],
    [kcb(user, 'move_confirm', `edit:moveyes:${fromDateKey}:${toDateKey}:${subjectHash}`)],
  ]);
}

export function getChangeSubjectConfirmKeyboard(oldHash, newHash, user = null) {
  return inline([[kcb(user, 'cancel', 'cancel'), cb('Подтвердить', `edit:change_subj_yes:${oldHash}:${newHash}`)]]);
}

export function getEditNextKeyboard(label, data, user = null) {
  return inline([[cb(label, data), kcb(user, 'menu', 'menu:page:1')]]);
}

export function getDeleteConfirmKeyboard(dateKey, subjectHash, user = null) {
  return inline([[kcb(user, 'back', `del_day:${dateKey}`), cb('Отмена', 'cancel'), cb('Подтвердить', `del:confirm:${subjectHash}`)]]);
}

export function getAdminPanelKeyboard(user) {
  const rows = [
    [kcb(user, 'admin_delete', 'adm:del'), cb('Добавить ДЗ', 'adm:add')],
    [cb('Редактировать ДЗ', 'adm:edit'), cb('В меню', 'menu:page:1')],
  ];
  if (isModerator(user)) {
    rows.push([kcb(user, 'reports', 'adm:reports'), cb('Все пользователи', 'adm:users')]);
    rows.push([cb('Рассылка', 'adm:bc')]);
    rows.push([kcb(user, 'pick_class', 'adm:pick_class')]);
  }
  return inline(rows);
}

// Классы передаются по индексу: «гимназия 25::10А» в кириллице может превысить лимит 64 байта.
export function getPickClassKeyboard(classKeys, user = null) {
  const rows = classKeys.slice(0, 30).map((key, i) => [cb(truncate(key, 50), `adm:class:${i}`)]);
  rows.push([kcb(user, 'back', 'adm:panel'), cb('Отмена', 'cancel')]);
  return inline(rows);
}

// ---------- Жалобы ----------

export function getComplaintAdminsKeyboard(admins, user = null) {
  const rows = admins.map((admin) => [
    cb(truncate(`${admin.firstName || 'Без имени'} (@${admin.username || 'нет'})`, 50), `cmp:admin:${admin.tgId}`),
  ]);
  rows.push([kcb(user, 'cancel', 'cancel')]);
  return inline(rows);
}

export function getComplaintConfirmKeyboard(user) {
  return inline([[kcb(user, 'cancel', 'cancel'), cb('Отправить', 'cmp:send')]]);
}

export function getReportActionsKeyboard(reportId, viewer, { withBack = false } = {}, user = null) {
  const rows = [[kcb(user, 'warn', `rep:warn:${reportId}`), cb('Отклонить', `rep:reject:${reportId}`)]];
  const second = [kcb(user, 'demote_user', `rep:demote:${reportId}`)];
  if (!viewer || viewer.role !== 'creator') second.push(kcb(user, 'escalate', `rep:escalate:${reportId}`));
  rows.push(second);
  if (withBack) rows.push([kcb(user, 'back', 'crt:panel')]);
  return inline(rows);
}

export function getEscalateThreeKeyboard(specId, user = null) {
  return inline([[kcb(user, 'ban', `crt:ban:${specId}`), cb('Сбросить варны', `crt:resetwarns:${specId}`)]]);
}

// ---------- Панель создателя ----------

export function getCreatorPanelKeyboard(user) {
  const rows = [
    [kcb(user, 'reports', 'crt:reports'), cb('Пользователи', 'crt:users')],
    [kcb(user, 'support', 'sup:list'), cb('Рассылка', 'bc:creator')],
    [kcb(user, 'ban_id', 'crt:banid'), cb('Разбан по ID', 'crt:unbanid')],
    [cb('В меню', 'menu:page:1')],
  ];
  if (isCreator(user)) rows.push([kcb(user, 'news', 'crt:news')]);
  return inline(rows);
}

export function getBackToPanelKeyboard(user) {
  return inline([[kcb(user, 'back', 'crt:panel')]]);
}

export function getUsersSearchKeyboard(user) {
  return inline([[kcb(user, 'recent_10', 'crt:recent')], [cb('Назад', 'crt:panel'), cb('Отмена', 'cancel')]]);
}

export function getUserMoreKeyboard(specId, user = null) {
  return inline([[kcb(user, 'details', `crt:user:${specId}`)]]);
}

export function getUserCardKeyboard(target, viewer, user = null) {
  const rows = [];
  rows.push([target.banned ? kcb(user, 'unban', `crt:unban:${target.specId}`) : cb('Забанить', `crt:ban:${target.specId}`)]);
  if (isCreator(viewer)) {
    if (target.role === 'user') rows.push([kcb(user, 'promote', `crt:promote:${target.specId}`)]);
    if (target.role === 'admin' || target.role === 'support') {
      rows.push([kcb(user, 'demote_user', `crt:demote:${target.specId}`)]);
    }
  } else if (target.role === 'admin') {
    rows.push([kcb(user, 'demote_user', `crt:demote:${target.specId}`)]);
  }
  rows.push([kcb(user, 'warn', `crt:warn:${target.specId}`), cb('Сбросить варны', `crt:resetwarns:${target.specId}`)]);
  if (isCreator(viewer) && target.adminBanned) rows.push([kcb(user, 'admin_unban', `crt:adminunban:${target.specId}`)]);
  if (isCreator(viewer)) rows.push([kcb(user, 'delete_account', `crt:delete:${target.specId}`)]);
  rows.push([kcb(user, 'back', 'crt:users')]);
  return inline(rows);
}

export function getBanReasonKeyboard(specId, user = null) {
  return inline([[kcb(user, 'ban_noreason', `crt:banno:${specId}`)], [cb('Отмена', `crt:user:${specId}`)]]);
}

export function getBanIdInputKeyboard(user) {
  return inline([[kcb(user, 'back', 'crt:panel'), cb('Отмена', 'cancel')]]);
}

export function getBanIdReasonKeyboard(user) {
  return inline([[kcb(user, 'ban_noreason', 'crt:banid_noreason')], [cb('Отмена', 'crt:panel')]]);
}

export function getDeleteAccountConfirmKeyboard(specId, user = null) {
  return inline([[kcb(user, 'cancel', `crt:user:${specId}`), cb('Удалить навсегда', `crt:delyes:${specId}`)]]);
}

export function getUserBackKeyboard(specId, user = null) {
  return inline([[kcb(user, 'to_user_card', `crt:user:${specId}`)], [cb('Назад', 'crt:users')]]);
}

// ---------- Рассылки ----------

export function getBroadcastAudienceKeyboard(user) {
  return inline([
    [kcb(user, 'bc_all', 'bc:aud:all'), cb('По городу', 'bc:aud:city')],
    [kcb(user, 'bc_school', 'bc:aud:school'), cb('По классу', 'bc:aud:class')],
    [kcb(user, 'cancel', 'cancel')],
  ]);
}

export function getBroadcastValuesKeyboard(values, user = null) {
  const rows = values.slice(0, 30).map((value, i) => [cb(truncate(value, 50), `bc:val:${i}`)]);
  rows.push([kcb(user, 'back', 'bc:creator'), cb('Отмена', 'cancel')]);
  return inline(rows);
}

export function getBroadcastConfirmKeyboard(user) {
  return inline([[kcb(user, 'cancel', 'cancel'), cb('Отправить', 'bc:send')]]);
}

// ---------- Поддержка ----------

export function getTicketActionsKeyboard(ticketId, user = null) {
  return inline([[kcb(user, 'reply_support', `sup:reply:${ticketId}`), cb('Закрыть', `sup:close:${ticketId}`)]]);
}

export function getTicketsBackKeyboard() {
  return inline([[cb('Назад к тикетам', 'sup:list')]]);
}

export function getSupportDoneKeyboard(user) {
  return inline([[kcb(user, 'write_again', 'sup:start')], [cb('Меню', 'menu:page:1')]]);
}

export { pairs };
