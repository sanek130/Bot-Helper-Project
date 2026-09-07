import i18next from 'i18next';

// Русские переводы
const ru = {
  translation: {
    // Онбординг
    onboarding: {
      welcome: '👋 Добро пожаловать в школьный бот!\n\nДавайте настроим ваш профиль.',
      enterFullName: '📝 Введите ваше ФИО (только буквы, пробелы и дефис):',
      invalidFullName: '❌ Неверный формат ФИО. Попробуйте ещё раз.',
      selectCity: '🏙️ Выберите ваш город:',
      cityNotFound: 'Город не найден. Хотите добавить свой?',
      addCity: '➕ Добавить свой город',
      enterCityName: '📝 Введите название города:',
      selectSchool: '🏫 Выберите вашу школу:',
      schoolNotFound: 'Школа не найдена. Хотите добавить свою?',
      addSchool: '➕ Добавить свою школу',
      enterSchoolName: '📝 Введите название школы:',
      selectGrade: '📚 Выберите параллель (класс):',
      selectLetter: '🔤 Выберите букву класса:',
      selectRole: '👤 Выберите вашу роль:',
      student: '👨‍🎓 Ученик',
      classAdmin: '👨‍🏫 Классный руководитель',
      admin: '🛠️ Администратор',
      confirmData: '✅ Проверьте данные:\n\n👤 {{fullName}}\n🏙️ {{city}}\n🏫 {{school}}\n📚 {{classGrade}}\n👤 {{role}}\n\nВсё верно?',
      dataConfirmed: '✅ Данные подтверждены! Профиль создан.',
      dataIncorrect: '✏️ Начнём регистрацию заново.',
      registrationComplete: '🎉 Регистрация завершена!\n\nТеперь вы можете пользоваться всеми функциями бота.'
    },
    
    // Главное меню
    menu: {
      today: '📅 Сегодня',
      tomorrow: '📅 Завтра',
      homeworkToday: '📚 ДЗ на сегодня',
      homeworkTomorrow: '📚 ДЗ на завтра',
      weekSchedule: '🗓 На неделю',
      chooseDay: '🔍 Выбор дня',
      allHomework: '📚 Все ДЗ',
      profile: '👤 Профиль',
      settings: '⚙️ Настройки',
      adminPanel: '🛠️ Панель управления',
      holidays: '🏖 Каникулы до {{date}}',
      monday: '📅 Понедельник'
    },
    
    // Расписание
    schedule: {
      noLessonsToday: '🎉 Сегодня уроков нет!',
      noLessonsTomorrow: '🎉 Завтра уроков нет!',
      lessonsCount: '📚 {{count}} уроков',
      lessonNumber: 'Урок {{number}}',
      timeRange: '{{start}} - {{end}}',
      noSchedule: '📭 Расписание на этот день ещё не заполнено',
      weekTitle: 'Расписание на неделю',
      daySelect: 'Выберите день:'
    },
    
    // Домашнее задание
    homework: {
      noHomework: '✅ На сегодня домашнего задания нет!',
      noHomeworkTomorrow: '✅ На завтра домашнего задания нет!',
      homeworkTitle: '📚 Домашнее задание на {{date}}',
      bySubject: '📖 {{subject}}',
      attachments: '📎 Вложения:',
      markAsDone: '✅ Отметить как выполненное',
      markedDone: '✅ ДЗ отмечено как выполненное'
    },
    
    // Профиль
    profile: {
      title: '👤 Ваш профиль',
      fullName: 'ФИО: {{name}}',
      city: 'Город: {{city}}',
      school: 'Школа: {{school}}',
      classGrade: 'Класс: {{grade}}',
      role: 'Роль: {{role}}',
      timezone: 'Часовой пояс: {{timezone}}',
      editProfile: '✏️ Изменить профиль',
      changeClass: '📚 Изменить класс',
      changeSchool: '🏫 Изменить школу',
      notifications: '🔔 Уведомления',
      exportCalendar: '📅 Экспорт расписания (.ics)',
      language: '🌐 Язык / Language'
    },
    
    // Настройки
    settings: {
      title: '⚙️ Настройки',
      notificationsEnabled: '✅ Уведомления включены',
      notificationsDisabled: '🔕 Уведомления выключены',
      toggleNotifications: 'Вкл/Выкл уведомления',
      setReminderTime: '⏰ Установить время напоминания',
      currentTimezone: '🕐 Текущий часовой пояс: {{timezone}}',
      changeTimezone: '🌍 Изменить часовой пояс',
      selectTimezone: 'Выберите часовой пояс:'
    },
    
    // Админ панель
    admin: {
      title: '🛠️ Панель управления',
      bellSchedule: '⏰ Расписание звонков',
      editSchedule: '📝 Изменить расписание',
      editHomework: '✏️ Редактировать ДЗ',
      broadcast: '📢 Рассылка по классу',
      auditLog: '📊 Журнал изменений',
      pendingRequests: '⏳ Заявки на админа ({{count}})',
      approveRequest: '✅ Одобрить',
      rejectRequest: '❌ Отклонить',
      requestFrom: 'Заявка от {{name}}\nШкола: {{school}}\nКласс: {{class}}\nРоль: {{role}}',
      requestApproved: '✅ Заявка одобрена',
      requestRejected: '❌ Заявка отклонена'
    },
    
    // Ошибки
    errors: {
      generic: '❌ Произошла ошибка. Попробуйте позже.',
      notRegistered: '❌ Вы ещё не зарегистрированы. Используйте /start',
      accessDenied: '🚫 Доступ запрещен',
      invalidData: '❌ Неверный формат данных',
      networkError: '🌐 Ошибка сети. Попробуйте позже.'
    },
    
    // Разное
    common: {
      back: '🔙 Назад',
      cancel: '❌ Отмена',
      confirm: '✅ Подтвердить',
      next: '➡️ Далее',
      prev: '⬅️ Назад',
      save: '💾 Сохранить',
      delete: '🗑️ Удалить',
      edit: '✏️ Редактировать',
      yes: '✅ Да',
      no: '❌ Нет',
      loading: '⏳ Загрузка...'
    }
  }
};

// English translations (fallback)
const en = {
  translation: {
    onboarding: {
      welcome: '👋 Welcome to School Bot!\n\nLet\'s set up your profile.',
      enterFullName: '📝 Enter your full name:',
      invalidFullName: '❌ Invalid name format. Try again.',
      selectCity: '🏙️ Select your city:',
      selectSchool: '🏫 Select your school:',
      selectGrade: '📚 Select your grade:',
      selectLetter: '🔤 Select class letter:',
      selectRole: '👤 Select your role:',
      student: '👨‍🎓 Student',
      classAdmin: '👨‍🏫 Class Teacher',
      admin: '🛠️ Administrator',
      confirmData: '✅ Check your data:\n\n👤 {{fullName}}\n🏙️ {{city}}\n🏫 {{school}}\n📚 {{classGrade}}\n👤 {{role}}\n\nIs everything correct?',
      dataConfirmed: '✅ Data confirmed! Profile created.',
      dataIncorrect: '✏️ Let\'s start registration again.',
      registrationComplete: '🎉 Registration complete!\n\nYou can now use all bot features.'
    },
    common: {
      back: '🔙 Back',
      cancel: '❌ Cancel',
      confirm: '✅ Confirm',
      next: '➡️ Next',
      prev: '⬅️ Prev',
      save: '💾 Save',
      delete: '🗑️ Delete',
      edit: '✏️ Edit',
      yes: '✅ Yes',
      no: '❌ No',
      loading: '⏳ Loading...'
    }
  }
};

// Инициализация i18next
await i18next.init({
  resources: { ru, en },
  lng: 'ru',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
});

/**
 * Получить перевод
 * @param {string} key - ключ перевода (например, 'onboarding.welcome')
 * @param {Object} params - параметры для интерполяции
 * @param {string} lng - язык ('ru' или 'en')
 * @returns {string} переведённая строка
 */
export function t(key, params = {}, lng = 'ru') {
  return i18next.t(key, params, { lng });
}

/**
 * Изменить язык
 * @param {string} lng - новый язык
 */
export async function setLanguage(lng) {
  await i18next.changeLanguage(lng);
}

export default {
  t,
  setLanguage,
  i18next
};
