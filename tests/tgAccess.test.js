import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTgCodeRequest, verifyTgCode } from '../src/services/loginService.js';
import {
  parseTgId,
  getAccountsForTg,
  canEnterWithTg,
  bindAccountToTg,
  createVerifiedWebUser,
} from '../src/services/tgAccessService.js';
import { User } from '../src/db/models/User.js';
import { LoginRequest } from '../src/db/models/LoginRequest.js';
import { connectTestDb, dropTestDb } from './_db.js';

const dbReady = await connectTestDb('tgaccess');
const skip = !dbReady && 'MongoDB недоступна';

after(async () => {
  await dropTestDb();
});

function activeUser(fields) {
  return User.create({ status: 'active', city: 'Краснодар', school: 'гимназия 25', class: '10А', role: 'user', ...fields });
}

const webFields = { firstName: 'Саша', city: 'Краснодар', school: 'гимназия 25', className: '8Б', role: 'user' };

test('parseTgId принимает только числовой Telegram ID', () => {
  assert.equal(parseTgId('123456789'), 123456789);
  assert.equal(parseTgId(' 98765 '), 98765);
  assert.equal(parseTgId('1234'), null);
  assert.equal(parseTgId('12ab45'), null);
  assert.equal(parseTgId(''), null);
  assert.equal(parseTgId('-123456'), null);
});

test('код подтверждения Telegram проверяется и одноразовый', { skip }, async () => {
  const { code } = await createTgCodeRequest(70001);
  await assert.rejects(verifyTgCode(70001, code === '000000' ? '111111' : '000000'), { code: 'invalid_code' });
  assert.equal(await verifyTgCode(70001, code), 70001);
  await assert.rejects(verifyTgCode(70001, code), { code: 'expired' });
});

test('повторный код раньше чем через минуту не отправляется', { skip }, async () => {
  await createTgCodeRequest(70002);
  await assert.rejects(createTgCodeRequest(70002), { code: 'code_cooldown' });
  await LoginRequest.collection.updateMany({ userId: 'tg:70002' }, { $set: { createdAt: new Date(Date.now() - 61_000) } });
  const again = await createTgCodeRequest(70002);
  assert.match(again.code, /^\d{6}$/);
});

test('список аккаунтов Telegram: привязанный и отвязанные, без чужих и неактивных', { skip }, async () => {
  const bound = await activeUser({ tgId: 70101, ownerTgId: 70101 });
  const detached = await activeUser({ ownerTgId: 70101, class: '9Б' });
  await activeUser({ tgId: 70102, ownerTgId: 70102 });
  await User.create({ status: 'pending', ownerTgId: 70101, city: 'Краснодар' });
  const list = await getAccountsForTg(70101);
  assert.deepEqual(list.map((u) => u.specId).sort(), [bound.specId, detached.specId].sort());
  assert.equal(canEnterWithTg(bound, 70101), true);
  assert.equal(canEnterWithTg(detached, 70101), true);
  assert.equal(canEnterWithTg(bound, 70102), false);
});

test('привязка аккаунта без Telegram даёт ему tgId', { skip }, async () => {
  const user = await activeUser({ ownerTgId: 70201 });
  const result = await bindAccountToTg(user.specId, 70201);
  assert.equal(result.changed, true);
  assert.equal(result.user.tgId, 70201);
  const again = await bindAccountToTg(user.specId, 70201);
  assert.equal(again.changed, false);
});

test('чужой привязанный аккаунт перепривязать нельзя', { skip }, async () => {
  const user = await activeUser({ tgId: 70301, ownerTgId: 70301 });
  await assert.rejects(bindAccountToTg(user.specId, 70302), { code: 'tg_already_linked' });
});

test('замена текущего аккаунта в боте только с makeMain', { skip }, async () => {
  const current = await activeUser({ tgId: 70401, ownerTgId: 70401, class: '11В' });
  const other = await activeUser({ ownerTgId: 70401, class: '7А' });
  await assert.rejects(bindAccountToTg(other.specId, 70401), (err) => {
    assert.equal(err.code, 'tg_has_account');
    assert.equal(err.current.specId, current.specId);
    return true;
  });
  const result = await bindAccountToTg(other.specId, 70401, { makeMain: true });
  assert.equal(result.replaced, current.specId);
  const oldFresh = await User.findById(current._id);
  assert.equal(oldFresh.tgId, undefined);
  assert.equal(oldFresh.ownerTgId, 70401);
  assert.equal(oldFresh.status, 'active');
  assert.equal((await User.findById(other._id)).tgId, 70401);
});

test('регистрация с подтверждённым Telegram сразу активна и привязана', { skip }, async () => {
  const { user, linked } = await createVerifiedWebUser(webFields, 70501);
  assert.equal(linked, true);
  assert.equal(user.status, 'active');
  assert.equal(user.tgId, 70501);
  assert.equal(user.ownerTgId, 70501);
  assert.equal(user.class, '8Б');
  assert.equal(user.pendingExpiresAt, undefined);
});

test('регистрация с подтверждённым Telegram не отнимает место у текущего аккаунта', { skip }, async () => {
  const current = await activeUser({ tgId: 70601, ownerTgId: 70601 });
  const { user, linked, current: info } = await createVerifiedWebUser(webFields, 70601);
  assert.equal(linked, false);
  assert.equal(info.specId, current.specId);
  assert.equal(user.status, 'active');
  assert.equal(user.tgId, undefined);
  assert.equal(user.ownerTgId, 70601);
  const list = await getAccountsForTg(70601);
  assert.equal(list.length, 2);
});
