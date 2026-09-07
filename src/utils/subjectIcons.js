/**
 * Иконки для предметов
 */
export const SUBJECT_ICONS = {
  'математика': '🔢',
  'алгебра': '📐',
  'геометрия': '📏',
  'физика': '⚡',
  'химия': '🧪',
  'биология': '🧬',
  'история': '📜',
  'обществознание': '🌍',
  'география': '🗺️',
  'русский язык': '📝',
  'литература': '📚',
  'иностранный язык': '🌐',
  'английский язык': '🇬🇧',
  'немецкий язык': '🇩🇪',
  'французский язык': '🇫🇷',
  'информатика': '💻',
  'технология': '🔧',
  'физкультура': '⚽',
  'музыка': '🎵',
  'изо': '🎨',
  'рисование': '🖌️',
  'астрономия': '🔭',
  'экономика': '💰',
  'право': '⚖️',
  'обж': '🚒',
  'классный час': '👨‍🏫',
  'родной язык': '🗣️',
  'родная литература': '📖',
  'проектная деятельность': '🎯',
  'труд': '🛠️',
  'черчение': '✏️'
};

/**
 * Получить иконку для предмета
 * @param {string} subject - название предмета
 * @returns {string} иконка или дефолтная 📖
 */
export function getSubjectIcon(subject) {
  if (!subject) return '📖';
  
  const normalizedSubject = subject.toLowerCase().trim();
  
  // Прямое совпадение
  if (SUBJECT_ICONS[normalizedSubject]) {
    return SUBJECT_ICONS[normalizedSubject];
  }
  
  // Частичное совпадение
  for (const [key, icon] of Object.entries(SUBJECT_ICONS)) {
    if (normalizedSubject.includes(key)) {
      return icon;
    }
  }
  
  return '📖';
}

/**
 * Получить все доступные иконки как объект
 * @returns {Object} объект с иконками
 */
export function getAllIcons() {
  return SUBJECT_ICONS;
}

export default {
  SUBJECT_ICONS,
  getSubjectIcon,
  getAllIcons
};
