import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupHomeworkData,
  cleanupCompletedHomework,
  getCutoffKey,
} from '../src/services/cleanupService.js';
import { addDaysToKey, toDateKey } from '../src/services/dateService.js';

test('старые дни удаляются, свежие остаются', () => {
  const data = {
    '2026-09-01': { Алгебра: { text: 'old' } },
    '2026-10-01': { Русский: { text: 'border' } },
    '2026-10-14': { Физика: { text: 'new' } },
  };

  const result = cleanupHomeworkData(data, '2026-10-01');
  assert.deepEqual(Object.keys(result.data).sort(), ['2026-10-01', '2026-10-14']);
  assert.equal(result.deletedDays, 1);
  assert.equal(result.deletedEntries, 1);
});

test('повторный запуск ничего не ломает', () => {
  const data = { '2026-09-01': { Алгебра: {} }, '2026-10-14': { Физика: {} } };
  const first = cleanupHomeworkData(data, '2026-10-01');
  const second = cleanupHomeworkData(first.data, '2026-10-01');
  assert.equal(second.deletedDays, 0);
  assert.equal(second.deletedEntries, 0);
  assert.deepEqual(second.data, first.data);
});

test('completedHomework чистится по тем же датам', () => {
  const completed = { '2026-09-01': ['Алгебра'], '2026-10-14': ['Физика'] };
  const result = cleanupCompletedHomework(completed, '2026-10-01');
  assert.deepEqual(Object.keys(result.completed), ['2026-10-14']);
  assert.equal(result.deleted, 1);
});

test('cutoff считается от сегодняшней даты по Москве', () => {
  const today = toDateKey();
  assert.equal(getCutoffKey(14), addDaysToKey(today, -14));
});
