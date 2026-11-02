import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  unlinkTelegram,
  getDetachedAccounts,
  claimDetachedAccount,
  isDetachedOwnedBy,
  backfillOwnerTgId,
} from '../src/services/userService.js';
import { User } from '../src/db/models/User.js';
import { connectTestDb, dropTestDb } from './_db.js';

const dbReady = await connectTestDb('accounts');
const skip = !dbReady && 'MongoDB недоступна';

after(async () => {
  await dropTestDb();
});

function activeUser(fields) {
  return User.create({ status: 'active', city: 'Краснодар', school: 'гимназия 25', class: '10А', role: 'user', ...fields });
}

test('выход из аккаунта сохраняет ownerTgId, и аккаунт виден в списке', { skip }, async () => {
  const user = await activeUser({ tgId: 8001, ownerTgId: 8001, platforms: ['telegram'] });
  await unlinkTelegram(8001);
  const fresh = await User.findById(user._id);
  assert.equal(fresh.tgId, undefined);
  assert.equal(fresh.ownerTgId, 8001);
  assert.equal(isDetachedOwnedBy(fresh, 8001), true);
  assert.equal(isDetachedOwnedBy(fresh, 8002), false);
  const list = await getDetachedAccounts(8001);
  assert.deepEqual(list.map((u) => u.specId), [user.specId]);
});

test('вход по спец-ID в аккаунт без привязки отвязывает текущий аккаунт, но не удаляет его', { skip }, async () => {
  const old = await activeUser({ ownerTgId: 8101, class: '9Б' });
  const current = await activeUser({ tgId: 8101, ownerTgId: 8101, class: '11В' });
  const claimed = await claimDetachedAccount(old.specId, 8101, { firstName: 'Саша' });
  assert.equal(claimed.specId, old.specId);
  assert.equal(claimed.tgId, 8101);
  const previous = await User.findById(current._id);
  assert.equal(previous.tgId, undefined);
  assert.equal(previous.ownerTgId, 8101);
  const list = await getDetachedAccounts(8101);
  assert.deepEqual(list.map((u) => u.specId), [current.specId]);
});

test('аккаунт, привязанный к другому Telegram, без force не забирается', { skip }, async () => {
  const foreign = await activeUser({ tgId: 8201, ownerTgId: 8201 });
  await assert.rejects(() => claimDetachedAccount(foreign.specId, 8202), /tg_already_linked/);
  const forced = await claimDetachedAccount(foreign.specId, 8202, {}, { force: true });
  assert.equal(forced.tgId, 8202);
  assert.equal(forced.ownerTgId, 8202);
});

test('черновик регистрации удаляется при входе в старый аккаунт', { skip }, async () => {
  const old = await activeUser({ ownerTgId: 8301 });
  await User.create({ tgId: 8301, ownerTgId: 8301, status: 'unregistered', draft: { city: 'Краснодар' } });
  await claimDetachedAccount(old.specId, 8301);
  assert.equal(await User.countDocuments({ ownerTgId: 8301 }), 1);
});

test('backfillOwnerTgId идемпотентен', { skip }, async () => {
  await User.collection.insertOne({ specId: '11111111-1111-4111-8111-111111111111', tgId: 8401, status: 'active' });
  assert.ok((await backfillOwnerTgId()) >= 1);
  assert.equal(await backfillOwnerTgId(), 0);
  assert.equal((await User.findOne({ tgId: 8401 })).ownerTgId, 8401);
});
