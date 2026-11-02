import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBanTarget,
  banTargetForUser,
  canBanTarget,
  banPerson,
  unbanPerson,
  getActiveBan,
  findAccountsForBanTarget,
} from '../src/services/banService.js';
import { User } from '../src/db/models/User.js';
import { connectTestDb, dropTestDb } from './_db.js';

const dbReady = await connectTestDb('ban');
const skip = !dbReady && 'MongoDB недоступна';

after(async () => {
  await dropTestDb();
});

test('parseBanTarget различает Telegram ID и юзернейм', () => {
  assert.deepEqual(parseBanTarget('123456789'), { tgId: 123456789 });
  assert.deepEqual(parseBanTarget('@Some_User'), { username: 'some_user' });
  assert.deepEqual(parseBanTarget('some_user'), { username: 'some_user' });
  assert.equal(parseBanTarget('ab'), null);
  assert.equal(parseBanTarget('имя'), null);
  assert.equal(parseBanTarget(''), null);
});

test('banTargetForUser берёт Telegram ID, а без него — юзернейм', () => {
  assert.deepEqual(banTargetForUser({ tgId: 111, username: 'name' }), { tgId: 111 });
  assert.deepEqual(banTargetForUser({ ownerTgId: 222, username: 'name' }), { tgId: 222 });
  assert.deepEqual(banTargetForUser({ username: 'Name_X' }), { username: 'name_x' });
  assert.equal(banTargetForUser({ username: '' }), null);
});

test('canBanTarget соблюдает иерархию ролей', () => {
  const moderator = { role: 'moderator', specId: 'm', tgId: 10 };
  const creator = { role: 'creator', specId: 'c', tgId: 20 };
  const user = { role: 'user', specId: 'u' };
  assert.equal(canBanTarget(moderator, { tgId: 999 }, [user]), true);
  assert.equal(canBanTarget(moderator, { tgId: 10 }, []), false);
  assert.equal(canBanTarget(moderator, { tgId: 999 }, [{ role: 'moderator', specId: 'x' }]), false);
  assert.equal(canBanTarget(creator, { tgId: 999 }, [{ role: 'moderator', specId: 'x' }]), true);
  assert.equal(canBanTarget(creator, { tgId: 999 }, [{ role: 'creator', specId: 'y' }]), false);
  assert.equal(canBanTarget({ role: 'admin', specId: 'a' }, { tgId: 999 }, []), false);
});

test('бан по Telegram ID действует на все аккаунты человека, включая те, из которых он вышел', { skip }, async () => {
  await User.create({ tgId: 7001, ownerTgId: 7001, status: 'active', firstName: 'Текущий' });
  await User.create({ ownerTgId: 7001, status: 'active', firstName: 'Старый' });
  await User.create({ tgId: 7002, ownerTgId: 7002, status: 'active', firstName: 'Чужой' });
  const { accountsBanned } = await banPerson({ tgId: 7001 }, 'спам', 'spec');
  assert.equal(accountsBanned, 2);
  assert.ok(await getActiveBan({ tgId: 7001 }));
  assert.equal(await User.countDocuments({ banned: true }), 2);
  assert.equal((await User.findOne({ tgId: 7002 })).banned, false);
  const { bansRemoved, accountsUnbanned } = await unbanPerson({ tgId: 7001 });
  assert.equal(bansRemoved, 1);
  assert.equal(accountsUnbanned, 2);
  assert.equal(await getActiveBan({ tgId: 7001 }), null);
});

test('бан по юзернейму без учёта регистра и повторный бан не дублирует запись', { skip }, async () => {
  await User.create({ username: 'NoId_User', status: 'active', firstName: 'Без ID' });
  await banPerson({ username: 'noid_user' }, '', 'spec');
  await banPerson({ username: 'noid_user' }, 'вторая причина', 'spec');
  const ban = await getActiveBan({ username: '@NOID_USER' });
  assert.equal(ban.reason, 'вторая причина');
  const accounts = await findAccountsForBanTarget({ username: 'noid_user' });
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].banned, true);
});
