const { Markup } = require('telegraf');

/**
 * Главное меню с динамическими кнопками в зависимости от времени суток и дня недели
 * @param {Object} user - объект пользователя из БД
 * @param {Date} now - текущая дата (для тестирования можно передать mock)
 * @param {import('i18next').TFunction} t - функция перевода i18n
 */
function buildMainMenu(user, now = new Date(), t = (k) => k) {
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const isWeekend = day === 0 || day === 6;
  const isEvening = hour >= 16;

  let mainButton, secondaryButton;

  if (isWeekend) {
    // Выходные: акцент на понедельник или обзор недели
    mainButton = t('menu.next_week');
    secondaryButton = t('menu.week_view');
  } else if (isEvening) {
    // Будний вечер: готовимся к завтрашнему дню
    mainButton = t('menu.tomorrow');
    secondaryButton = t('menu.homework_tomorrow');
  } else {
    // Будний день: текущий учебный день
    mainButton = t('menu.today');
    secondaryButton = t('menu.homework_today');
  }

  const keyboard = [
    // Динамический блок "Главная кнопка дня"
    [Markup.button.callback(mainButton, 'main_day_action')],
    
    // Блок расписания
    [
      Markup.button.callback(t('menu.week_schedule'), 'schedule_week'),
      Markup.button.callback(t('menu.select_day'), 'schedule_select_day')
    ],
    
    // Блок ДЗ
    [Markup.button.callback(t('menu.all_homework'), 'homework_all')],
    
    // Личный кабинет
    [
      Markup.button.callback(t('menu.profile'), 'profile_main'),
      Markup.button.callback(t('menu.settings'), 'settings_main')
    ]
  ];

  // Кнопка админ-панели для админов и классных руководителей
  if (user && (user.role === 'admin' || user.role === 'class_admin')) {
    keyboard.push([Markup.button.callback(t('menu.admin_panel'), 'admin_panel')]);
  }

  return Markup.inlineKeyboard(keyboard);
}

/**
 * Меню профиля пользователя
 */
function getProfileMenu(t = (k) => k) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t('profile.edit_class'), 'profile_edit_class')],
    [Markup.button.callback(t('profile.edit_school'), 'profile_edit_school')],
    [
      Markup.button.callback(t('profile.notifications_on'), 'profile_toggle_notify_on'),
      Markup.button.callback(t('profile.notifications_off'), 'profile_toggle_notify_off')
    ],
    [Markup.button.callback(t('profile.timezone'), 'profile_timezone')],
    [Markup.button.callback(t('profile.export_ics'), 'profile_export_ics')],
    [Markup.button.callback(t('common.back'), 'back_to_main')]
  ]);
}

/**
 * Меню настроек
 */
function getSettingsMenu(t = (k) => k) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🇷🇺 Русский', 'settings_lang_ru'),
      Markup.button.callback('🇬🇧 English', 'settings_lang_en')
    ],
    [Markup.button.callback(t('profile.notify_time'), 'settings_notify_time')],
    [Markup.button.callback(t('common.back'), 'back_to_main')]
  ]);
}

/**
 * Меню выбора дня недели для просмотра расписания
 */
function getDaySelectMenu(t = (k) => k) {
  const days = [
    t('days.monday'),
    t('days.tuesday'),
    t('days.wednesday'),
    t('days.thursday'),
    t('days.friday'),
    t('days.saturday'),
    t('days.sunday')
  ];

  const keyboard = [];
  for (let i = 0; i < days.length; i += 2) {
    const row = [
      Markup.button.callback(days[i], `schedule_day_${i + 1}`)
    ];
    if (i + 1 < days.length) {
      row.push(Markup.button.callback(days[i + 1], `schedule_day_${i + 2}`));
    }
    keyboard.push(row);
  }
  
  keyboard.push([Markup.button.callback(t('common.back'), 'back_to_main')]);
  
  return Markup.inlineKeyboard(keyboard);
}

/**
 * Меню админ-панели
 */
function getAdminMenu(t = (k) => k) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t('admin.bell_schedule'), 'admin_bells')],
    [Markup.button.callback(t('admin.edit_schedule'), 'admin_edit_schedule')],
    [Markup.button.callback(t('admin.edit_homework'), 'admin_edit_homework')],
    [Markup.button.callback(t('admin.broadcast'), 'admin_broadcast')],
    [Markup.button.callback(t('admin.audit_log'), 'admin_audit_log')],
    [Markup.button.callback(t('common.back'), 'back_to_main')]
  ]);
}

/**
 * Клавиатура возврата назад
 */
function getBackKeyboard(t = (k) => k) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t('common.back'), 'back_to_main')]
  ]);
}

module.exports = {
  buildMainMenu,
  getProfileMenu,
  getSettingsMenu,
  getDaySelectMenu,
  getAdminMenu,
  getBackKeyboard
};
