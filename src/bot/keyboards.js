import { TEXTS } from './texts.js';
import { subjectKey, getSubjectIcon } from '../utils/subjects.js';
import { toDateKey, addDaysToKey, dayTitle } from '../services/dateService.js';
import config from '../config.js';

const B = TEXTS.buttons;

function btn(text, callback_data) {
  return { text, callback_data };
}

// Кнопка мини-приложения: Telegram принимает только https-адреса
export function webAppButton(text = B.app) {
  return config.site.webAppUrl ? { text, web_app: { url: config.site.webAppUrl } } : null;
}

function inline(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}

// Нижняя reply-клавиатура: ряды по две кнопки, «Меню» обязательна
export function replyKeyboard(buttons = []) {
  const items = [...new Set([...buttons.filter((b) => b !== 'Меню'), 'Меню'])];
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }
  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

export function startKeyboard() {
  return inline([
    [btn(B.start, 'reg:start')],
    [btn(B.hasAccount, 'login:start')],
    [btn(B.help, 'help')],
  ]);
}

export function regCityKeyboard(cities, page = 0, pageSize = 4) {
  const start = page * pageSize;
  const list = cities.slice(start, start + pageSize);
  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    rows.push(list.slice(i, i + 2).map((city, index) => btn(city.name, `reg:city:${start + i + index}`)));
  }
  rows.push([btn(B.back, 'reg:back:city'), btn(B.next, 'reg:cities:next')]);
  rows.push([btn(B.fullList, 'reg:cities:list')]);
  rows.push([btn(B.cancel, 'reg:cancel'), btn(B.help, 'help')]);
  return inline(rows);
}

export function regBackKeyboard(step) {
  return inline([[btn(B.back, `reg:back:${step}`), btn(B.cancel, 'reg:cancel')], [btn(B.help, 'help')]]);
}

export function regSchoolKeyboard(schools, page = 0, pageSize = 6) {
  const start = page * pageSize;
  const list = schools.slice(start, start + pageSize);
  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    rows.push(list.slice(i, i + 2).map((school, index) => btn(school, `reg:school:${start + i + index}`)));
  }
  const nav = [];
  if (page > 0) nav.push(btn(B.back, `reg:schools:page:${page - 1}`));
  if ((page + 1) * pageSize < schools.length) nav.push(btn(B.next, `reg:schools:page:${page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([btn(B.fullList, 'reg:schools:list'), btn(B.otherSchool, 'reg:other_school')]);
  rows.push([btn(B.toCity, 'reg:back:city'), btn(B.cancel, 'reg:cancel')]);
  return inline(rows);
}

export function regLetterKeyboard() {
  return inline([
    [btn('А', 'reg:letter:А'), btn('Б', 'reg:letter:Б'), btn('В', 'reg:letter:В')],
    [btn('Г', 'reg:letter:Г'), btn('Д', 'reg:letter:Д'), btn('Е', 'reg:letter:Е')],
    [btn(B.toSchool, 'reg:back:school')],
    [btn(B.toCity, 'reg:back:city')],
  ]);
}

export function regNumberKeyboard() {
  return inline([
    [btn('4', 'reg:num:4'), btn('5', 'reg:num:5'), btn('6', 'reg:num:6'), btn('7', 'reg:num:7')],
    [btn('8', 'reg:num:8'), btn('9', 'reg:num:9'), btn('10', 'reg:num:10'), btn('11', 'reg:num:11')],
    [btn(B.toSchool, 'reg:back:school')],
    [btn(B.toLetter, 'reg:back:letter')],
  ]);
}

export function regConfirmKeyboard() {
  return inline([
    [btn(B.complete, 'reg:done')],
    [btn(B.hasAccount, 'login:start')],
    [btn(B.changeCity, 'reg:back:city'), btn(B.changeSchool, 'reg:back:school')],
    [btn(B.changeLetter, 'reg:back:letter'), btn(B.changeNumber, 'reg:back:number')],
    [btn(B.cancel, 'reg:cancel'), btn(B.help, 'help')],
  ]);
}

export function reRegisterKeyboard() {
  return inline([[btn(B.confirm, 'reg:rereg_yes'), btn(B.cancel, 'reg:cancel')]]);
}

export function successKeyboard() {
  return inline([
    [btn(B.menu, 'menu1'), btn(B.addPhone, 'prof:phone')],
    [btn(B.profile, 'profile'), btn(B.help, 'help')],
    [btn(B.reRegister, 'reg:rereg')],
  ]);
}

export function loginStartKeyboard() {
  return inline([
    [btn(B.back, 'reg:back:5'), btn(B.help, 'help')],
    [btn(B.cancel, 'reg:cancel')],
  ]);
}

export function loginConfirmKeyboard(requestId = '') {
  return inline([
    [btn('Подтвердить вход', `login:confirm${requestId ? `:${requestId}` : ''}`)],
    [btn(B.cancel, 'reg:cancel')],
  ]);
}

export function loginOwnerKeyboard(requestId) {
  return inline([
    [btn('Да, это я', `login:approve:${requestId}`)],
    [btn('Нет', `login:deny:${requestId}`)],
  ]);
}

export function loginFailedKeyboard() {
  return inline([
    [btn(B.repeat, 'login:start'), btn(B.changeData, 'login:start')],
    [btn(B.cancel, 'reg:cancel'), btn(B.help, 'help')],
  ]);
}

export function menuPage1Keyboard(user) {
  const admin = user.role === 'admin' || user.role === 'creator';
  const rows = [
    [btn(B.today, 'hw:today'), btn(B.tomorrow, 'hw:tomorrow')],
    [btn(B.dayAfterTomorrow, 'hw:after'), btn(B.week, 'week:0')],
    [btn(B.selectDay, 'cal:show:0'), btn(B.schedule, 'schedule')],
  ];
  const app = webAppButton();
  if (app) rows.push([app]);
  rows.push([btn(B.profile, 'profile'), btn(B.settings, 'menu2')]);
  if (admin) {
    rows.push([btn(B.addHomework, 'adm:add'), btn(B.changeHomework, 'adm:edit')]);
    rows.push([btn(B.uploadSchedule, 'schedule:update'), btn(B.broadcastClass, 'bc:class')]);
  }
  if (user.role === 'creator') rows.push([btn(B.creatorPanel, 'adm:panel')]);
  return inline(rows);
}

export function menuPage2Keyboard(user) {
  const rows = [
    [btn(B.web, 'web'), btn(B.stats, 'stats')],
    [btn(B.support, 'sup:start'), btn(B.help, 'help')],
  ];
  if (user.role === 'admin') rows.push([btn(B.adminPanel, 'adm:panel')]);
  if (user.role === 'creator') rows.push([btn(B.creatorPanel, 'adm:panel')]);
  rows.push([btn(B.maxSoon, 'max')]);
  rows.push([btn(B.back, 'menu1')]);
  return inline(rows);
}

export function dayCardKeyboard(dateKey, { hasPhotos = false, isAdmin = false, subjects = [], doneSet = new Set() } = {}) {
  const today = toDateKey();
  const rows = [];

  if (dateKey === today) rows.push([btn(B.tomorrow, 'hw:tomorrow'), btn(B.dayAfterTomorrow, 'hw:after')]);
  else if (dateKey === addDaysToKey(today, 1)) rows.push([btn(B.today, 'hw:today'), btn(B.dayAfterTomorrow, 'hw:after')]);
  else if (dateKey === addDaysToKey(today, 2)) rows.push([btn(B.today, 'hw:today'), btn(B.tomorrow, 'hw:tomorrow')]);
  else rows.push([btn(B.back, 'hw:today'), btn(B.selectDay, 'cal:show:0')]);

  for (const subject of subjects.slice(0, 10)) {
    const mark = doneSet.has(subject) ? '✅' : '☐';
    rows.push([btn(`${mark} ${subject}`, `chk:${dateKey}:${subjectKey(subject)}`)]);
  }

  const actions = [];
  if (hasPhotos) actions.push(btn(B.showPhotos, `photos:${dateKey}`));
  actions.push(btn(B.schedule, 'schedule'));
  if (actions.length) rows.push(actions);
  if (isAdmin) rows.push([btn(B.editHomework, `edit_day_${dateKey}`)]);
  rows.push([btn(B.copyHomework, `copy:${dateKey}`), btn(B.help, 'help')]);
  rows.push([btn(B.menu, 'menu1')]);
  return inline(rows);
}

export function weekKeyboard(offset = 0) {
  const rows = [
    [btn(B.today, 'hw:today'), btn(B.tomorrow, 'hw:tomorrow'), btn(B.dayAfterTomorrow, 'hw:after')],
    [btn(B.schedule, 'schedule'), btn(B.help, 'help')],
  ];
  if (offset < 1) rows.push([btn(B.otherWeek, `week:${offset + 1}`)]);
  if (offset > 0) rows.push([btn(B.back, `week:${offset - 1}`)]);
  rows.push([btn(B.menu, 'menu1')]);
  return inline(rows);
}

export function calendarKeyboard({ mode = 'show', weekOffset = 0, dates, data, todayKey, minOffset = -2, maxOffset = 8 }) {
  const weakdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const header = weakdays.map((day) => btn(day, 'noop'));
  const dayRow = dates.map((date) => {
    const hasHomework = data[date] && Object.keys(data[date]).length > 0;
    const day = date.split('-')[2];
    let label = day;
    if (date === todayKey) label = `[${day}]`;
    else if (hasHomework) label = `${day}•`;
    return btn(label, `${mode}_day_${date}`);
  });

  const rows = [header, dayRow];
  const nav = [];
  if (weekOffset > minOffset) nav.push(btn(B.prevWeek, `cal:${mode}:${weekOffset - 1}`));
  if (weekOffset < maxOffset) nav.push(btn(B.nextWeek, `cal:${mode}:${weekOffset + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([btn(B.cancel, 'reg:cancel'), btn(B.menu, 'menu1')]);
  return inline(rows);
}

export function allHomeworkKeyboard(days) {
  return inline([
    ...days.map((day) => [btn(`${dayTitle(day.date)} · ${day.count}`, `hw:day:${day.date}`)]),
    [btn(B.menu, 'menu1')],
  ]);
}

export function scheduleKeyboard(isAdmin) {
  const rows = [];
  if (isAdmin) rows.push([btn(B.uploadSchedule, 'schedule:update')]);
  rows.push([btn(B.menu, 'menu1')]);
  rows.push([btn(B.help, 'help')]);
  return inline(rows);
}

export function profileKeyboard(user) {
  const rows = [
    [btn(B.copyId, 'prof:copy'), btn(user.phone ? '📱 Обновить номер' : B.addPhone, 'prof:phone')],
    [btn(B.keyboardSettings, 'kb:open'), btn(B.web, 'web')],
  ];
  if (user.role === 'user') {
    rows.push([btn(B.changeClass, 'prof:class')]);
    rows.push([btn(B.reportAdmin, 'cmp:start')]);
  } else if (user.role === 'admin') {
    rows.push([btn(B.becomeUser, 'prof:demote')]);
  }
  rows.push([btn(B.support, 'sup:start'), btn(B.help, 'help')]);
  rows.push([btn(B.logout, 'prof:logout')]);
  rows.push([btn(B.menu, 'menu1')]);
  return inline(rows);
}

export function keyboardSettingsKeyboard(available, selected) {
  const rows = [];
  for (let i = 0; i < available.length; i += 2) {
    const row = available.slice(i, i + 2).map((name, index) => {
      const mark = selected.includes(name) ? '✅' : '☐';
      return btn(`${mark} ${name}`, `kb:toggle:${i + index}`);
    });
    rows.push(row);
  }
  rows.push([btn(B.apply, 'kb:apply'), btn(B.preview, 'kb:preview')]);
  rows.push([btn(B.cancel, 'profile')]);
  return inline(rows);
}

export function statsKeyboard() {
  return inline([[btn(B.menu, 'menu1')], [btn(B.profile, 'profile'), btn(B.help, 'help')]]);
}

export function adminPanelKeyboard(user) {
  const rows = [
    [btn(B.deleteHomework, 'adm:del'), btn(B.addHomework, 'adm:add')],
    [btn(B.editHomework, 'adm:edit'), btn(B.menu, 'menu1')],
  ];
  if (user.role === 'creator') {
    rows.push([btn(B.users, 'adm:users'), btn(B.supportInbox, 'sup:list')]);
    rows.push([btn(B.complaints, 'adm:reports'), btn(B.sendBroadcast, 'bc:creator')]);
  }
  return inline(rows);
}

export function subjectKeyboard(dateKey, subjects) {
  const rows = [];
  for (let i = 0; i < subjects.length; i += 3) {
    rows.push(subjects.slice(i, i + 3).map((subject) => btn(subject, `add:subject:${dateKey}:${subjectKey(subject)}`)));
  }
  rows.push([btn(B.other, 'add:other'), btn(B.cancel, 'reg:cancel')]);
  return inline(rows);
}

export function deleteSubjectKeyboard(dateKey, subjects) {
  const rows = subjects.map((subject) => [btn(`${getSubjectIcon(subject)} ${subject}`, `del:sub:${dateKey}:${subjectKey(subject)}`)]);
  rows.push([btn(B.back, 'adm:del'), btn(B.cancel, 'reg:cancel')]);
  return inline(rows);
}

export function editSubjectKeyboard(dateKey, subjects) {
  const rows = subjects.map((subject) => [btn(`${getSubjectIcon(subject)} ${subject}`, `edit:sub:${dateKey}:${subjectKey(subject)}`)]);
  rows.push([btn(B.back, 'adm:edit'), btn(B.cancel, 'reg:cancel')]);
  return inline(rows);
}

export function editActionsKeyboard(dateKey, key) {
  return inline([
    [btn(B.removePhoto, `edit:rmphoto:${dateKey}:${key}`), btn(B.deleteFully, `edit:delete:${dateKey}:${key}`)],
    [btn(B.moveDay, `edit:move:${dateKey}:${key}`), btn(B.changeSubject, `edit:subject:${dateKey}:${key}`)],
    [btn(B.enterNew, `edit:text:${dateKey}:${key}`)],
    [btn(B.back, 'adm:edit'), btn(B.cancel, 'reg:cancel')],
  ]);
}

export function confirmKeyboard(action, payload) {
  return inline([[btn(B.cancel, 'adm:edit'), btn(B.confirm, `${action}:${payload}`)]]);
}

export function moveConfirmKeyboard(payload) {
  return inline([
    [btn(B.back, 'adm:edit'), btn(B.cancel, 'reg:cancel')],
    [btn(B.confirmMove, `edit:moveyes:${payload}`)],
  ]);
}

export function complaintsAdminKeyboard(admins) {
  const rows = admins.map((admin, index) => [btn(`${admin.firstName || 'Админ'} · ${admin.class}`, `cmp:admin:${index}`)]);
  rows.push([btn(B.cancel, 'reg:cancel')]);
  return inline(rows);
}

export function reportActionsKeyboard(reportId) {
  return inline([
    [btn('Выдать варн', `rep:warn:${reportId}`), btn(B.reject, `rep:reject:${reportId}`)],
    [btn('Понизить до участника', `rep:demote:${reportId}`)],
    [btn(B.menu, 'menu1')],
  ]);
}

export function broadcastTargetKeyboard() {
  return inline([
    [btn(B.all, 'bc:target:all')],
    [btn(B.byCity, 'bc:target:city'), btn(B.bySchool, 'bc:target:school')],
    [btn(B.byClass, 'bc:target:class')],
    [btn(B.cancel, 'reg:cancel')],
  ]);
}

export function broadcastValuesKeyboard(target, values) {
  const rows = values.slice(0, 20).map((value, index) => [btn(value, `bc:value:${index}`)]);
  rows.push([btn(B.back, 'bc:creator'), btn(B.cancel, 'reg:cancel')]);
  return inline(rows);
}

export function broadcastConfirmKeyboard() {
  return inline([[btn(B.cancel, 'reg:cancel'), btn(B.send, 'bc:send')]]);
}

export function classLetterKeyboard() {
  return inline([
    [btn('А', 'cls:letter:А'), btn('Б', 'cls:letter:Б'), btn('В', 'cls:letter:В')],
    [btn('Г', 'cls:letter:Г'), btn('Д', 'cls:letter:Д'), btn('Е', 'cls:letter:Е')],
    [btn(B.cancel, 'profile')],
  ]);
}

export function classNumberKeyboard() {
  return inline([
    [btn('4', 'cls:num:4'), btn('5', 'cls:num:5'), btn('6', 'cls:num:6'), btn('7', 'cls:num:7')],
    [btn('8', 'cls:num:8'), btn('9', 'cls:num:9'), btn('10', 'cls:num:10'), btn('11', 'cls:num:11')],
    [btn(B.toLetter, 'cls:back:letter')],
    [btn(B.cancel, 'profile')],
  ]);
}

export function rowConfirmKeyboard(backCallback, confirmCallback) {
  return inline([[btn(B.back, backCallback), btn(B.cancel, 'reg:cancel'), btn(B.confirm, confirmCallback)]]);
}

export function afterSaveKeyboard() {
  return inline([
    [btn(TEXTS.add.addMore, 'add:more'), btn(TEXTS.add.finish, 'add:finish')],
    [btn(B.addHomework, 'adm:add'), btn(B.menu, 'menu1')],
  ]);
}

export function newSubjectKeyboard(dateKey, subjects) {
  const rows = [];
  for (let i = 0; i < subjects.length; i += 3) {
    rows.push(subjects.slice(i, i + 3).map((subject) => btn(subject, `edit:newsub:${dateKey}:${subjectKey(subject)}`)));
  }
  rows.push([btn(B.cancel, 'reg:cancel')]);
  return inline(rows);
}

export function afterEditKeyboard() {
  return inline([
    [btn(TEXTS.edit.editMore, 'adm:edit'), btn(B.menu, 'menu1')],
  ]);
}

export function backCancelKeyboard(backCallback) {
  return inline([[btn(B.back, backCallback), btn(B.cancel, 'reg:cancel')]]);
}

export function bannedKeyboard() {
  return inline([[btn(B.writeSupport, 'sup:start')]]);
}

export function sharePhoneKeyboard() {
  return {
    reply_markup: {
      keyboard: [[{ text: B.sharePhone, request_contact: true }], [{ text: B.cancel }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

export function creatorUserKeyboard(target, { canModerate = true } = {}) {
  const id = target.specId;
  const rows = [];
  if (canModerate) {
    if (target.role === 'admin') rows.push([btn(B.demote, `crt:demote:${id}`)]);
    else if (!target.banned) rows.push([btn(B.promote, `crt:promote:${id}`)]);
    rows.push([btn(B.warn, `crt:warn:${id}`), btn(B.resetWarns, `crt:unwarn:${id}`)]);
    rows.push([target.banned ? btn(B.unban, `crt:unban:${id}`) : btn(B.ban, `crt:ban:${id}`)]);
    rows.push([btn(B.deleteAccount, `crt:del:${id}`)]);
  }
  rows.push([btn(B.back, 'adm:users'), btn(B.creatorPanel, 'adm:panel')]);
  return inline(rows);
}

export function supportTicketKeyboard(ticketId) {
  return inline([[btn(B.answer, `sup:reply:${ticketId}`), btn(B.close, `sup:close:${ticketId}`)]]);
}
