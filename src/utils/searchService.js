import { readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { normalizeText } from './normalize.js';

const SCHOOLS_URL = new URL('../data/schools.json', import.meta.url);
const cities = JSON.parse(readFileSync(new URL('../data/cities.json', import.meta.url), 'utf8'));
let schools = JSON.parse(readFileSync(SCHOOLS_URL, 'utf8'));

export const SCHOOL_TYPES = ['лицей', 'гимназия', 'школа'];

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

// Разбирает строку вида «гимназия 25» / «25 школа» в пару { type, number }.
export function parseSchoolQuery(text) {
  const q = normalizeText(text).replace(/№|#/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return null;
  const numberMatch = q.match(/\d+/);
  const type = SCHOOL_TYPES.find((t) => q.includes(t)) || null;
  if (!numberMatch) return null;
  return { type, number: numberMatch[0] };
}

export function findSchoolInCity(cityId, query) {
  const parsed = parseSchoolQuery(query);
  if (!parsed) return null;
  const q = normalizeText(query);
  const digits = q.replace(/[^\d]/g, '');
  for (const school of getSchoolsByCity(cityId)) {
    const variants = [school.name, ...(school.aliases || [])].map(normalizeText);
    if (variants.includes(q)) return school;
    const typeOk = !parsed.type || school.type === parsed.type;
    const numberOk = !school.number || (digits && school.number === digits);
    if (typeOk && numberOk && parsed.number) return school;
  }
  return null;
}

export function createSchool({ cityId, type, number }) {
  const cleanType = SCHOOL_TYPES.includes(type) ? type : null;
  const cleanNumber = String(number ?? '').trim();
  if (!cleanType || !/^\d{1,4}$/.test(cleanNumber)) return null;
  const existing = findSchoolInCity(cityId, `${cleanType} ${cleanNumber}`);
  if (existing) return existing;
  const name = `${cleanType} ${cleanNumber}`;
  const words = { 1: 'один', 2: 'два', 3: 'три', 4: 'четыре', 5: 'пять' };
  const aliases = [...new Set([`${cleanType} ${words[cleanNumber] || cleanNumber}`, `${cleanNumber} ${cleanType}`])];
  const school = {
    id: `sch_${crypto.randomUUID().slice(0, 8)}`,
    cityId,
    type: cleanType,
    number: cleanNumber,
    name,
    aliases,
    verified: false,
  };
  schools.push(school);
  writeFileSync(SCHOOLS_URL, `${JSON.stringify(schools, null, 2)}\n`, 'utf8');
  return school;
}
