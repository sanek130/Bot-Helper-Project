import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/utils/rateLimit.js';

test('rateLimit пропускает 30 действий в минуту', () => {
  const limiter = createRateLimiter(30, 60_000);
  for (let i = 0; i < 30; i++) {
    assert.equal(limiter.check('user1'), true);
  }
});

test('rateLimit блокирует 31-е действие', () => {
  const limiter = createRateLimiter(30, 60_000);
  for (let i = 0; i < 30; i++) limiter.check('user2');
  assert.equal(limiter.check('user2'), false);
});
