import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findCity,
  getSchoolsForCity,
  mergeSchoolOptions,
  suggestCity,
} from '../src/services/searchService.js';
import { sanitizeSchoolName, normalizeText } from '../src/utils/normalize.js';

test('город ищется без учёта регистра и по alias', () => {
  assert.equal(findCity('МОСКВА').id, 'moscow');
  assert.equal(findCity('  москва  ').id, 'moscow');
  assert.equal(findCity('спб').id, 'spb');
  assert.equal(findCity('Санкт-Петербург').id, 'spb');
  assert.equal(findCity('неведомск'), null);
});

test('подсказки города не пустые и ограничены тремя', () => {
  const suggestions = suggestCity('мос');
  assert.ok(suggestions.length > 0 && suggestions.length <= 3);
  assert.ok(suggestions.includes('Москва'));
});

test('школы берутся из JSON и помечены verified: false', () => {
  const schools = getSchoolsForCity('krasnodar');
  assert.ok(schools.length >= 3 && schools.length <= 5);
  assert.ok(schools.every((school) => school.verified === false));
});

test('объединение школ убирает дубли без учёта регистра', () => {
  const result = mergeSchoolOptions(
    [{ name: 'Школа 1' }, { name: 'Гимназия 25' }],
    ['школа 1', 'Лицей 3', 'ШКОЛА 1']
  );
  assert.deepEqual(result, ['Школа 1', 'Гимназия 25', 'Лицей 3']);
});

test('название школы очищается и валидируется', () => {
  assert.equal(sanitizeSchoolName('  гимназия   25  '), 'гимназия 25');
  assert.equal(sanitizeSchoolName('а'), null);
  assert.equal(sanitizeSchoolName('я'.repeat(81)), null);
});

test('normalizeText убирает лишние пробелы и регистр', () => {
  assert.equal(normalizeText('  МосКва   Сити '), 'москва сити');
});
