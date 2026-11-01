import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyWarn, resetWarns } from '../src/services/userService.js';
import { User } from '../src/db/models/User.js';
import { connectTestDb, dropTestDb } from './_db.js';

const dbReady = await connectTestDb('user');
const skip = !dbReady && 'MongoDB недоступна';
let nextTgId = 900000001;

async function createUser(fields = {}) {
  nextTgId += 1;
  return User.create({
    tgId: nextTgId,
    firstName: 'Тест',
    city: 'Краснодар',
    school: 'гимназия 25',
    class: '10А',
    role: 'user',
    status: 'active',
    ...fields,
  });
}

after(async () => {
  await dropTestDb();
});

test('applyWarn увеличивает warns на 1', { skip }, async () => {
  const user = await createUser({ warns: 0 });
  const updated = await applyWarn(user.tgId);
  assert.equal(updated.warns, 1);
});

test('applyWarn при 3 варнах ставит adminBanned', { skip }, async () => {
  const user = await createUser({ warns: 2, role: 'admin' });
  const updated = await applyWarn(user.tgId);
  assert.equal(updated.warns, 3);
  assert.equal(updated.adminBanned, true);
  assert.equal(updated.role, 'user');
});

test('resetWarns сбрасывает warns, но не adminBanned', { skip }, async () => {
  const user = await createUser({ warns: 3, adminBanned: true });
  const updated = await resetWarns(user.tgId);
  assert.equal(updated.warns, 0);
  assert.equal(updated.adminBanned, true);
});
