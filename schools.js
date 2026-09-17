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

export function schoolsForCity(city) {
  return SCHOOLS_BY_CITY[city] || [];
}

export function sanitizeSchoolName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > MAX_SCHOOL_NAME_LENGTH) return null;
  return name;
}
