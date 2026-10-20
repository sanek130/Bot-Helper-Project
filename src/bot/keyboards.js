import { Markup } from 'telegraf';
import { TEXTS } from './texts.js';

// Базовые inline-кнопки
export const BUTTONS = {
  // Регистрация
  register: Markup.button.callback(TEXTS.buttons.register, 'reg_step1'),
  cancel: Markup.button.callback(TEXTS.buttons.cancel, 'cancel'),
  back: Markup.button.callback(TEXTS.buttons.back, 'back'),
  help: Markup.button.callback(TEXTS.buttons.help, 'help'),
  
  // Меню
  menu: Markup.button.callback(TEXTS.buttons.menu, 'menu'),
  today: Markup.button.callback(TEXTS.buttons.today, 'today'),
  tomorrow: Markup.button.callback(TEXTS.buttons.tomorrow, 'tomorrow'),
  dayAfterTomorrow: Markup.button.callback(TEXTS.buttons.dayAfterTomorrow, 'dayAfterTomorrow'),
  week: Markup.button.callback(TEXTS.buttons.week, 'week'),
  otherWeek: Markup.button.callback(TEXTS.buttons.otherWeek, 'otherWeek'),
  selectDay: Markup.button.callback(TEXTS.buttons.selectDay, 'selectDay'),
  allHomework: Markup.button.callback(TEXTS.buttons.allHomework, 'allHomework'),
  schedule: Markup.button.callback(TEXTS.buttons.schedule, 'schedule'),
  profile: Markup.button.callback(TEXTS.buttons.profile, 'profile'),
  settings: Markup.button.callback(TEXTS.buttons.settings, 'settings'),
  web: Markup.button.callback(TEXTS.buttons.web, 'web'),
  stats: Markup.button.callback(TEXTS.buttons.stats, 'stats'),
  adminPanel: Markup.button.callback(TEXTS.buttons.adminPanel, 'adminPanel'),
  
  // Админ
  addHomework: Markup.button.callback(TEXTS.buttons.addHomework, 'addHomework'),
  deleteHomework: Markup.button.callback(TEXTS.buttons.deleteHomework, 'deleteHomework'),
  editHomework: Markup.button.callback(TEXTS.buttons.editHomework, 'editHomework'),
  uploadSchedule: Markup.button.callback(TEXTS.buttons.uploadSchedule, 'uploadSchedule'),
  
  // Профиль
  changeClass: Markup.button.callback(TEXTS.buttons.changeClass, 'changeClass'),
  becomeAdmin: Markup.button.callback(TEXTS.buttons.becomeAdmin, 'becomeAdmin'),
  becomeUser: Markup.button.callback(TEXTS.buttons.becomeUser, 'becomeUser'),
  logout: Markup.button.callback(TEXTS.buttons.logout, 'logout'),
  copyId: Markup.button.callback(TEXTS.buttons.copyId, 'copyId'),
  keyboardSettings: Markup.button.callback(TEXTS.buttons.keyboardSettings, 'keyboardSettings'),
  
  // ДЗ
  showPhotos: Markup.button.callback(TEXTS.buttons.showPhotos, 'showPhotos'),
  copyHomework: Markup.button.callback(TEXTS.buttons.copyHomework, 'copyHomework'),
  duplicateDay: Markup.button.callback(TEXTS.buttons.duplicateDay, 'duplicateDay'),
  
  // Регистрация шаги
  fullList: Markup.button.callback(TEXTS.buttons.fullList, 'fullList'),
  otherSchool: Markup.button.callback(TEXTS.buttons.otherSchool, 'otherSchool'),
  next: Markup.button.callback(TEXTS.buttons.next, 'next'),
  confirm: Markup.button.callback(TEXTS.buttons.confirm, 'confirm'),
  complete: Markup.button.callback(TEXTS.buttons.complete, 'complete'),
  hasAccount: Markup.button.callback(TEXTS.buttons.hasAccount, 'hasAccount'),
  reRegister: Markup.button.callback(TEXTS.buttons.reRegister, 'reRegister'),
  
  // Роли
  user: Markup.button.callback(TEXTS.buttons.user, 'role_user'),
  admin: Markup.button.callback(TEXTS.buttons.admin, 'role_admin'),
  
  // Буквы класса
  letterA: Markup.button.callback('А', 'letter_А'),
  letterB: Markup.button.callback('Б', 'letter_Б'),
  letterV: Markup.button.callback('В', 'letter_В'),
  letterG: Markup.button.callback('Г', 'letter_Г'),
  letterD: Markup.button.callback('Д', 'letter_Д'),
  letterE: Markup.button.callback('Е', 'letter_Е'),
  
  // Номера класса
  class4: Markup.button.callback('4', 'class_4'),
  class5: Markup.button.callback('5', 'class_5'),
  class6: Markup.button.callback('6', 'class_6'),
  class7: Markup.button.callback('7', 'class_7'),
  class8: Markup.button.callback('8', 'class_8'),
  class9: Markup.button.callback('9', 'class_9'),
  class10: Markup.button.callback('10', 'class_10'),
  class11: Markup.button.callback('11', 'class_11'),
};

// Клавиатура для незарегистрированных
export function notRegisteredKeyboard() {
  return Markup.inlineKeyboard([
    [BUTTONS.register],
    [BUTTONS.help],
  ]);
}

// Клавиатура после успешной регистрации
export function registrationSuccessKeyboard() {
  return Markup.inlineKeyboard([
    [BUTTONS.reRegister, BUTTONS.menu],
    [BUTTONS.profile, BUTTONS.help],
  ]);
}

// Клавиатура подтверждения перерегистрации
export function reRegisterWarningKeyboard() {
  return Markup.inlineKeyboard([
    [BUTTONS.confirm, BUTTONS.cancel],
  ]);
}

// Клавиатура шага 1 регистрации (город)
export function regStep1Keyboard(cities) {
  const rows = [];
  for (let i = 0; i < cities.length; i += 2) {
    const row = [Markup.button.callback(cities[i], `city_${i}`)];
    if (cities[i + 1]) {
      row.push(Markup.button.callback(cities[i + 1], `city_${i + 1}`));
    }
    rows.push(row);
  }
  rows.push([BUTTONS.fullList]);
  rows.push([BUTTONS.next]);
  rows.push([BUTTONS.cancel, BUTTONS.help]);
  return Markup.inlineKeyboard(rows);
}

// Клавиатура шага 2 регистрации (школа)
export function regStep2Keyboard(schools) {
  const rows = [];
  for (let i = 0; i < schools.length; i += 2) {
    const row = [Markup.button.callback(schools[i], `school_${i}`)];
    if (schools[i + 1]) {
      row.push(Markup.button.callback(schools[i + 1], `school_${i + 1}`));
    }
    rows.push(row);
  }
  rows.push([BUTTONS.next]);
  rows.push([BUTTONS.fullList, BUTTONS.otherSchool]);
  rows.push([BUTTONS.back]);
  return Markup.inlineKeyboard(rows);
}

// Клавиатура шага 3.1 регистрации (буква)
export function regStep3LetterKeyboard() {
  return Markup.inlineKeyboard([
    [BUTTONS.letterA, BUTTONS.letterB, BUTTONS.letterV],
    [BUTTONS.letterG, BUTTONS.letterD, BUTTONS.letterE],
    [BUTTONS.back],
    [BUTTONS.cancel],
  ]);
}

// Клавиатура шага 3.2 регистрации (номер)
export function regStep3NumberKeyboard() {
  return Markup.inlineKeyboard([
    [BUTTONS.class4, BUTTONS.class5, BUTTONS.class6, BUTTONS.class7],
    [BUTTONS.class8, BUTTONS.class9, BUTTONS.class10, BUTTONS.class11],
    [BUTTONS.back],
    [BUTTONS.cancel],
  ]);
}

// Клавиатура шага 4 регистрации (роль)
export function regStep4Keyboard() {
  return Markup.inlineKeyboard([
    [BUTTONS.user],
    [BUTTONS.admin],
    [BUTTONS.back],
    [BUTTONS.cancel],
  ]);
}

// Клавиатура шага 5 регистрации (подтверждение)
export function regStep5Keyboard() {
  return Markup.inlineKeyboard([
    [BUTTONS.complete],
    [BUTTONS.hasAccount],
    [BUTTONS.cancel, BUTTONS.help],
    [BUTTONS.back],
  ]);
}

// Клавиатура главного меню (страница 1)
export function mainMenuPage1Keyboard(isAdmin) {
  const rows = [
    [BUTTONS.tomorrow],
    [BUTTONS.today, BUTTONS.dayAfterTomorrow],
    [BUTTONS.week, BUTTONS.selectDay],
    [BUTTONS.schedule],
    [BUTTONS.profile, BUTTONS.settings],
  ];
  
  if (isAdmin) {
    rows.push([BUTTONS.editHomework]);
    rows.push([BUTTONS.uploadSchedule]);
    rows.push([BUTTONS.schedule]); // Рассылка классу
  }
  
  rows.push([BUTTONS.menu]);
  return Markup.inlineKeyboard(rows);
}

// Клавиатура главного меню (страница 2)
export function mainMenuPage2Keyboard(isAdmin) {
  const rows = [
    [BUTTONS.web],
    [BUTTONS.stats, BUTTONS.help],
  ];
  
  if (isAdmin) {
    rows.push([BUTTONS.adminPanel]);
  }
  
  rows.push([BUTTONS.back]);
  return Markup.inlineKeyboard(rows);
}

// Клавиатура карточки дня
export function dayCardKeyboard(dateStr, hasPhotos, isAdmin) {
  const rows = [
    [BUTTONS.today, BUTTONS.tomorrow, BUTTONS.dayAfterTomorrow],
  ];
  
  if (hasPhotos) {
    rows.push([BUTTONS.showPhotos]);
  }
  
  rows.push([BUTTONS.schedule]);
  rows.push([BUTTONS.copyHomework, BUTTONS.help]);
  
  if (isAdmin) {
    rows.push([BUTTONS.editHomework]);
  }
  
  rows.push([BUTTONS.menu]);
  return Markup.inlineKeyboard(rows);
}

// Клавиатура календаря
export function calendarKeyboard(weekOffset, canGoBack, canGoForward) {
  const rows = [];
  
  if (canGoBack) {
    rows.push([BUTTONS.back]);
  }
  
  if (canGoForward) {
    rows.push([BUTTONS.next]);
  }
  
  rows.push([BUTTONS.cancel, BUTTONS.menu]);
  return Markup.inlineKeyboard(rows);
}

// Клавиатура расписания
export function scheduleKeyboard(isAdmin) {
  const rows = [
    [BUTTONS.menu],
  ];
  
  if (isAdmin) {
    rows.push([BUTTONS.uploadSchedule]);
  }
  
  return Markup.inlineKeyboard(rows);
}

// Клавиатура профиля
export function profileKeyboard(isAdmin, isAdminBanned) {
  const rows = [
    [BUTTONS.back, BUTTONS.menu],
    [BUTTONS.logout],
    [BUTTONS.copyId],
    [BUTTONS.keyboardSettings],
    [BUTTONS.help, BUTTONS.web],
  ];
  
  if (!isAdmin) {
    rows.push([BUTTONS.changeClass]);
    if (!isAdminBanned) {
      rows.push([BUTTONS.becomeAdmin]);
    }
  } else {
    rows.push([BUTTONS.becomeUser]);
  }
  
  return Markup.inlineKeyboard(rows);
}

// Клавиатура настроек клавиатуры
export function keyboardSettingsKeyboard() {
  return Markup.inlineKeyboard([
    [BUTTONS.apply, BUTTONS.preview, BUTTONS.cancel],
  ]);
}

// Клавиатура админ-панели
export function adminPanelKeyboard(isCreator) {
  const rows = [
    [BUTTONS.deleteHomework, BUTTONS.addHomework],
    [BUTTONS.editHomework, BUTTONS.menu],
  ];
  
  if (isCreator) {
    rows.push([BUTTONS.stats, BUTTONS.settings]);
    rows.push([BUTTONS.schedule]); // Рассылка
  }
  
  return Markup.inlineKeyboard(rows);
}

// Клавиатура помощи
export function helpKeyboard(isRegistered) {
  const rows = [
    [BUTTONS.menu],
  ];
  
  if (!isRegistered) {
    rows.push([BUTTONS.register]);
  } else {
    rows.push([BUTTONS.schedule]); // Пожаловаться на админа
  }
  
  rows.push([BUTTONS.cancel]);
  return Markup.inlineKeyboard(rows);
}

// Нижняя клавиатура (reply)
export function replyKeyboard(buttons) {
  return Markup.keyboard(buttons.map(b => [b])).resize();
}

// Клавиатура выбора предмета
export function subjectKeyboard(subjects) {
  const rows = [];
  for (let i = 0; i < subjects.length; i += 2) {
    const row = [Markup.button.callback(subjects[i], `subject_${i}`)];
    if (subjects[i + 1]) {
      row.push(Markup.button.callback(subjects[i + 1], `subject_${i + 1}`));
    }
    rows.push(row);
  }
  rows.push([Markup.button.callback('Другой', 'subject_other')]);
  rows.push([BUTTONS.back, BUTTONS.cancel]);
  return Markup.inlineKeyboard(rows);
}

// Клавиатура чеклиста
export function checklistKeyboard(dateStr, subjects, doneSet) {
  const rows = subjects.map((subject, i) => [{
    text: doneSet.has(subject) ? `↩️ ${subject}` : `✅ ${subject}`,
    callback_data: `toggle_${dateStr}_${i}`
  }]);
  rows.push([BUTTONS.menu]);
  return Markup.inlineKeyboard(rows);
}
