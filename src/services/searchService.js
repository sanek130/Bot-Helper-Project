import { User } from '../db/models/User.js';
import cities from '../data/cities.json';
import schools from '../data/schools.json';
import { normalizeText, sanitizeSchoolName } from '../utils/normalize.js';

const MAX_SCHOOL_NAME_LENGTH = 80;
const MAX_SCHOOL_CHOICE_BUTTONS = 24;

/**
 * Найти город по названию (с учётом aliases и регистра)
 */
export function findCity(query) {
  const normalized = normalizeText(query);
  for (const city of cities) {
    if (city.name.toLowerCase() === normalized) return city;
    for (const alias of city.aliases || []) {
      if (alias.toLowerCase() === normalized) return city;
    }
  }
  return null;
}

/**
 * Получить список городов
 */
export function getCities() {
  return cities;
}

/**
 * Получить школы для города из JSON
 */
export function getSchoolsForCity(cityId) {
  return schools.filter(s => s.cityId === cityId);
}

/**
 * Получить зарегистрированные школы для города из БД
 */
export async function getRegisteredSchoolsForCity(city) {
  if (!city) return [];
  const names = await User.distinct('school', {
    city,
    school: { $nin: [null, ''] },
  });
  return names
    .map((n) => sanitizeSchoolName(n))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

/**
 * Объединить пресеты и зарегистрированные школы без дублей
 */
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

/**
 * Найти школу по названию (в JSON или среди зарегистрированных)
 */
export async function findSchool(city, query) {
  const normalized = normalizeText(query);
  
  // Сначала ищем в JSON
  const citySchools = getSchoolsForCity(city);
  for (const school of citySchools) {
    if (school.name.toLowerCase() === normalized) return school;
    for (const alias of school.aliases || []) {
      if (alias.toLowerCase() === normalized) return school;
    }
  }
  
  // Затем среди зарегистрированных
  const registered = await getRegisteredSchoolsForCity(city);
  for (const name of registered) {
    if (name.toLowerCase() === normalized) return { name };
  }
  
  return null;
}

/**
 * Предложить варианты для некорректного названия города
 */
export function suggestCity(query) {
  const normalized = normalizeText(query);
  const suggestions = [];
  
  for (const city of cities) {
    if (city.id === 'other') continue;
    if (city.name.toLowerCase().includes(normalized) || 
        normalized.includes(city.name.toLowerCase())) {
      suggestions.push(city.name);
    }
  }
  
  return suggestions.slice(0, 3);
}

export { MAX_SCHOOL_NAME_LENGTH, MAX_SCHOOL_CHOICE_BUTTONS };
