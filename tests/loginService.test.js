import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createSiteCodeRequest, verifySiteCode } from '../src/services/loginService.js';
import { connectTestDb, dropTestDb } from './_db.js';

const dbReady = await connectTestDb('login');
const skip = !dbReady && 'MongoDB недоступна';

after(async () => {
  await dropTestDb();
});

test('createSiteCodeRequest возвращает 6-значный код', { skip }, async () => {
  const { code } = await createSiteCodeRequest('test-spec-id');
  assert.match(code, /^\d{6}$/);
});

test('verifySiteCode отклоняет неверный код', { skip }, async () => {
  const { code } = await createSiteCodeRequest('test-spec-id-2');
  // Код выбирается случайно из 100000–999999, поэтому 000000 всегда неверный.
  assert.notEqual(code, '000000');
  await assert.rejects(() => verifySiteCode('test-spec-id-2', '000000'), /invalid_code/);
});

test('verifySiteCode блокирует после 5 попыток', { skip }, async () => {
  const specId = 'test-spec-id-3';
  await createSiteCodeRequest(specId);
  for (let i = 0; i < 5; i++) {
    try {
      await verifySiteCode(specId, '000000');
    } catch {
      // Ожидаемые ошибки неверного кода.
    }
  }
  await assert.rejects(() => verifySiteCode(specId, '123456'), /too_many_attempts/);
});
