import { Markup } from 'telegraf';
import { config } from '../config.js';
import { KEYBOARD_ITEMS } from './texts.js';
import { isAdmin, isModerator, isCreator } from './roles.js';
import { getToday, getTomorrow, getAfterTomorrow, addDaysKey, getWeekDates, SHORT_DAYS } from '../utils/dateService.js';
import { QUICK_SUBJECTS, getSubjectHash, capitalize, getSubjectIcon } from '../utils/subjects.js';
import { truncate } from '../utils/normalize.js';

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

export function getMenuOnlyKeyboard() {
  return inline([[cb('Меню', 'menu:page:1')]]);
}

export function getCancelKeyboard() {
  return inline([[cb('Отмена', 'cancel')]]);
}

export function getUnregisteredKeyboard() {
  return inline([[cb('Регистрация', 'reg:start'), cb('Помощь', 'help:open')]]);
}

export function getStartKeyboard() {
  return inline([
    [cb('Отмена', 'cancel'), cb('Начать', 'reg:start')],
    [cb('Помощь', 'help')],
    [cb('У меня есть аккаунт', 'login:start')],
  ]);
}

// ---------- Регистрация ----------

export function getRegCityKeyboard(cities, page = 0) {
  const { slice, page: current, pages } = pageSlice(cities, page);
  const buttons = slice.map((city) => cb(city.name, `reg:city:${city.id}`));
  const next = pages > 1 ? (current + 1) % pages : 0;
  return inline([
    buttons.slice(0, 2),
    buttons.slice(2, 4),
    [cb('Назад', 'reg:back'), cb('Дальше', `reg:city_next:${next}`)],
    [cb('Полный список', 'reg:city_list')],
  ]);
}

export function getCitySuggestKeyboard(cities) {
  const rows = cities.slice(0, 6).map((city) => [cb(city.name, `reg:city:${city.id}`)]);
  rows.push([cb('Полный список', 'reg:city_list')]);
  return inline(rows);
}

export function getCityListKeyboard() {
  return inline([[cb('Назад', 'reg:step:1')], [cb('Отмена', 'cancel')]]);
}

// Школы передаются в callback по индексу в отсортированном списке: названия на кириллице
// легко превышают 64 байта, а список стабилен в пределах одного шага.
export function getRegSchoolKeyboard(schools, page = 0) {
  const { slice, start, page: current, pages } = pageSlice(schools, page);
  const buttons = slice.map((name, i) => cb(truncate(capitalize(name), 40), `reg:school:${start + i}`));
  const prev = current > 0 ? `reg:school_next:${current - 1}` : 'reg:step:1';
  const next = pages > 1 ? (current + 1) % pages : 0;
  return inline([
    buttons.slice(0, 2),
    buttons.slice(2, 4),
    [cb('Назад', prev), cb('Дальше', `reg:school_next:${next}`)],
    [cb('Полный список', 'reg:school_list')],
    [cb('К выбору города', 'reg:step:1')],
  ]);
}

export function getSchoolListKeyboard() {
  return inline([[cb('Назад', 'reg:step:2')], [cb('К выбору города', 'reg:step:1')]]);
}

export function getRegLetterKeyboard(mode = 'reg') {
  const rows = [
    [cb('А', 'reg:letter:А'), cb('Б', 'reg:letter:Б'), cb('В', 'reg:letter:В')],
    [cb('Г', 'reg:letter:Г'), cb('Д', 'reg:letter:Д'), cb('Е', 'reg:letter:Е')],
  ];
  if (mode === 'prof') {
    rows.push([cb('Отмена', 'prof:open')]);
  } else {
    rows.push([cb('К выбору школы', 'reg:step:2')]);
    rows.push([cb('К выбору города', 'reg:step:1')]);
  }
  return inline(rows);
}

export function getRegNumberKeyboard(mode = 'reg') {
  const rows = [
    [cb('4', 'reg:number:4'), cb('5', 'reg:number:5'), cb('6', 'reg:number:6'), cb('7', 'reg:number:7')],
    [cb('8', 'reg:number:8'), cb('9', 'reg:number:9'), cb('10', 'reg:number:10'), cb('11', 'reg:number:11')],
  ];
  if (mode === 'prof') {
    rows.push([cb('К выбору буквы', 'prof:change_class')]);
    rows.push([cb('Отмена', 'prof:open')]);
  } else {
    rows.push([cb('К выбору школы', 'reg:step:2')]);
    rows.push([cb('К выбору буквы', 'reg:step:3.1')]);
  }
  return inline(rows);
}

export function getRegRoleKeyboard() {
  return inline([
    [cb('Участник', 'reg:role:user')],
    [cb('Админ', 'reg:role:admin')],
    [cb('К выбору номера', 'reg:step:3.2')],
    [cb('К выбору буквы', 'reg:step:3.1')],
  ]);
}

export function getRegConfirmKeyboard() {
  return inline([
    [cb('Да, завершить', 'reg:confirm')],
    [cb('У меня есть аккаунт', 'login:start')],
    [cb('Отмена', 'cancel'), cb('Помощь', 'help')],
    [cb('Поменять 1', 'reg:change:1'), cb('Поменять 2', 'reg:change:2'), cb('Поменять 3', 'reg:change:3')],
    [cb('Поменять 4', 'reg:change:4'), cb('Поменять 5', 'reg:change:5')],
  ]);
}

export function getRegResetKeyboard() {
  return inline([[cb('Да, сбросить', 'reg:reset_yes'), cb('Отмена', 'reg:resume')]]);
}

export function getRegDoneKeyboard() {
  return inline([[cb('Меню', 'menu:page:1')], [cb('Профиль', 'prof:open'), cb('Помощь', 'help:open')]]);
}

// ---------- Вход ----------

export function getLoginStartKeyboard() {
  return inline([[cb('Назад', 'login:back'), cb('Помощь', 'help:open')], [cb('Отмена', 'cancel')]]);
}

export function getLoginNotFoundKeyboard() {
  return inline([[cb('Повторить', 'login:start'), cb('Регистрация', 'reg:start')]]);
}

export function getLoginConfirmKeyboard(requestId) {
  return inline([[cb('Подтвердить вход', `login:confirm:${requestId}`), cb('Отмена', 'cancel')]]);
}

export function getLoginOwnerKeyboard(requestId) {
  return inline([[cb('Да, это я', `login:approve:${requestId}`), cb('Нет', `login:deny:${requestId}`)]]);
}

export function getLoginDeniedKeyboard() {
  return inline([[cb('Повторить', 'login:start'), cb('Изменить данные', 'reg:start')]]);
}

export function getLoginExpiredKeyboard() {
  return inline([[cb('Повторить', 'login:start'), cb('Отмена', 'cancel')]]);
}

export function getLoginWaitingKeyboard(requestId) {
  return inline([[cb('Проверить статус', `login:status:${requestId}`)], [cb('Отмена', 'cancel')]]);
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
    [cb('Завтра', 'hw:tomorrow')],
    [cb('Сегодня', 'hw:today'), cb('Послезавтра', 'hw:after_tomorrow')],
    [cb('Неделя', 'hw:week'), cb('Выбор дня', 'cal:show:0')],
    [cb('Расписание', 'schedule:show')],
    [cb('Профиль', 'prof:open'), cb('Ещё', 'menu:page:2')],
  ];
  if (isAdmin(user)) {
    rows.push([cb('Добавить ДЗ', 'adm:add')]);
    rows.push([cb('Изменить ДЗ', 'adm:edit')]);
    rows.push([cb('Рассылка классу', 'bc:class')]);
  }
  if (isModerator(user)) rows.push([cb('Жалобы', 'adm:reports')]);
  if (isCreator(user)) rows.push([cb('Панель создателя', 'crt:panel')]);
  return inline(rows);
}

export function getMenuPage2Keyboard(user) {
  const rows = [
    [cb('Веб-версия', 'web:open')],
    [cb('Статистика', 'stats:open'), cb('Помощь', 'help:open')],
    [cb('Поддержка', 'sup:start')],
  ];
  if (isAdmin(user)) rows.push([cb('Админ-панель', 'adm:panel')]);
  rows.push([cb('Назад', 'menu:page:1')]);
  return inline(rows);
}

export function getWebAppKeyboard() {
  const link = `${config.siteUrl}/tma`;
  if (isHttps(link)) return inline([[Markup.button.webApp('Открыть веб-версию', link)], [cb('Меню', 'menu:page:1')]]);
  return inline([[url('Открыть веб-версию', link)], [cb('Меню', 'menu:page:1')]]);
}

export function getWebSiteKeyboard() {
  return inline([[url('Открыть сайт', config.siteUrl)], [cb('Меню', 'menu:page:1')]]);
}

export function getWebOpenKeyboard() {
  const rows = [[url('Открыть сайт', config.siteUrl)]];
  const tma = `${config.siteUrl}/tma`;
  if (isHttps(tma)) rows.push([Markup.button.webApp('Открыть в Telegram', tma)]);
  rows.push([cb('Меню', 'menu:page:1')]);
  return inline(rows);
}

// ---------- Профиль ----------

export function getProfileKeyboard(user) {
  const rows = [
    [cb('Назад', 'menu:page:1'), cb('В меню', 'menu:page:1')],
    [cb('Выйти из аккаунта', 'prof:logout')],
    [cb('Скопировать ID', 'prof:copy_id'), cb('Мои аккаунты', 'acc:list')],
    [cb('Настройки клавиатуры', 'prof:kb_open')],
    [cb('Помощь', 'help:open'), cb('Веб-версия', 'web:open')],
  ];
  if (user.role === 'user' && !user.adminBanned) {
    rows.push([cb('Поменять класс', 'prof:change_class')]);
    rows.push([cb('Стать админом', 'prof:become_admin')]);
  }
  if (user.role === 'admin') rows.push([cb('Стать участником', 'prof:demote')]);
  return inline(rows);
}

export function getBackToProfileKeyboard() {
  return inline([[cb('Назад в профиль', 'prof:open')]]);
}

export function getLogoutConfirmKeyboard() {
  return inline([[cb('Да, выйти', 'prof:logout_yes')], [cb('Нет, остаться', 'prof:logout_no')]]);
}

export function getLogoutDoneKeyboard() {
  return inline([[cb('Регистрация', 'reg:start')], [cb('Помощь', 'help:open')]]);
}

// ---------- Аккаунты, привязанные к Telegram ID ----------

// mode='reg' — экран при регистрации, mode='profile' — переключение из профиля.
export function getAccountsKeyboard(accounts, mode = 'reg') {
  const rows = accounts.map((account, i) => [
    cb(`Войти: ${i + 1}`, `acc:use:${account.specId}`),
    cb(`Удалить: ${i + 1}`, `acc:del:${account.specId}`),
  ]);
  if (mode === 'reg') {
    rows.push([cb('Зарегистрировать новый', 'reg:new')]);
    rows.push([cb('Войти по спец-ID', 'login:start'), cb('Помощь', 'help')]);
  } else {
    rows.push([cb('Назад в профиль', 'prof:open')]);
  }
  return inline(rows);
}

export function getAccountSwitchKeyboard(specId) {
  return inline([[cb('Да, перейти', `acc:swyes:${specId}`)], [cb('Отмена', 'prof:open')]]);
}

export function getAccountDeleteKeyboard(specId) {
  return inline([[cb('Удалить навсегда', `acc:delyes:${specId}`)], [cb('Отмена', 'acc:list')]]);
}

export function getAccountsBackKeyboard() {
  return inline([[cb('Мои аккаунты', 'acc:list')], [cb('Меню', 'menu:page:1')]]);
}

export function getProfileMenuKeyboard() {
  return inline([[cb('Профиль', 'prof:open')], [cb('Меню', 'menu:page:1')]]);
}

export function getMenuProfileKeyboard() {
  return inline([[cb('Меню', 'menu:page:1')], [cb('Профиль', 'prof:open')]]);
}

export function getDemoteConfirmKeyboard() {
  return inline([[cb('Да, понизить', 'prof:demote_yes')], [cb('Отмена', 'prof:open')]]);
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
  rows.push([cb('Применить', 'prof:kb_apply'), cb('Посмотреть', 'prof:kb_preview')]);
  rows.push([cb('Отмена', 'prof:open')]);
  return inline(rows);
}

export function getKbPreviewBackKeyboard() {
  return inline([[cb('Назад к настройкам', 'prof:kb_open')]]);
}

// ---------- Помощь и статистика ----------

export function getHelpKeyboard(user) {
  const rows = [[cb('Меню', 'menu:page:1'), cb('Контакты', 'help:contacts')]];
  if (!user || user.status !== 'active') {
    rows.push([cb('Регистрация', 'reg:start')]);
  } else {
    rows.push([cb('Пожаловаться на админа', 'cmp:start'), cb('Отмена', 'menu:page:1')]);
  }
  return inline(rows);
}

export function getContactsKeyboard(contacts) {
  const rows = [];
  if (contacts.creatorUrl) rows.push([url('Написать создателю', contacts.creatorUrl)]);
  if (contacts.chatUrl) rows.push([url('Чат бота', contacts.chatUrl)]);
  if (contacts.donateUrl) rows.push([url('Поддержать проект', contacts.donateUrl)]);
  rows.push([cb('Поддержка', 'sup:start'), cb('Меню', 'menu:page:1')]);
  return inline(rows);
}

export function getDonateKeyboard(contacts) {
  const rows = [];
  if (contacts.donateUrl) rows.push([url('Поддержать проект', contacts.donateUrl)]);
  rows.push([cb('Меню', 'menu:page:1')]);
  return inline(rows);
}

export function getStatsKeyboard(user) {
  const rows = [[cb('Меню', 'menu:page:1')], [cb('Профиль', 'prof:open'), cb('Помощь', 'help:open')]];
  if (user.role === 'user' && !user.adminBanned) rows.push([cb('Стать админом', 'prof:become_admin')]);
  return inline(rows);
}

// ---------- Просмотр ДЗ ----------

export function getDayNavRow(dateKey) {
  const today = getToday();
  const tomorrow = getTomorrow();
  const afterTomorrow = getAfterTomorrow();
  if (dateKey === today) return [cb('Завтра', 'hw:tomorrow'), cb('Послезавтра', 'hw:after_tomorrow')];
  if (dateKey === tomorrow) return [cb('Сегодня', 'hw:today'), cb('Послезавтра', 'hw:after_tomorrow')];
  if (dateKey === afterTomorrow) return [cb('Сегодня', 'hw:today'), cb('Завтра', 'hw:tomorrow')];
  return [cb('Назад', `hw:day:${addDaysKey(dateKey, -1)}`), cb('Вперёд', `hw:day:${addDaysKey(dateKey, 1)}`)];
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
  if (hasPhotos) mediaRow.push(cb('Показать фото', `show_photos:${dateKey}`));
  mediaRow.push(cb('Расписание', 'schedule:show'));
  rows.push(mediaRow);
  if (isAdmin(user)) rows.push([cb('Редактировать этот день', `edit:day:${dateKey}`)]);
  rows.push([cb('Скопировать ДЗ', `copy:day:${dateKey}`), cb('Помощь', 'help:open')]);
  rows.push([cb('Меню', 'menu:page:1')]);
  return inline(rows);
}

export function getEmptyDayKeyboard(dateKey, user) {
  const rows = [getDayNavRow(dateKey), [cb('Расписание', 'schedule:show')]];
  if (isAdmin(user)) rows.push([cb('Добавить ДЗ', `add_day:${dateKey}`)]);
  rows.push([cb('Помощь', 'help:open')]);
  rows.push([cb('Меню', 'menu:page:1')]);
  return inline(rows);
}

export function getCopyDayKeyboard(dateKey) {
  return inline([[cb('Назад к дню', `hw:day:${dateKey}`)], [cb('Меню', 'menu:page:1')]]);
}

export function getWeekKeyboard(offset) {
  return inline([
    [cb('Сегодня', 'hw:today'), cb('Завтра', 'hw:tomorrow'), cb('Послезавтра', 'hw:after_tomorrow')],
    [cb('Расписание', 'schedule:show'), cb('Помощь', 'help:open')],
    [cb('Прошлая неделя', `cal:show:${offset - 1}`), cb('Следующая неделя', `cal:show:${offset + 1}`)],
    [cb('Меню', 'menu:page:1')],
  ]);
}

// Ячейки календаря: [дд] — сегодня, дд• — есть ДЗ. Заголовок дней недели не кликабелен (noop).
export function getCalendarKeyboard(mode, offset, datesWithHomework = []) {
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
    [cb('Прошлая неделя', 'cal:prev'), cb('Следующая неделя', 'cal:next')],
    [cb('Отмена', 'cancel'), cb('Меню', 'menu:page:1')],
  ]);
}

export function getPhotoExpiredKeyboard(dateKey) {
  return inline([[cb('Назад к дню', `hw:day:${dateKey}`)], [cb('Меню', 'menu:page:1')]]);
}

// ---------- Расписание ----------

export function getScheduleKeyboard(user, hasPhoto) {
  const rows = hasPhoto ? [[cb('Меню', 'menu:page:1')]] : [[cb('Меню', 'menu:page:1'), cb('Помощь', 'help:open')]];
  if (isAdmin(user)) rows.push([cb('Обновить расписание', 'schedule:upload')]);
  return inline(rows);
}

export function getScheduleUpdatedKeyboard() {
  return inline([[cb('Посмотреть', 'schedule:show')], [cb('Меню', 'menu:page:1')]]);
}

// ---------- Админ: ДЗ ----------

// prefix: add_subj или edit_new_subj. Быстрые предметы — 5 рядов по 3 (14 предметов + пустое место).
export function getQuickSubjectsKeyboard(prefix = 'add_subj', backData = 'adm:add') {
  const buttons = QUICK_SUBJECTS.map((name) => cb(`${getSubjectIcon(name)} ${capitalize(name)}`, `${prefix}:${getSubjectHash(name)}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
  rows.push([cb('Другой', `${prefix}:other`)]);
  rows.push([cb('Назад', backData), cb('Отмена', 'cancel')]);
  return inline(rows);
}

export function getBackCancelKeyboard(backData) {
  return inline([[cb('Назад', backData), cb('Отмена', 'cancel')]]);
}

export function getAddTaskKeyboard(subjectHash) {
  return inline([[cb('Назад', `add_subj:${subjectHash}`)], [cb('Отмена', 'cancel')]]);
}

export function getAddDoneKeyboard(dateKey) {
  return inline([
    [cb('Добавить ещё к этому', 'add:more_same')],
    [cb('Добавить другое ДЗ', 'adm:add')],
    [cb('Завершить', `hw:day:${dateKey}`)],
  ]);
}

export function getSubjectPickKeyboard(prefix, subjects, backData) {
  const rows = subjects.slice(0, 20).map((item) => [
    cb(`${getSubjectIcon(item.subjectName)} ${truncate(capitalize(item.subjectName), 40)}`, `${prefix}:${item.subjectHash}`),
  ]);
  rows.push([cb('Назад', backData), cb('Отмена', 'cancel')]);
  return inline(rows);
}

export function getBackMenuKeyboard(backData, backLabel = 'Назад') {
  return inline([[cb(backLabel, backData)], [cb('Меню', 'menu:page:1')]]);
}

export function getEditCardKeyboard(subjectHash, dateKey) {
  return inline([
    [cb('Убрать фото', 'edit:rmphotos'), cb('Удалить полностью', 'edit:rmfull')],
    [cb('Перенести на другой день', 'edit:move'), cb('Поменять предмет', 'edit:change_subj')],
    [cb('Ввести новое ДЗ', 'edit:new_text')],
    [cb('Назад', `edit_day:${dateKey}`), cb('Отмена', 'cancel')],
  ]);
}

export function getConfirmKeyboard(cancelData, confirmData, confirmLabel = 'Подтвердить') {
  return inline([[cb('Отмена', cancelData), cb(confirmLabel, confirmData)]]);
}

export function getMoveConfirmKeyboard(fromDateKey, toDateKey, subjectHash) {
  return inline([
    [cb('Назад', `edit_subj:${subjectHash}`), cb('Отмена', 'cancel')],
    [cb('Подтвердить перенос', `edit:moveyes:${fromDateKey}:${toDateKey}:${subjectHash}`)],
  ]);
}

export function getChangeSubjectConfirmKeyboard(oldHash, newHash) {
  return inline([[cb('Отмена', 'cancel'), cb('Подтвердить', `edit:change_subj_yes:${oldHash}:${newHash}`)]]);
}

export function getEditNextKeyboard(label, data) {
  return inline([[cb(label, data), cb('Меню', 'menu:page:1')]]);
}

export function getDeleteConfirmKeyboard(dateKey, subjectHash) {
  return inline([[cb('Назад', `del_day:${dateKey}`), cb('Отмена', 'cancel'), cb('Подтвердить', `del:confirm:${subjectHash}`)]]);
}

export function getAdminPanelKeyboard(user) {
  const rows = [
    [cb('Удалить ДЗ', 'adm:del'), cb('Добавить ДЗ', 'adm:add')],
    [cb('Редактировать ДЗ', 'adm:edit'), cb('В меню', 'menu:page:1')],
  ];
  if (isModerator(user)) {
    rows.push([cb('Жалобы', 'adm:reports'), cb('Все пользователи', 'adm:users')]);
    rows.push([cb('Рассылка', 'adm:bc')]);
    rows.push([cb('Выбрать класс', 'adm:pick_class')]);
  }
  return inline(rows);
}

// Классы передаются по индексу: «гимназия 25::10А» в кириллице может превысить лимит 64 байта.
export function getPickClassKeyboard(classKeys) {
  const rows = classKeys.slice(0, 30).map((key, i) => [cb(truncate(key, 50), `adm:class:${i}`)]);
  rows.push([cb('Назад', 'adm:panel'), cb('Отмена', 'cancel')]);
  return inline(rows);
}

// ---------- Жалобы ----------

export function getComplaintAdminsKeyboard(admins) {
  const rows = admins.map((admin) => [
    cb(truncate(`${admin.firstName || 'Без имени'} (@${admin.username || 'нет'})`, 50), `cmp:admin:${admin.tgId}`),
  ]);
  rows.push([cb('Отмена', 'cancel')]);
  return inline(rows);
}

export function getComplaintConfirmKeyboard() {
  return inline([[cb('Отмена', 'cancel'), cb('Отправить', 'cmp:send')]]);
}

export function getReportActionsKeyboard(reportId, viewer, { withBack = false } = {}) {
  const rows = [[cb('Выдать варн', `rep:warn:${reportId}`), cb('Отклонить', `rep:reject:${reportId}`)]];
  const second = [cb('Понизить до участника', `rep:demote:${reportId}`)];
  if (!viewer || viewer.role !== 'creator') second.push(cb('Эскалировать создателю', `rep:escalate:${reportId}`));
  rows.push(second);
  if (withBack) rows.push([cb('Назад', 'crt:panel')]);
  return inline(rows);
}

export function getEscalateThreeKeyboard(specId) {
  return inline([[cb('Забанить', `crt:ban:${specId}`), cb('Сбросить варны', `crt:resetwarns:${specId}`)]]);
}

// ---------- Панель создателя ----------

export function getCreatorPanelKeyboard(user) {
  const rows = [
    [cb('Жалобы', 'crt:reports'), cb('Пользователи', 'crt:users')],
    [cb('Поддержка', 'sup:list'), cb('Рассылка', 'bc:creator')],
    [cb('Бан по ID', 'crt:banid'), cb('Разбан по ID', 'crt:unbanid')],
    [cb('В меню', 'menu:page:1')],
  ];
  if (isCreator(user)) rows.push([cb('Новости (сайт)', 'crt:news')]);
  return inline(rows);
}

export function getBackToPanelKeyboard() {
  return inline([[cb('Назад', 'crt:panel')]]);
}

export function getUsersSearchKeyboard() {
  return inline([[cb('Последние 10', 'crt:recent')], [cb('Назад', 'crt:panel'), cb('Отмена', 'cancel')]]);
}

export function getUserMoreKeyboard(specId) {
  return inline([[cb('Подробнее', `crt:user:${specId}`)]]);
}

export function getUserCardKeyboard(target, viewer) {
  const rows = [];
  rows.push([target.banned ? cb('Разбанить', `crt:unban:${target.specId}`) : cb('Забанить', `crt:ban:${target.specId}`)]);
  if (isCreator(viewer)) {
    if (target.role === 'user') rows.push([cb('Повысить до админа', `crt:promote:${target.specId}`)]);
    if (target.role === 'admin' || target.role === 'support') {
      rows.push([cb('Понизить до участника', `crt:demote:${target.specId}`)]);
    }
  } else if (target.role === 'admin') {
    rows.push([cb('Понизить до участника', `crt:demote:${target.specId}`)]);
  }
  rows.push([cb('Выдать варн', `crt:warn:${target.specId}`), cb('Сбросить варны', `crt:resetwarns:${target.specId}`)]);
  if (isCreator(viewer) && target.adminBanned) rows.push([cb('Снять запрет на админа', `crt:adminunban:${target.specId}`)]);
  if (isCreator(viewer)) rows.push([cb('Удалить аккаунт', `crt:delete:${target.specId}`)]);
  rows.push([cb('Назад', 'crt:users')]);
  return inline(rows);
}

export function getBanReasonKeyboard(specId) {
  return inline([[cb('Без причины', `crt:banno:${specId}`)], [cb('Отмена', `crt:user:${specId}`)]]);
}

export function getBanIdInputKeyboard() {
  return inline([[cb('Назад', 'crt:panel'), cb('Отмена', 'cancel')]]);
}

export function getBanIdReasonKeyboard() {
  return inline([[cb('Без причины', 'crt:banid_noreason')], [cb('Отмена', 'crt:panel')]]);
}

export function getDeleteAccountConfirmKeyboard(specId) {
  return inline([[cb('Отмена', `crt:user:${specId}`), cb('Удалить навсегда', `crt:delyes:${specId}`)]]);
}

export function getUserBackKeyboard(specId) {
  return inline([[cb('К пользователю', `crt:user:${specId}`)], [cb('Назад', 'crt:users')]]);
}

// ---------- Рассылки ----------

export function getBroadcastAudienceKeyboard() {
  return inline([
    [cb('Всем', 'bc:aud:all'), cb('По городу', 'bc:aud:city')],
    [cb('По школе', 'bc:aud:school'), cb('По классу', 'bc:aud:class')],
    [cb('Отмена', 'cancel')],
  ]);
}

export function getBroadcastValuesKeyboard(values) {
  const rows = values.slice(0, 30).map((value, i) => [cb(truncate(value, 50), `bc:val:${i}`)]);
  rows.push([cb('Назад', 'bc:creator'), cb('Отмена', 'cancel')]);
  return inline(rows);
}

export function getBroadcastConfirmKeyboard() {
  return inline([[cb('Отмена', 'cancel'), cb('Отправить', 'bc:send')]]);
}

// ---------- Поддержка ----------

export function getTicketActionsKeyboard(ticketId) {
  return inline([[cb('Ответить', `sup:reply:${ticketId}`), cb('Закрыть', `sup:close:${ticketId}`)]]);
}

export function getTicketsBackKeyboard() {
  return inline([[cb('Назад к тикетам', 'sup:list')]]);
}

export function getSupportDoneKeyboard() {
  return inline([[cb('Написать ещё', 'sup:start')], [cb('Меню', 'menu:page:1')]]);
}

export { pairs };
