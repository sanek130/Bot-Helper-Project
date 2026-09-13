/** UI system for ДЗник — emoji palette, day cards, button grids */

export const EMOJI = {
  day: '📅',
  week: '🗓',
  homework: '📚',
  schedule: '🗂',
  ok: '✅',
  no: '❌',
  menu: '🏠',
  profile: '👤',
  bell: '🔔',
  photo: '📷',
  edit: '✏️',
  back: '←',
  school: '🏫',
  copy: '📋',
  search: '🔎',
  settings: '⚙️',
  keyboard: '⌨️',
  add: '➕',
  del: '🗑️',
  stats: '📊',
  upload: '📤',
};

export const SUBJECT_ICONS = {
  Алгебра: '📐',
  Биология: '🧬',
  Химия: '🧪',
  Физкультура: '🏃',
  Математика: '🔢',
  Геометрия: '📏',
  Физика: '⚡',
  Информатика: '💻',
  'ОПИД ВН': '💻',
  Русский: '📝',
  Литература: '📖',
  Английский: '🇬🇧',
  История: '🏛️',
  Обществознание: '👥',
  РОВ: '👥',
  География: '🌍',
  Кубань: '🌍',
  Кубановедение: '🌍',
  'Мир ДО': '🌍',
  ОБЖ: '🛡️',
  ОБЗР: '🛡️',
  Музыка: '🎵',
  ИЗО: '🎨',
  Технология: '🔧',
};

export const QUICK_SUBJECTS = [
  'Алгебра',
  'Геометрия',
  'Русский',
  'Литература',
  'Английский',
  'Физика',
  'Химия',
  'Биология',
  'История',
  'Обществознание',
  'Информатика',
  'География',
  'ОБЖ',
  'Физкультура',
];

export const BTN = {
  today: `${EMOJI.day} Сегодня`,
  tomorrow: `${EMOJI.day} Завтра`,
  week: `${EMOJI.week} Неделя`,
  nextWeek: `${EMOJI.week} Другая неделя`,
  choice: `${EMOJI.search} Выбор дня`,
  all: `${EMOJI.homework} Всё ДЗ`,
  schedule: `${EMOJI.schedule} Расписание`,
  profile: `${EMOJI.profile} Профиль`,
  settings: `${EMOJI.settings} Настройка`,
  menu: `${EMOJI.menu} Меню`,
  register: '📝 Зарегистрироваться',
};

export const DEFAULT_KEYBOARD = [BTN.today, BTN.tomorrow, BTN.menu];

export const ALL_KEYBOARD_BUTTONS = [
  BTN.today,
  BTN.tomorrow,
  BTN.week,
  BTN.nextWeek,
  BTN.choice,
  BTN.all,
  BTN.schedule,
  BTN.profile,
  BTN.settings,
  BTN.menu,
];

export function getSubjectIcon(subject) {
  for (const [key, icon] of Object.entries(SUBJECT_ICONS)) {
    if (subject.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return '📘';
}

const SHORT_DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** YYYY-MM-DD in Europe/Moscow */
export function toDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

export function addDaysToKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function formatDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = String(d).padStart(2, '0');
  const month = String(m).padStart(2, '0');
  const wd = SHORT_DAYS[date.getDay()];
  return `${day}.${month} · ${wd}`;
}

export function formatDateFull(dateStr) {
  const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${days[date.getDay()]}, ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

/**
 * Day card title label: "Сегодня, 13.09 · пн" | "Завтра, ..." | "13.09 · пн"
 */
export function dayTitle(dateStr, todayKey = toDateKey()) {
  const short = formatDateShort(dateStr);
  if (dateStr === todayKey) return `Сегодня, ${short}`;
  if (dateStr === addDaysToKey(todayKey, 1)) return `Завтра, ${short}`;
  return short;
}

/**
 * Build homework day card (Markdown).
 * @param {{ dateStr, classKey, dayDZ, doneSet?: Set<string>, emptyHint?: string }} opts
 */
export function buildDayCard({ dateStr, classKey, dayDZ, doneSet = null, emptyHint = null }) {
  const title = dayTitle(dateStr);
  let msg = `${EMOJI.day} *${title}*\n${EMOJI.school} ${classKey}\n`;

  if (!dayDZ || Object.keys(dayDZ).length === 0) {
    msg += `\nНа этот день заданий нет.`;
    if (emptyHint) msg += `\n${emptyHint}`;
    return msg;
  }

  for (const [subject, task] of Object.entries(dayDZ)) {
    const icon = getSubjectIcon(subject);
    const taskText = typeof task === 'object' ? task.text : task;
    const hasPhoto = typeof task === 'object' && task.photo_id ? ` ${EMOJI.photo}` : '';
    const done = doneSet?.has(subject);
    const mark = done ? `${EMOJI.ok} ` : '';
    msg += `\n${mark}${icon} *${subject}*${hasPhoto}\n${taskText || '—'}\n`;
  }

  return msg;
}

/** Plain-text copy for sharing (no Markdown, no buttons) */
export function buildDayCopyText({ dateStr, classKey, dayDZ }) {
  const title = dayTitle(dateStr);
  let msg = `${title}\nКласс ${classKey}\n`;
  if (!dayDZ || Object.keys(dayDZ).length === 0) {
    return msg + '\nЗаданий нет.';
  }
  for (const [subject, task] of Object.entries(dayDZ)) {
    const taskText = typeof task === 'object' ? task.text : task;
    msg += `\n${subject}\n${taskText || '—'}\n`;
  }
  return msg;
}

export function menuFooter() {
  return [[{ text: `${EMOJI.menu} Меню`, callback_data: 'main_menu' }]];
}

export function dayNavButtons(dateStr, { hasPhotos = false, includeCopy = true } = {}) {
  const rows = [];
  if (hasPhotos) {
    rows.push([{ text: `${EMOJI.photo} Показать фото`, callback_data: `show_photos_${dateStr}` }]);
  }
  if (includeCopy) {
    rows.push([{ text: `${EMOJI.copy} Скопировать`, callback_data: `copy_day_${dateStr}` }]);
  }
  rows.push([
    { text: `${EMOJI.day} Сегодня`, callback_data: 'cmd_day' },
    { text: `${EMOJI.day} Завтра`, callback_data: 'cmd_next_day' },
  ]);
  rows.push([
    { text: `${EMOJI.week} Неделя`, callback_data: 'cmd_week' },
    { text: `${EMOJI.search} Выбрать день`, callback_data: 'cmd_choice' },
  ]);
  rows.push([{ text: `${EMOJI.schedule} Расписание`, callback_data: 'view_schedule' }]);
  rows.push(...menuFooter());
  return rows;
}

export function checklistButtons(dateStr, dayDZ, doneSet) {
  if (!dayDZ || Object.keys(dayDZ).length === 0) return [];
  const rows = [];
  for (const subject of Object.keys(dayDZ)) {
    const done = doneSet?.has(subject);
    const label = done ? `↩️ ${subject}` : `${EMOJI.ok} ${subject}`;
    // callback must stay short; encode subject via index handled by caller ideally
    rows.push([{ text: label, callback_data: `toggle_done_${dateStr}_${encodeURIComponent(subject).slice(0, 40)}` }]);
  }
  return rows.slice(0, 8); // keep under Telegram limits
}

export function botCommands() {
  return [
    { command: 'start', description: 'Начать и открыть меню' },
    { command: 'menu', description: 'Главное меню' },
    { command: 'day', description: 'ДЗ на сегодня' },
    { command: 'next_day', description: 'ДЗ на завтра' },
    { command: 'week', description: 'ДЗ на неделю' },
    { command: 'schedule', description: 'Расписание' },
    { command: 'me', description: 'Профиль и уведомления' },
    { command: 'help', description: 'Как пользоваться' },
    { command: 'web', description: 'Открыть веб-версию' },
  ];
}
