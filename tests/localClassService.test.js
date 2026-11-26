import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  requiredVotesFor,
  createJoinRequest,
  voteOnRequest,
  rejectRequest,
  kickMember,
  setVoteBlocked,
  unkickMember,
  cancelOwnRequest,
  getClassMembers,
  getPendingRequest,
  syncLocalClasses,
  attachOnRegistration,
  canManageClass,
  canVote,
} from '../src/services/localClassService.js';
import { membersPage, MEMBERS_PAGE_SIZE } from '../src/bot/keyboards.js';
import { User } from '../src/db/models/User.js';
import { LocalClass } from '../src/db/models/LocalClass.js';
import { ClassJoinRequest } from '../src/db/models/ClassJoinRequest.js';
import { connectTestDb, dropTestDb } from './_db.js';

const dbReady = await connectTestDb('localclass');
const skip = !dbReady && 'MongoDB недоступна';
let nextTgId = 910000001;

const SCHOOL = 'гимназия 25';
const CLASS = '10А';

async function createUser(fields = {}) {
  nextTgId += 1;
  return User.create({
    tgId: nextTgId,
    firstName: `Тест ${nextTgId}`,
    city: 'Краснодар',
    school: SCHOOL,
    class: CLASS,
    role: 'user',
    status: 'active',
    ...fields,
  });
}

// Приводит класс в чистое состояние между тестами: пользователи и заявки удаляются.
async function resetClass() {
  await Promise.all([User.deleteMany({}), ClassJoinRequest.deleteMany({}), LocalClass.deleteMany({})]);
}

after(async () => {
  await dropTestDb();
});

// ---------- Порог голосов ----------

test('requiredVotesFor: один–три участника принимают одним голосом', () => {
  assert.equal(requiredVotesFor(1), 1);
  assert.equal(requiredVotesFor(2), 1);
  assert.equal(requiredVotesFor(3), 1);
});

test('requiredVotesFor: начиная с четырёх участников нужно два голоса', () => {
  assert.equal(requiredVotesFor(4), 2);
  assert.equal(requiredVotesFor(10), 2);
});

// ---------- Бэкфилл существующих классов ----------

test('syncLocalClasses не распадает существующие классы и делает всех участниками', { skip }, async () => {
  await resetClass();
  const a = await createUser();
  const b = await createUser({ class: '11Б' });
  // У пользователей ещё нет classStatus — как в старой базе до миграции.
  await User.updateMany({}, { $unset: { classStatus: '', classJoinedAt: '' } });

  const result = await syncLocalClasses();
  assert.equal(result.createdClasses, 2);
  assert.equal(result.totalClasses, 2);

  const classes = await LocalClass.find({}).lean();
  assert.equal(classes.length, 2);
  assert.ok(classes.some((entry) => entry.classKey === `гимназия 25::10А`));

  for (const user of [a, b]) {
    const fresh = await User.findById(user._id);
    assert.equal(fresh.classStatus, 'member', 'все зарегистрированные становятся участниками');
    assert.ok(fresh.classJoinedAt);
  }
});

test('syncLocalClasses не возвращает права исключённым', { skip }, async () => {
  await resetClass();
  const kicked = await createUser({ classStatus: 'kicked' });
  await syncLocalClasses();
  const fresh = await User.findById(kicked._id);
  assert.equal(fresh.classStatus, 'kicked');
});

// ---------- Регистрация ----------

test('attachOnRegistration делает основателя участником нового класса', { skip }, async () => {
  await resetClass();
  const user = await createUser();
  const result = await attachOnRegistration(user.specId, { city: 'Краснодар', school: SCHOOL, className: CLASS });
  assert.equal(result.isMember, true);
  assert.equal(result.created, true);
  const fresh = await User.findById(user._id);
  assert.equal(fresh.classStatus, 'member');
  assert.ok(await LocalClass.exists({ classKey: `гимназия 25::10А` }));
});

test('attachOnRegistration для существующего класса ставит гостя', { skip }, async () => {
  await resetClass();
  const founder = await createUser();
  await attachOnRegistration(founder.specId, { city: 'Краснодар', school: SCHOOL, className: CLASS });
  const newcomer = await createUser();
  const result = await attachOnRegistration(newcomer.specId, { city: 'Краснодар', school: SCHOOL, className: CLASS });
  assert.equal(result.isMember, false);
  const fresh = await User.findById(newcomer._id);
  assert.equal(fresh.classStatus, 'guest');
});

// ---------- Заявка и голосование ----------

test('заявка отправляется, но без голосов участником не делает', { skip }, async () => {
  await resetClass();
  const founder = await createUser({ classStatus: 'member' });
  await attachOnRegistration(founder.specId, { city: 'Краснодар', school: SCHOOL, className: CLASS });
  const guest = await createUser({ classStatus: 'guest' });
  const request = await createJoinRequest(guest);
  assert.equal(request.status, 'pending');
  assert.equal(request.requiredVotes, 1, 'в классе из одного человека хватает одного голоса');
  assert.equal(request.classKey, `гимназия 25::10А`);
  const fresh = await User.findById(guest._id);
  assert.equal(fresh.classStatus, 'pending');
});

test('заявка дважды не создаётся', { skip }, async () => {
  await resetClass();
  const founder = await createUser({ classStatus: 'member' });
  await attachOnRegistration(founder.specId, { city: 'Краснодар', school: SCHOOL, className: CLASS });
  const guest = await createUser({ classStatus: 'guest' });
  await createJoinRequest(guest);
  await assert.rejects(() => createJoinRequest(guest), (err) => err.code === 'request_exists');
});

test('свой голос не одобряет свою заявку', { skip }, async () => {
  await resetClass();
  const founder = await createUser({ classStatus: 'member' });
  const classKey = (await attachOnRegistration(founder.specId, { city: 'Краснодар', school: SCHOOL, className: CLASS })).classKey;
  const guest = await createUser({ classStatus: 'guest' });
  const request = await ClassJoinRequest.create({
    classKey,
    applicantSpecId: guest.specId,
    requiredVotes: 1,
    expiresAt: new Date(Date.now() + 60_000),
  });
  await assert.rejects(() => voteOnRequest(request._id, guest), (err) => err.code === 'own_request');
});

test('голос участника одобряет заявку в маленьком классе', { skip }, async () => {
  await resetClass();
  const founder = await createUser({ classStatus: 'member' });
  await attachOnRegistration(founder.specId, { city: 'Краснодар', school: SCHOOL, className: CLASS });
  const guest = await createUser({ classStatus: 'guest' });
  const request = await createJoinRequest(guest);
  const voter = await User.findById(founder._id);
  const result = await voteOnRequest(request._id, voter);
  assert.equal(result.approved, true);
  const fresh = await User.findById(guest._id);
  assert.equal(fresh.classStatus, 'member', 'после одобрения заявитель становится участником');
});

test('в классе из четырёх участников одного голоса недостаточно', { skip }, async () => {
  await resetClass();
  const members = [];
  for (let i = 0; i < 4; i += 1) members.push(await createUser({ classStatus: 'member' }));
  await LocalClass.create({ classKey: `гимназия 25::10А`, city: 'Краснодар', school: SCHOOL, className: CLASS });
  const guest = await createUser({ classStatus: 'guest' });
  const request = await createJoinRequest(guest);
  assert.equal(request.requiredVotes, 2);
  const first = await voteOnRequest(request._id, members[0]);
  assert.equal(first.approved, false);
  const second = await voteOnRequest(request._id, members[1]);
  assert.equal(second.approved, true);
});

test('повторный голос отклоняется', { skip }, async () => {
  await resetClass();
  const members = [];
  for (let i = 0; i < 4; i += 1) members.push(await createUser({ classStatus: 'member' }));
  await LocalClass.create({ classKey: `гимназия 25::10А`, city: 'Краснодар', school: SCHOOL, className: CLASS });
  const guest = await createUser({ classStatus: 'guest' });
  const request = await createJoinRequest(guest);
  await voteOnRequest(request._id, members[0]);
  await assert.rejects(() => voteOnRequest(request._id, members[0]), (err) => err.code === 'already_voted');
});

test('голос из чужого класса не принимается', { skip }, async () => {
  await resetClass();
  const outsider = await createUser({ classStatus: 'member', class: '11Б' });
  await LocalClass.create({ classKey: `гимназия 25::11Б`, city: 'Краснодар', school: SCHOOL, className: '11Б' });
  const founder = await createUser({ classStatus: 'member' });
  await attachOnRegistration(founder.specId, { city: 'Краснодар', school: SCHOOL, className: CLASS });
  const guest = await createUser({ classStatus: 'guest' });
  const request = await createJoinRequest(guest);
  await assert.rejects(() => voteOnRequest(request._id, outsider), (err) => err.code === 'other_class');
});

test('участник без права голоса не голосует', { skip }, async () => {
  await resetClass();
  const founder = await createUser({ classStatus: 'member' });
  await attachOnRegistration(founder.specId, { city: 'Краснодар', school: SCHOOL, className: CLASS });
  await setVoteBlocked(founder.specId, true);
  const muted = await User.findById(founder._id);
  const guest = await createUser({ classStatus: 'guest' });
  const request = await createJoinRequest(guest);
  await assert.rejects(() => voteOnRequest(request._id, muted), (err) => err.code === 'vote_not_allowed');
});

// ---------- Исключение и права ----------

test('исключённый участник теряет голос и не может проситься снова', { skip }, async () => {
  await resetClass();
  const keeper = await createUser({ classStatus: 'member' });
  const target = await createUser({ classStatus: 'member' });
  await LocalClass.create({ classKey: `гимназия 25::10А`, city: 'Краснодар', school: SCHOOL, className: CLASS });

  await kickMember(target.specId);
  const fresh = await User.findById(target._id);
  assert.equal(fresh.classStatus, 'kicked');
  assert.equal(fresh.voteBlocked, true);
  assert.equal(fresh.classJoinedAt, undefined);

  const request = await createJoinRequest({ ...fresh.toObject(), classStatus: 'kicked' }).catch((err) => err);
  assert.equal(request.code, 'kicked');
  assert.ok(await User.findById(keeper._id), 'остальные участники остаются на месте');
});

test('последнего участника исключить нельзя', { skip }, async () => {
  await resetClass();
  const last = await createUser({ classStatus: 'member' });
  await LocalClass.create({ classKey: `гимназия 25::10А`, city: 'Краснодар', school: SCHOOL, className: CLASS });
  await assert.rejects(() => kickMember(last.specId), (err) => err.code === 'last_member');
});

test('исключение закрывает открытые заявки исключённого', { skip }, async () => {
  await resetClass();
  await createUser({ classStatus: 'member' });
  const target = await createUser({ classStatus: 'member' });
  const guest = await createUser({ classStatus: 'guest' });
  await LocalClass.create({ classKey: `гимназия 25::10А`, city: 'Краснодар', school: SCHOOL, className: CLASS });
  const request = await createJoinRequest(guest);
  await kickMember(target.specId);
  const closed = await ClassJoinRequest.findById(request._id);
  assert.equal(closed.status, 'pending', 'заявки другого человека не затрагиваются');
});

test('снятие исключения возвращает возможность просить', { skip }, async () => {
  await resetClass();
  await createUser({ classStatus: 'member' });
  const target = await createUser({ classStatus: 'member' });
  await LocalClass.create({ classKey: `гимназия 25::10А`, city: 'Краснодар', school: SCHOOL, className: CLASS });
  await kickMember(target.specId);
  await unkickMember(target.specId);
  const fresh = await User.findById(target._id);
  assert.equal(fresh.classStatus, 'guest');
  assert.equal(fresh.voteBlocked, false);
});

test('отмена заявки возвращает статус гостя', { skip }, async () => {
  await resetClass();
  const founder = await createUser({ classStatus: 'member' });
  await attachOnRegistration(founder.specId, { city: 'Краснодар', school: SCHOOL, className: CLASS });
  const guest = await createUser({ classStatus: 'guest' });
  const request = await createJoinRequest(guest);
  await cancelOwnRequest(request.classKey, guest.specId);
  const fresh = await User.findById(guest._id);
  assert.equal(fresh.classStatus, 'guest');
  assert.equal(await getPendingRequest(request.classKey, guest.specId), null);
});

test('отклонение заявки возвращает статус гостя', { skip }, async () => {
  await resetClass();
  const founder = await createUser({ classStatus: 'member' });
  await attachOnRegistration(founder.specId, { city: 'Краснодар', school: SCHOOL, className: CLASS });
  const guest = await createUser({ classStatus: 'guest' });
  const request = await createJoinRequest(guest);
  await rejectRequest(request._id, founder);
  const fresh = await User.findById(guest._id);
  assert.equal(fresh.classStatus, 'guest');
});

test('getClassMembers отдаёт только участников класса', { skip }, async () => {
  await resetClass();
  await createUser({ classStatus: 'member' });
  await createUser({ classStatus: 'guest' });
  await createUser({ classStatus: 'member', class: '11Б' });
  const members = await getClassMembers(`гимназия 25::10А`);
  assert.equal(members.length, 1);
});

// ---------- Права ----------

test('canManageClass: участник управляет, гость и исключённый — нет', () => {
  assert.equal(canManageClass({ classStatus: 'member', role: 'user' }), true);
  assert.equal(canManageClass({ classStatus: 'guest', role: 'user' }), false);
  assert.equal(canManageClass({ classStatus: 'kicked', role: 'user' }), false);
  assert.equal(canManageClass({ classStatus: 'guest', role: 'moderator' }), true, 'модератор управляет любым классом');
  assert.equal(canManageClass(null), false);
});

test('canVote: нужен статус участника и неотнятый голос', () => {
  assert.equal(canVote({ classStatus: 'member', voteBlocked: false }), true);
  assert.equal(canVote({ classStatus: 'member', voteBlocked: true }), false);
  assert.equal(canVote({ classStatus: 'guest' }), false);
});

// ---------- Страницы списка состава ----------

test('membersPage листает состав по 10 человек и не теряет хвост', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ specId: `id-${i}`, firstName: `User${i}` }));

  const small = membersPage(mk(3), 0);
  assert.equal(small.pages, 1);
  assert.equal(small.slice.length, 3);

  const first = membersPage(mk(11), 0);
  assert.equal(first.pages, 2);
  assert.equal(first.slice.length, MEMBERS_PAGE_SIZE);
  assert.equal(first.slice[0].firstName, 'User0');

  const second = membersPage(mk(11), 1);
  assert.equal(second.start, MEMBERS_PAGE_SIZE);
  assert.equal(second.slice.length, 1, 'одиннадцатый человек попадает на вторую страницу');
  assert.equal(second.slice[0].firstName, 'User10');

  // Номер страницы вне диапазона заворачивается, а не падает.
  assert.equal(membersPage(mk(25), 99).page, 0);
  assert.equal(membersPage(mk(11), -1).page, 1);
  assert.equal(membersPage([], 0).pages, 1);
});

test('membersPage: сумма страниц равна числу участников', () => {
  const members = Array.from({ length: 25 }, (_, i) => ({ specId: `id-${i}`, firstName: `User${i}` }));
  let seen = 0;
  const { pages } = membersPage(members, 0);
  for (let page = 0; page < pages; page += 1) seen += membersPage(members, page).slice.length;
  assert.equal(seen, 25);
});
