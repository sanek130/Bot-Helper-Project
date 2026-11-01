import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupOldHomework, cleanupPendingAccounts } from '../src/services/cleanupService.js';
import Homework from '../src/db/models/Homework.js';
import { User } from '../src/db/models/User.js';
import { connectTestDb, dropTestDb } from './_db.js';

const dbReady = await connectTestDb('cleanup');
const skip = !dbReady && 'MongoDB недоступна';

before(async () => {
  if (dbReady) await Homework.deleteMany({});
});

after(async () => {
  await dropTestDb();
});

test('cleanupOldHomework удаляет старые дни', { skip }, async () => {
  const oldDate = '2020-01-01';
  const newDate = '2099-12-31';
  await Homework.create({
    classKey: 'Test::1A',
    data: {
      [oldDate]: { subj1: { text: 'old', photoIds: [], addedBy: 1, addedAt: new Date() } },
      [newDate]: { subj2: { text: 'new', photoIds: [], addedBy: 1, addedAt: new Date() } },
    },
  });
  const result = await cleanupOldHomework(14);
  assert.equal(result.daysRemoved, 1);
  const hw = await Homework.findOne({ classKey: 'Test::1A' });
  assert.ok(!hw.data[oldDate]);
  assert.ok(hw.data[newDate]);
});

test('cleanupOldHomework идемпотентен', { skip }, async () => {
  await cleanupOldHomework(14);
  const result2 = await cleanupOldHomework(14);
  assert.equal(result2.daysRemoved, 0);
});

test('cleanupPendingAccounts удаляет только просроченные pending', { skip }, async () => {
  await User.create({ status: 'pending', pendingExpiresAt: new Date(Date.now() - 60_000), firstName: 'old' });
  await User.create({ status: 'pending', pendingExpiresAt: new Date(Date.now() + 60_000), firstName: 'fresh' });
  const result = await cleanupPendingAccounts();
  assert.equal(result.removedCount, 1);
  const again = await cleanupPendingAccounts();
  assert.equal(again.removedCount, 0);
  assert.equal(await User.countDocuments({ firstName: 'fresh' }), 1);
});
