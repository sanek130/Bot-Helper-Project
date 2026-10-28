import test from 'node:test';
import assert from 'node:assert/strict';
import { canModerate, isProtectedCreator } from '../src/services/userService.js';
import { cleanSupportText, unansweredCount } from '../src/services/supportService.js';
import { normalizePhone } from '../src/utils/normalize.js';

test('создатель может банить пользователей и админов, но не создателей и не себя', () => {
  process.env.MODERATOR_IDS = '111';
  const creator = { specId: 'c', role: 'creator', tgId: 111 };
  assert.equal(canModerate(creator, { specId: 'u', role: 'user' }), true);
  assert.equal(canModerate(creator, { specId: 'a', role: 'admin' }), true);
  assert.equal(canModerate(creator, { specId: 'c2', role: 'creator' }), false);
  assert.equal(canModerate(creator, creator), false);
  assert.equal(isProtectedCreator({ specId: 'x', role: 'user', tgId: 111 }), true);
});

test('номер телефона приводится к формату +7…', () => {
  assert.equal(normalizePhone('8 (999) 123-45-67'), '+79991234567');
  assert.equal(normalizePhone('+7 999 123 45 67'), '+79991234567');
  assert.equal(normalizePhone('9991234567'), '+79991234567');
  assert.equal(normalizePhone('12345'), null);
});

test('текст обращения в поддержку проверяется по длине', () => {
  assert.equal(cleanSupportText('  ок '), null);
  assert.equal(cleanSupportText('Не вижу ДЗ'), 'Не вижу ДЗ');
  assert.equal(cleanSupportText('x'.repeat(2001)), null);
});

test('считаем сообщения пользователя без ответа', () => {
  const ticket = { messages: [{ from: 'user' }, { from: 'support' }, { from: 'user' }, { from: 'user' }] };
  assert.equal(unansweredCount(ticket), 2);
});
