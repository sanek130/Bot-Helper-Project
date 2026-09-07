import { Markup } from 'telegraf';

/**
 * Построить главное меню в зависимости от времени суток и дня недели
 * @param {Object} user - объект пользователя с timezone
 * @param {Date} now - текущая дата
 * @param {boolean} isAdmin - является ли пользователем админом
 * @returns {Object} клавиатура Telegram
 */
export function buildMainMenu(user, now, isAdmin = false) {
  const { getDateInTimezone, isWeekend, getDayOfWeek, hasTimePassedToday } = 
    await import('../utils/datetime.js');
  
  const timezone = user?.timezone || 'Europe/Moscow';
  const tzNow = getDateInTimezone(now, timezone);
  const dayOfWeek = getDayOfWeek(tzNow);
  const weekend = isWeekend(tzNow);
  
  // Проверяем, вечер ли сейчас (после 16:00)
  const isEvening = tzNow.getHours() >= 16;
  
  // Определяем режим меню
  let primaryButton, secondaryButton;
  
  if (weekend) {
    // Выходные: показываем кнопку на понедельник
    primaryButton = Markup.button.callback('📅 Понедельник', 'schedule_monday');
    secondaryButton = Markup.button.callback('🗓 На неделю', 'schedule_week');
  } else if (isEvening) {
    // Будний вечер: акцент на завтра
    primaryButton = Markup.button.callback('📅 Завтра', 'schedule_tomorrow');
    secondaryButton = Markup.button.callback('📚 ДЗ на завтра', 'homework_tomorrow');
  } else {
    // Будний день: акцент на сегодня
    primaryButton = Markup.button.callback('📅 Сегодня', 'schedule_today');
    secondaryButton = Markup.button.callback('📚 ДЗ на сегодня', 'homework_today');
  }
  
  // Основной ряд кнопок
  const mainRow = [primaryButton, secondaryButton];
  
  // Дополнительные кнопки
  const extraRows = [
    [
      Markup.button.callback('🗓 На неделю', 'schedule_week'),
      Markup.button.callback('🔍 Выбор дня', 'schedule_choose_day')
    ],
    [
      Markup.button.callback('📚 Все ДЗ', 'homework_all')
    ],
    [
      Markup.button.callback('👤 Профиль', 'profile'),
      Markup.button.callback('⚙️ Настройки', 'settings')
    ]
  ];
  
  // Добавляем кнопку админ-панели для админов
  if (isAdmin) {
    extraRows.push([
      Markup.button.callback('🛠️ Панель управления', 'admin_panel')
    ]);
  }
  
  return Markup.inlineKeyboard([mainRow, ...extraRows]);
}

/**
 * Построить меню профиля
 * @returns {Object} клавиатура Telegram
 */
export function buildProfileMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Изменить класс', 'profile_change_class')],
    [Markup.button.callback('🏫 Изменить школу', 'profile_change_school')],
    [Markup.button.callback('🔔 Уведомления', 'profile_notifications')],
    [Markup.button.callback('📅 Экспорт (.ics)', 'profile_export_ics')],
    [Markup.button.callback('🌐 Язык / Language', 'profile_language')],
    [Markup.button.callback('🔙 Назад', 'menu_back')]
  ]);
}

/**
 * Построить меню настроек
 * @param {boolean} notificationsEnabled - включены ли уведомления
 * @returns {Object} клавиатура Telegram
 */
export function buildSettingsMenu(notificationsEnabled = true) {
  const notifyText = notificationsEnabled ? '✅ ВКЛ' : '🔕 ВЫКЛ';
  
  return Markup.inlineKeyboard([
    [Markup.button.callback(`🔔 Уведомления: ${notifyText}`, 'settings_toggle_notifications')],
    [Markup.button.callback('⏰ Время напоминания', 'settings_reminder_time')],
    [Markup.button.callback('🌍 Часовой пояс', 'settings_timezone')],
    [Markup.button.callback('🔙 Назад', 'menu_back')]
  ]);
}

/**
 * Построить меню админ-панели
 * @returns {Object} клавиатура Telegram
 */
export function buildAdminMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⏰ Расписание звонков', 'admin_bell_schedule'),
      Markup.button.callback('📝 Расписание уроков', 'admin_edit_schedule')
    ],
    [
      Markup.button.callback('✏️ ДЗ', 'admin_edit_homework'),
      Markup.button.callback('📢 Рассылка', 'admin_broadcast')
    ],
    [
      Markup.button.callback('📊 Журнал изменений', 'admin_audit_log'),
      Markup.button.callback('⏳ Заявки', 'admin_pending_requests')
    ],
    [Markup.button.callback('🔙 Назад', 'menu_back')]
  ]);
}

/**
 * Построить клавиатуру выбора дней недели
 * @returns {Object} клавиатура Telegram
 */
export function buildDaysSelector() {
  const days = [
    ['Пн', 'schedule_day_1'],
    ['Вт', 'schedule_day_2'],
    ['Ср', 'schedule_day_3'],
    ['Чт', 'schedule_day_4'],
    ['Пт', 'schedule_day_5'],
    ['Сб', 'schedule_day_6'],
    ['Вс', 'schedule_day_7']
  ];
  
  const keyboard = [];
  for (let i = 0; i < days.length; i += 4) {
    keyboard.push(
      days.slice(i, i + 4).map(([label, callback]) => 
        Markup.button.callback(label, callback)
      )
    );
  }
  
  keyboard.push([Markup.button.callback('🔙 Назад', 'menu_back')]);
  
  return Markup.inlineKeyboard(keyboard);
}

/**
 * Построить клавиатуру выбора параллели (1-11)
 * @returns {Object} клавиатура Telegram
 */
export function buildGradeSelector() {
  const grades = [];
  for (let i = 1; i <= 11; i++) {
    grades.push(Markup.button.callback(`${i}`, `grade_${i}`));
  }
  
  const keyboard = [];
  for (let i = 0; i < grades.length; i += 4) {
    keyboard.push(grades.slice(i, i + 4));
  }
  
  keyboard.push([Markup.button.callback('❌ Отмена', 'onboarding_cancel')]);
  
  return Markup.inlineKeyboard(keyboard);
}

/**
 * Построить клавиатуру выбора буквы класса
 * @param {string[]} existingLetters - существующие буквы классов в школе
 * @returns {Object} клавиатура Telegram
 */
export function buildLetterSelector(existingLetters = []) {
  const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М'];
  
  const keyboard = [];
  const row = [];
  
  for (const letter of letters) {
    const exists = existingLetters.includes(letter);
    row.push(Markup.button.callback(
      `${letter}${exists ? ' ✓' : ''}`, 
      `letter_${letter}`
    ));
    
    if (row.length === 4) {
      keyboard.push(row);
      row.length = 0;
    }
  }
  
  if (row.length > 0) {
    keyboard.push(row);
  }
  
  keyboard.push([Markup.button.callback('✍️ Свой вариант', 'letter_custom')]);
  keyboard.push([Markup.button.callback('❌ Отмена', 'onboarding_cancel')]);
  
  return Markup.inlineKeyboard(keyboard);
}

/**
 * Построить клавиатуру выбора роли
 * @returns {Object} клавиатура Telegram
 */
export function buildRoleSelector() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👨‍🎓 Ученик', 'role_student')],
    [Markup.button.callback('👨‍🏫 Классный руководитель', 'role_class_admin')],
    [Markup.button.callback('🔙 Назад', 'onboarding_back_to_grade')]
  ]);
}

export default {
  buildMainMenu,
  buildProfileMenu,
  buildSettingsMenu,
  buildAdminMenu,
  buildDaysSelector,
  buildGradeSelector,
  buildLetterSelector,
  buildRoleSelector
};
