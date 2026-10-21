export const CITIES = [
  'Краснодар',
  'Москва',
  'Санкт-Петербург',
  'Другой город',
];

export const SCHOOLS_BY_CITY = {
  Краснодар: ['Школа №1', 'Школа №2', 'Гимназия №1', 'Лицей №1'],
  Москва: ['Школа №1', 'Школа №1535', 'Лицей ВШЭ'],
  'Санкт-Петербург': ['Гимназия №2', 'Школа №189', 'Академическая гимназия'],
  'Другой город': [],
};

export const MAX_SCHOOL_NAME_LENGTH = 80;
/** Inline buttons stay usable; more schools are listed in the message text. */
export const MAX_SCHOOL_CHOICE_BUTTONS = 24;

export function schoolsForCity(city) {
  return SCHOOLS_BY_CITY[city] || [];
}

export function sanitizeSchoolName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > MAX_SCHOOL_NAME_LENGTH) return null;
  return name;
}

export function mergeSchoolOptions(preset, registered) {
  const seen = new Set();
  const out = [];
  for (const name of [...(registered || []), ...(preset || [])]) {
    const s = sanitizeSchoolName(name);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
