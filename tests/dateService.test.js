import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toDateKey,
  addDaysToKey,
  getWeekDates,
  weekdayIndex,
  dayTitle,
  formatDateHuman,
  isDateKey,
} from '../src/services/dateService.js';

test('toDateKey переключает сутки по Москве, а не по UTC', () => {
  assert.equal(toDateKey(new Date('2026-10-11T20:59:59Z')), '2026-10-11'); // 23:59:59 MSK
  assert.equal(toDateKey(new Date('2026-10-11T21:00:00Z')), '2026-10-12'); // 00:00 MSK
  assert.equal(toDateKey(new Date('2026-10-12T00:30:00+03:00')), '2026-10-12');
});

test('addDaysToKey корректно переходит через месяц и год', () => {
  assert.equal(addDaysToKey('2026-10-31', 1), '2026-11-01');
  assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysToKey('2026-03-01', -1), '2026-02-28');
});

test('неделя начинается с воскресенья', () => {
  const week = getWeekDates(0, '2026-10-14');
  assert.deepEqual(week, [
    '2026-10-11',
    '2026-10-12',
    '2026-10-13',
    '2026-10-14',
    '2026-10-15',
    '2026-10-16',
    '2026-10-17',
  ]);
  assert.equal(weekdayIndex('2026-10-11'), 0);
});

test('заголовки дней и человеческий формат даты', () => {
  assert.equal(dayTitle('2026-10-14', '2026-10-14'), 'Сегодня');
  assert.equal(dayTitle('2026-10-15', '2026-10-14'), 'Завтра');
  assert.equal(dayTitle('2026-10-16', '2026-10-14'), 'Послезавтра');
  assert.equal(dayTitle('2026-10-20', '2026-10-14'), '20 октября, вт');
  assert.equal(formatDateHuman('2026-10-14'), '14 октября, ср');
});

test('isDateKey принимает только YYYY-MM-DD', () => {
  assert.equal(isDateKey('2026-10-14'), true);
  assert.equal(isDateKey('14.10.2026'), false);
  assert.equal(isDateKey('2026-1-4'), false);
});
