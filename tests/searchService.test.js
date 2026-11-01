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

test('getSchoolOptions объединяет JSON и БД', () => {
  const dbSchools = ['школа 1', 'ГИМНАЗИЯ 25'];
  const result = getSchoolOptions('krasnodar', dbSchools);
  assert.ok(result.includes('гимназия 25'));
  assert.ok(result.includes('школа 1'));
  // Дедупликация без учёта регистра
  const count = result.filter((s) => s.toLowerCase() === 'гимназия 25').length;
  assert.equal(count, 1);
});
