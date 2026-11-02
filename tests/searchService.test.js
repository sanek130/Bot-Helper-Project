import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCity, getSchoolOptions } from '../src/utils/searchService.js';

test('findCity нечувствителен к регистру', () => {
  const results = findCity('МОСКВА');
  assert.ok(results.length > 0);
  assert.equal(results[0].name.toLowerCase(), 'москва');
});

test('findCity учитывает aliases', () => {
  const results = findCity('спб');
  assert.ok(results.length > 0);
});

test('getSchoolOptions объединяет JSON и БД без дублей', () => {
  // Названия из БД выбраны так, чтобы не совпадать с src/data/schools.json: тест не зависит от правок справочника.
  const fromJson = getSchoolOptions('krasnodar', []);
  const dbSchools = ['тестовая школа 999', 'ТЕСТОВАЯ ШКОЛА 999', fromJson[0].toUpperCase()];
  const result = getSchoolOptions('krasnodar', dbSchools);
  assert.ok(fromJson.every((name) => result.includes(name)));
  const count = (name) => result.filter((s) => s.toLowerCase() === name.toLowerCase()).length;
  assert.equal(count('тестовая школа 999'), 1);
  assert.equal(count(fromJson[0]), 1);
  assert.equal(result.length, fromJson.length + 1);
});
