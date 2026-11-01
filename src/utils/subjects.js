import crypto from 'node:crypto';

export const SUBJECT_ICONS = {
  'алгебра': '📘',
  'геометрия': '📐',
  'русский': '📖',
  'литература': '📚',
  'физика': '🔬',
  'химия': '🧪',
  'биология': '🧬',
  'история': '🏛️',
  'обществознание': '⚖️',
  'английский': '🇬🇧',
  'информатика': '💻',
  'география': '🌍',
  'музыка': '🎵',
  'изо': '🎨',
  'технология': '🛠️',
  'физкультура': '🏃',
  'обж': '🛡️',
};

export const DEFAULT_ICON = '📓';

export const QUICK_SUBJECTS = [
  'алгебра',
  'геометрия',
  'русский',
  'литература',
  'физика',
  'химия',
  'биология',
  'история',
  'обществознание',
  'английский',
  'информатика',
  'география',
  'физкультура',
  'обж',
];

// Кэш «хэш → название»: заполняется для известных предметов сразу,
// а для произвольных — при первом вычислении хэша (например, когда админ ввёл «астрономия»).
const hashCache = new Map();

// 8 hex-символов md5 — компромисс между уникальностью и лимитом callback_data в 64 байта:
// «chk:2026-10-12:8a7b3c4d» занимает 23 байта, тогда как название предмета на кириллице
// может весить до 120 байт.
export function getSubjectHash(subjectName) {
  const name = String(subjectName ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const hash = crypto.createHash('md5').update(name).digest('hex').slice(0, 8);
  if (name && !hashCache.has(hash)) hashCache.set(hash, name);
  return hash;
}

for (const name of Object.keys(SUBJECT_ICONS)) getSubjectHash(name);

export function getSubjectByHash(hash) {
  if (hashCache.has(hash)) return hashCache.get(hash);
  for (const name of Object.keys(SUBJECT_ICONS)) {
    if (getSubjectHash(name) === hash) return name;
  }
  return null;
}

export function rememberSubject(subjectName) {
  return getSubjectHash(subjectName);
}

export function getSubjectIcon(subjectName) {
  const name = String(subjectName ?? '').toLowerCase().trim();
  return SUBJECT_ICONS[name] || DEFAULT_ICON;
}

export function capitalize(text) {
  const value = String(text ?? '');
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
