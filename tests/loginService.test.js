import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCode,
  hashCode,
  isExpired,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
} from '../src/services/loginService.js';

function request(overrides = {}) {
  return {
    kind: 'site-code',
    status: 'pending',
    codeHash: hashCode('123456'),
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

test('верный код принимается один раз', () => {
  const record = request();
  const first = checkCode(record, '123456');
  assert.equal(first.ok, true);

  record.status = 'approved';
  const second = checkCode(record, '123456');
  assert.equal(second.ok, false);
  assert.equal(second.error, 'used');
});

test('неверный код отклоняется', () => {
  assert.equal(checkCode(request(), '000000').error, 'invalid');
});

test('код живёт 5 минут', () => {
  assert.equal(CODE_TTL_MS, 5 * 60 * 1000);
  const expired = request({ expiresAt: new Date(Date.now() - 1000) });
  assert.equal(checkCode(expired, '123456').error, 'expired');
  assert.equal(isExpired(expired), true);
});

test('после 5 неудачных попыток код блокируется', () => {
  assert.equal(MAX_ATTEMPTS, 5);
  assert.equal(checkCode(request({ attempts: 4 }), '000000').error, 'invalid');
  assert.equal(checkCode(request({ attempts: 5 }), '123456').error, 'too_many_attempts');
});

test('хэш кода не содержит сам код', () => {
  assert.equal(hashCode('123456').includes('123456'), false);
  assert.equal(hashCode('123456'), hashCode('123456'));
});
