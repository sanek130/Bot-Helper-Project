// Функции для работы с датами в Europe/Moscow

const TIMEZONE = 'Europe/Moscow';
const SHORT_DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const FULL_DAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/**
 * Преобразовать дату в ключ YYYY-MM-DD в Europe/Moscow
 */
export function toDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

/**
 * Добавить дни к ключу даты
 */
export function addDaysToKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Форматировать дату как DD.MM · дн
 */
export function formatDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = String(d).padStart(2, '0');
  const month = String(m).padStart(2, '0');
  const wd = SHORT_DAYS[date.getDay()];
  return `${day}.${month} · ${wd}`;
}

/**
 * Форматировать дату как День недели, DD.MM
 */
export function formatDateFull(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${FULL_DAYS[date.getDay()]}, ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

/**
 * Заголовок дня: "Сегодня, 12.10 · пн" | "Завтра, ..." | "12.10 · пн"
 */
export function dayTitle(dateStr, todayKey = toDateKey()) {
  const short = formatDateShort(dateStr);
  if (dateStr === todayKey) return `Сегодня, ${short}`;
  if (dateStr === addDaysToKey(todayKey, 1)) return `Завтра, ${short}`;
  if (dateStr === addDaysToKey(todayKey, 2)) return `Послезавтра, ${short}`;
  return short;
}

/**
 * Получить название месяца
 */
export function getMonthName(month) {
  return MONTHS[month - 1];
}

/**
 * Получить недели от текущей даты
 */
export function getWeekDates(offsetWeeks = 0) {
  const today = new Date();
  const currentDay = today.getDay();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - currentDay);
  sunday.setDate(sunday.getDate() + offsetWeeks * 7);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + i);
    dates.push(toDateKey(date));
  }
  return dates;
}
