// Все даты в проекте — строки YYYY-MM-DD по Москве.
const TIMEZONE = 'Europe/Moscow';

const SHORT_WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export function toDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function addDaysToKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 0 — воскресенье, 6 — суббота. Считаем по UTC, чтобы не зависеть от TZ сервера.
export function weekdayIndex(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function formatDateShort(dateKey) {
  const [, month, day] = dateKey.split('-');
  return `${day}.${month} · ${SHORT_WEEKDAYS[weekdayIndex(dateKey)]}`;
}

export function formatDateHuman(dateKey) {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${day} ${MONTHS_GENITIVE[month - 1]}, ${SHORT_WEEKDAYS[weekdayIndex(dateKey)]}`;
}

export function dayTitle(dateKey, todayKey = toDateKey()) {
  if (dateKey === todayKey) return 'Сегодня';
  if (dateKey === addDaysToKey(todayKey, 1)) return 'Завтра';
  if (dateKey === addDaysToKey(todayKey, 2)) return 'Послезавтра';
  return formatDateHuman(dateKey);
}

// Неделя с воскресенья по субботу
export function getWeekDates(offsetWeeks = 0, todayKey = toDateKey()) {
  const start = addDaysToKey(todayKey, -weekdayIndex(todayKey) + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, index) => addDaysToKey(start, index));
}

export function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function daysBetween(fromKey, toKey) {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

export { SHORT_WEEKDAYS, MONTHS_GENITIVE };
