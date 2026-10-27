import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeHomeworkTask,
  collectPhotoIds,
  MAX_TEXT_LENGTH,
  MAX_PHOTOS_PER_SUBJECT,
  SEPARATOR,
} from '../src/services/homeworkService.js';

test('новое ДЗ дописывается после старого через разделитель', () => {
  const result = mergeHomeworkTask({ text: 'Старое задание' }, { text: 'Новое задание' });
  assert.equal(result.text, `Старое задание\n\n${SEPARATOR}\n\nНовое задание`);
});

test('первое задание сохраняется без разделителя', () => {
  const result = mergeHomeworkTask(null, { text: 'Первое' });
  assert.equal(result.text, 'Первое');
});

test('фото объединяются без дублей, новые идут первыми', () => {
  const result = mergeHomeworkTask(
    { text: 'a', photoIds: ['old-1', 'both'] },
    { text: 'b', photoIds: ['both', 'new-1'] }
  );
  assert.deepEqual(result.photoIds, ['both', 'new-1', 'old-1']);
  assert.equal(collectPhotoIds(result).length, 3);
});

test('текст одной записи ограничен 2000 символами', () => {
  const long = 'я'.repeat(3500);
  const result = mergeHomeworkTask(null, { text: long });
  assert.equal(result.text.length, MAX_TEXT_LENGTH);
  assert.ok(result.text.endsWith('…'));
});

test('фото на предмет не больше 10', () => {
  const oldPhotos = Array.from({ length: 10 }, (_, index) => `old-${index}`);
  const newPhotos = Array.from({ length: 10 }, (_, index) => `new-${index}`);
  const result = mergeHomeworkTask({ text: 'a', photoIds: oldPhotos }, { text: 'b', photoIds: newPhotos });
  assert.equal(result.photoIds.length, MAX_PHOTOS_PER_SUBJECT);
  assert.equal(result.photoIds[0], 'new-0');
});

test('метаданные автора переносятся в результат', () => {
  const addedAt = new Date('2026-10-14T10:00:00Z');
  const result = mergeHomeworkTask({ text: 'a' }, { text: 'b', addedBy: 42, addedAt });
  assert.equal(result.addedBy, 42);
  assert.equal(result.addedAt, addedAt);
});
