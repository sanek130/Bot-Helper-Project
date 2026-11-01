import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDateKey, fromDateKey, getToday, getDayTitle, getWeekDates } from '../src/utils/dateService.js';

test('toDateKey возвращает YYYY-MM-DD по Москве', () => {
  // Граничный случай: 2026-11-01 21:00 UTC = 2026-11-02 00:00 МСК
  const date = new Date('2026-11-01T21:00:00Z');
  assert.equal(toDateKey(date), '2026-11-02');
});

test('toDateKey для полдня UTC', () => {
  const date = new Date('2026-11-01T12:00:00Z');
  assert.equal(toDateKey(date), '2026-11-01');
});

test('fromDateKey возвращает Date', () => {
  const date = fromDateKey('2026-11-01');
  assert.equal(date.toISOString(), '2026-11-01T12:00:00.000Z');
});

test('getDayTitle возвращает "Сегодня" для текущей даты', () => {
  const today = getToday();
  assert.equal(getDayTitle(today), 'Сегодня');
});

test('getWeekDates возвращает 7 дней', () => {
  const dates = getWeekDates(0);
  assert.equal(dates.length, 7);
  assert.ok(dates[0].dateKey.match(/^\d{4}-\d{2}-\d{2}$/));
});
