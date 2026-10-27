import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { User } from '../db/models/User.js';
import { normalizeText, sanitizeSchoolName } from '../utils/normalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const cities = JSON.parse(readFileSync(join(__dirname, '../data/cities.json'), 'utf8'));
const schools = JSON.parse(readFileSync(join(__dirname, '../data/schools.json'), 'utf8'));

export const MAX_SCHOOL_NAME_LENGTH = 80;
export const MAX_SCHOOL_CHOICE_BUTTONS = 24;

export function getCities() {
  return cities;
}

export function findCity(query) {
  const normalized = normalizeText(query);
  if (!normalized) return null;

  for (const city of cities) {
    if (normalizeText(city.name) === normalized) return city;
    if ((city.aliases || []).some((alias) => normalizeText(alias) === normalized)) return city;
  }
  return null;
}

export function getSchoolsForCity(cityId) {
  return schools.filter((school) => school.cityId === cityId);
}

export async function getRegisteredSchoolsForCity(cityName) {
  if (!cityName) return [];
  const names = await User.distinct('school', { city: cityName, school: { $nin: [null, ''] } });
  return names
    .map((name) => sanitizeSchoolName(name))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

// Пресеты из JSON + школы, которые уже вводили пользователи этого города
export function mergeSchoolOptions(presetSchools, registeredSchools) {
  const seen = new Set();
  const result = [];

  const push = (name) => {
    const clean = sanitizeSchoolName(name);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(clean);
  };

  for (const preset of presetSchools || []) push(typeof preset === 'string' ? preset : preset.name);
  for (const name of registeredSchools || []) push(name);

  return result;
}

export async function findSchool(cityName, query) {
  const normalized = normalizeText(query);
  if (!normalized) return null;

  const city = findCity(cityName);
  const preset = city ? getSchoolsForCity(city.id) : schools;

  for (const school of preset) {
    if (normalizeText(school.name) === normalized) return school.name;
    if ((school.aliases || []).some((alias) => normalizeText(alias) === normalized)) return school.name;
  }

  const registered = await getRegisteredSchoolsForCity(cityName);
  return registered.find((name) => normalizeText(name) === normalized) || null;
}

export function suggestCity(query) {
  const normalized = normalizeText(query);
  if (!normalized) return [];

  return cities
    .filter((city) => city.id !== 'other')
    .filter((city) => normalizeText(city.name).includes(normalized) || normalized.includes(normalizeText(city.name)))
    .map((city) => city.name)
    .slice(0, 3);
}
