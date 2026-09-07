/**
 * Утилиты для работы с часовыми поясами и датами
 */

/**
 * Получить дату в указанном часовом поясе
 * @param {Date} date - исходная дата (UTC)
 * @param {string} timezone - часовой пояс (например, 'Europe/Moscow')
 * @returns {Date} Дата в локальном времени указанного пояса
 */
export function getDateInTimezone(date, timezone = 'Europe/Moscow') {
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return tzDate;
}

/**
 * Проверить, является ли дата выходным днём
 * @param {Date} date - дата для проверки
 * @returns {boolean} true если сб или вс
 */
export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Вс, 6 = Сб
}

/**
 * Получить день недели (1-7, где 1=Пн, 7=Вс)
 * @param {Date} date - дата
 * @returns {number} номер дня недели
 */
export function getDayOfWeek(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/**
 * Форматировать дату в строку DD.MM.YYYY
 * @param {Date} date - дата
 * @param {string} timezone - часовой пояс
 * @returns {string} отформатированная дата
 */
export function formatDate(date, timezone = 'Europe/Moscow') {
  const tzDate = getDateInTimezone(date, timezone);
  const day = String(tzDate.getDate()).padStart(2, '0');
  const month = String(tzDate.getMonth() + 1).padStart(2, '0');
  const year = tzDate.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Форматировать дату с днём недели
 * @param {Date} date - дата
 * @param {string} timezone - часовой пояс
 * @param {boolean} short - короткое название дня (Пн vs Понедельник)
 * @returns {string} отформатированная дата с днём недели
 */
export function formatDateWithWeekday(date, timezone = 'Europe/Moscow', short = true) {
  const tzDate = getDateInTimezone(date, timezone);
  const weekdaysShort = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const weekdaysLong = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  
  const dayIndex = tzDate.getDay();
  const weekday = short ? weekdaysShort[dayIndex] : weekdaysLong[dayIndex];
  const formattedDate = formatDate(date, timezone);
  
  return `${weekday}, ${formattedDate}`;
}

/**
 * Получить дату завтрашнего дня
 * @param {Date} date - текущая дата
 * @returns {Date} завтрашняя дата
 */
export function getTomorrow(date) {
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

/**
 * Получить начало дня (00:00:00) в указанном часовом поясе
 * @param {Date} date - дата
 * @param {string} timezone - часовой пояс
 * @returns {Date} начало дня
 */
export function getStartOfDay(date, timezone = 'Europe/Moscow') {
  const tzDate = getDateInTimezone(date, timezone);
  tzDate.setHours(0, 0, 0, 0);
  return tzDate;
}

/**
 * Получить конец дня (23:59:59) в указанном часовом поясе
 * @param {Date} date - дата
 * @param {string} timezone - часовой пояс
 * @returns {Date} конец дня
 */
export function getEndOfDay(date, timezone = 'Europe/Moscow') {
  const tzDate = getDateInTimezone(date, timezone);
  tzDate.setHours(23, 59, 59, 999);
  return tzDate;
}

/**
 * Проверить, наступил ли указанный час в данном часовом поясе
 * @param {string} timeStr - время в формате "HH:MM"
 * @param {string} timezone - часовой пояс
 * @returns {boolean} true если время уже наступило сегодня
 */
export function hasTimePassedToday(timeStr, timezone = 'Europe/Moscow') {
  const now = getDateInTimezone(new Date(), timezone);
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  const targetTime = new Date(now);
  targetTime.setHours(hours, minutes, 0, 0);
  
  return now >= targetTime;
}

/**
 * Получить следующий рабочий день (пропуская выходные)
 * @param {Date} date - текущая дата
 * @param {boolean} includeToday - включать ли сегодня
 * @returns {Date} следующий рабочий день
 */
export function getNextWorkday(date, includeToday = false) {
  let result = includeToday ? new Date(date) : getTomorrow(date);
  
  while (isWeekend(result)) {
    result.setDate(result.getDate() + 1);
  }
  
  return result;
}

/**
 * Получить номер недели в году
 * @param {Date} date - дата
 * @returns {number} номер недели
 */
export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export default {
  getDateInTimezone,
  isWeekend,
  getDayOfWeek,
  formatDate,
  formatDateWithWeekday,
  getTomorrow,
  getStartOfDay,
  getEndOfDay,
  hasTimePassedToday,
  getNextWorkday,
  getWeekNumber
};
