const TZ = 'Europe/Moscow';
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const keyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const shortFormatter = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', weekday: 'short' });
const humanFormatter = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'long', weekday: 'short' });
const weekdayFormatter = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, weekday: 'short' });

const SHORT_DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function isDateKey(value) {
  if (typeof value !== 'string' || !DATE_KEY_RE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function toDateKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  return keyFormatter.format(value);
}

// Полдень UTC выбран намеренно: при любом сдвиге часового пояса (±12 ч) дата не «переезжает».
export function fromDateKey(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`);
}

export function addDays(date, days) {
  const base = typeof date === 'string' ? fromDateKey(date) : new Date(date instanceof Date ? date.getTime() : date);
  return new Date(base.getTime() + days * DAY_MS);
}

export function addDaysKey(dateKey, days) {
  return toDateKey(addDays(dateKey, days));
}

export function getToday() {
  return toDateKey(new Date());
}

export function getTomorrow() {
  return toDateKey(addDays(new Date(), 1));
}

export function getAfterTomorrow() {
  return toDateKey(addDays(new Date(), 2));
}

function partsOf(formatter, date) {
  const parts = {};
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;
  return parts;
}

export function getWeekday(dateKey) {
  return weekdayFormatter.format(fromDateKey(dateKey)).toLowerCase().replace('.', '');
}

export function getDayTitle(dateKey) {
  if (dateKey === getToday()) return 'Сегодня';
  if (dateKey === getTomorrow()) return 'Завтра';
  if (dateKey === getAfterTomorrow()) return 'Послезавтра';
  const parts = partsOf(shortFormatter, fromDateKey(dateKey));
  return `${parts.day}.${parts.month}, ${String(parts.weekday).toLowerCase().replace('.', '')}`;
}

export function formatDateHuman(dateKey) {
  const parts = partsOf(humanFormatter, fromDateKey(dateKey));
  return `${parts.day} ${parts.month}, ${String(parts.weekday).toLowerCase().replace('.', '')}`;
}

export function formatDayMonth(dateKey) {
  const [, month, day] = dateKey.split('-');
  return `${day}.${month}`;
}

// Неделя считается с воскресенья по субботу (как в сетке календаря «Вс Пн Вт Ср Чт Пт Сб»).
export function getWeekDates(offset = 0) {
  const today = getToday();
  const weekday = fromDateKey(today).getUTCDay();
  const sunday = addDaysKey(today, -weekday + Number(offset || 0) * 7);
  const result = [];
  for (let i = 0; i < 7; i += 1) {
    const dateKey = addDaysKey(sunday, i);
    result.push({ dateKey, dayTitle: SHORT_DAYS[i], hasHomework: false });
  }
  return result;
}

export { SHORT_DAYS };
