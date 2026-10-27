import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/utils/rateLimit.js';

test('лимит 30 действий в минуту', () => {
  const limiter = createRateLimiter({ max: 30, windowMs: 60_000, warnEveryMs: 3_000 });

  const now = 10_000;
  for (let index = 0; index < 30; index += 1) {
    assert.equal(limiter.check('1', now).allowed, true);
  }

  const blocked = limiter.check('1', now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.canWarn, true);
});

test('предупреждение не чаще раза в 3 секунды', () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000, warnEveryMs: 3_000 });
  assert.equal(limiter.check('2', 4_000).allowed, true);
  assert.equal(limiter.check('2', 4_100).canWarn, true);
  assert.equal(limiter.check('2', 4_200).canWarn, false);
  assert.equal(limiter.check('2', 7_200).canWarn, true);
});

test('окно сбрасывается через минуту, лимиты разных людей не пересекаются', () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 1_000, warnEveryMs: 0 });
  assert.equal(limiter.check('3', 0).allowed, true);
  assert.equal(limiter.check('3', 10).allowed, false);
  assert.equal(limiter.check('4', 10).allowed, true);
  assert.equal(limiter.check('3', 1_100).allowed, true);
});
