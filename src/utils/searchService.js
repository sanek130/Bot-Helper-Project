import { readFileSync } from 'node:fs';
import { normalizeText } from './normalize.js';

const cities = JSON.parse(readFileSync(new URL('../data/cities.json', import.meta.url), 'utf8'));
const schools = JSON.parse(readFileSync(new URL('../data/schools.json', import.meta.url), 'utf8'));

export function getCities() {
  return cities;
}

export function getCityById(id) {
  return cities.find((city) => city.id === id) || null;
}

export function getCityByName(name) {
  const query = normalizeText(name);
  return cities.find((city) => normalizeText(city.name) === query) || null;
}

export function getSchoolsByCity(cityId) {
  return schools.filter((school) => school.cityId === cityId);
}

export function findCity(query) {
  const q = normalizeText(query);
  if (!q) return [];
  const exact = [];
  const partial = [];
  for (const city of cities) {
    const variants = [city.name, ...(city.aliases || [])].map(normalizeText);
    if (variants.includes(q)) exact.push(city);
    else if (q.length >= 3 && variants.some((v) => v.startsWith(q) || v.includes(q))) partial.push(city);
  }
  return exact.length > 0 ? exact : partial;
}

export function getSchoolOptions(cityId, registeredSchoolsInCity = []) {
  const seen = new Map();
  const add = (name) => {
    const value = String(name ?? '').replace(/\s+/g, ' ').trim();
    if (!value) return;
    const key = normalizeText(value);
    if (!seen.has(key)) seen.set(key, value);
  };
  for (const school of getSchoolsByCity(cityId)) add(school.name);
  for (const name of registeredSchoolsInCity) add(name);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
}
