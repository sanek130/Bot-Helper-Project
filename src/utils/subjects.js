// Единый словарь предметов и иконок. Дублировать его в других файлах нельзя.
export const SUBJECT_ICONS = {
  Алгебра: '📐',
  Геометрия: '📏',
  Математика: '🔢',
  Русский: '📝',
  Литература: '📖',
  Английский: '🇬🇧',
  Физика: '⚡',
  Химия: '🧪',
  Биология: '🧬',
  История: '🏛️',
  Обществознание: '👥',
  География: '🌍',
  Информатика: '💻',
  ОБЖ: '🛡️',
  ОБЗР: '🛡️',
  Физкультура: '🏃',
  Музыка: '🎵',
  ИЗО: '🎨',
  Технология: '🔧',
  Кубановедение: '🌍',
  РОВ: '👥',
  'Мир ДО': '🌍',
};

// Быстрые кнопки предметов при добавлении ДЗ
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

export function getSubjectIcon(subject) {
  const value = String(subject || '').toLowerCase();
  for (const [key, icon] of Object.entries(SUBJECT_ICONS)) {
    if (value.includes(key.toLowerCase())) return icon;
  }
  return '📘';
}

// Короткий стабильный ключ предмета для callback_data (8 hex-символов).
// Позволяет не класть произвольный текст предмета в callback и не зависеть от индекса.
export function subjectKey(subject) {
  let hash = 0;
  const value = String(subject || '');
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function findSubjectByKey(subjects, key) {
  return subjects.find((subject) => subjectKey(subject) === key) || null;
}
