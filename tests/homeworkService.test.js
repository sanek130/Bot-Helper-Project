import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeHomeworkTask } from '../src/services/homeworkService.js';

test('mergeHomeworkTask создаёт новое задание', () => {
  const result = mergeHomeworkTask(null, 'Решить №1', ['file1']);
  assert.deepEqual(result, { text: 'Решить №1', photoIds: ['file1'] });
});

test('mergeHomeworkTask объединяет текст через ———', () => {
  const existing = { text: 'Старое', photoIds: [] };
  const result = mergeHomeworkTask(existing, 'Новое', []);
  assert.equal(result.text, 'Старое\n———\nНовое');
});

test('mergeHomeworkTask ограничивает текст 4000 символами', () => {
  const existing = { text: 'а'.repeat(3000), photoIds: [] };
  const result = mergeHomeworkTask(existing, 'б'.repeat(2000), []);
  assert.ok(result.text.length <= 4000);
});

test('mergeHomeworkTask удаляет дубликаты фото', () => {
  const existing = { text: '', photoIds: ['file1', 'file2'] };
  const result = mergeHomeworkTask(existing, '', ['file2', 'file3']);
  assert.deepEqual(result.photoIds, ['file3', 'file2', 'file1']);
});

test('mergeHomeworkTask ограничивает 10 фото', () => {
  const existing = { text: '', photoIds: Array(9).fill('x').map((_, i) => `f${i}`) };
  const result = mergeHomeworkTask(existing, '', ['new1', 'new2']);
  assert.equal(result.photoIds.length, 10);
});
