import { LocalClass } from '../db/models/LocalClass.js';
import { ClassJoinRequest } from '../db/models/ClassJoinRequest.js';
import { User } from '../db/models/User.js';
import { getClassKey, parseClassKey } from './homeworkService.js';
import { escapeRegex } from '../utils/normalize.js';

// Заявка живёт неделю: за это время участники класса успевают её увидеть.
export const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Порог приёма зависит от размера класса:
// маленький класс (1–3 участника) принимает даже одним голосом, иначе заявку было бы
// невозможно одобрить: в классе из одного человека просто нет второго голосующего.
export function requiredVotesFor(memberCount) {
  return Number(memberCount) <= 3 ? 1 : 2;
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function exactRegex(value) {
  return new RegExp(`^${escapeRegex(String(value ?? ''))}$`, 'i');
}

// ---------- Чтение ----------

export function classKeyOf(user) {
  if (!user?.school || !user?.class) return '';
  return getClassKey(user.school, user.class);
}

export async function getLocalClass(classKey) {
  if (!classKey) return null;
  return LocalClass.findOne({ classKey: String(classKey) });
}

export async function localClassExists(classKey) {
  if (!classKey) return false;
  return Boolean(await LocalClass.exists({ classKey: String(classKey) }));
}

export async function listLocalClasses({ city = '', limit = 200 } = {}) {
  const filter = city ? { city: exactRegex(city) } : {};
  return LocalClass.find(filter).sort({ school: 1, className: 1 }).limit(Math.min(Math.max(Number(limit) || 200, 1), 500));
}

// Все участники класса, у которых есть Telegram: им уходит уведомление о заявке.
export async function getVotingMembers(classKey) {
  const { school, class: className } = parseClassKey(classKey);
  return User.find({
    status: 'active',
    classStatus: 'member',
    voteBlocked: { $ne: true },
    school: exactRegex(school),
    class: exactRegex(className),
  });
}

export async function getClassMembers(classKey) {
  const { school, class: className } = parseClassKey(classKey);
  return User.find({
    status: 'active',
    classStatus: 'member',
    school: exactRegex(school),
    class: exactRegex(className),
  }).sort({ classJoinedAt: 1, createdAt: 1 });
}

// ---------- Права ----------

// Управление классом доступно каждому его участнику (плюс модераторы и создатели).
// guest и kicked прав не имеют, у staff проверка членства не требуется.
export function canManageClass(user, { isModerator } = {}) {
  if (!user) return false;
  // Роль можно и передать явно, и вывести из самой записи пользователя: сервис не должен
  // зависеть от того, загрузили ли вызывающий код роль отдельно.
  const staff = typeof isModerator === 'boolean' ? isModerator : user.role === 'moderator' || user.role === 'creator';
  if (staff) return true;
  return user.classStatus === 'member';
}

export function canVote(user) {
  return Boolean(user) && user.classStatus === 'member' && user.voteBlocked !== true;
}

// ---------- Создание и бэкфилл ----------

// Существующие классы не распадаются: при старте каждый classKey из Homework и из активных
// пользователей превращается в LocalClass, а все зарегистрированные в нём становятся участниками.
export async function syncLocalClasses() {
  const userClasses = await User.aggregate([
    { $match: { status: 'active', school: { $nin: [null, ''] }, class: { $nin: [null, ''] } } },
    {
      $group: {
        _id: { school: '$school', class: '$class' },
        city: { $first: '$city' },
        founder: { $first: '$specId' },
      },
    },
  ]);
  let createdClasses = 0;
  let updatedUsers = 0;
  for (const entry of userClasses) {
    const classKey = getClassKey(entry._id.school, entry._id.class);
    const res = await LocalClass.updateOne(
      { classKey },
      {
        $setOnInsert: {
          classKey,
          city: entry.city || '',
          school: entry._id.school,
          className: entry._id.class,
          founderSpecId: entry.founder || '',
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) createdClasses += 1;
    // Все зарегистрированные в классе автоматически становятся его участниками.
    // Но только те, у кого статуса ещё нет вовсе: это пользователи из базы до появления
    // локальных классов. Гостей, исключённых и ожидающих голосования не трогаем —
    // иначе каждый перезапуск бота выдавал бы права в обход голосования.
    const fill = await User.updateMany(
      {
        status: 'active',
        school: exactRegex(entry._id.school),
        class: exactRegex(entry._id.class),
        $or: [{ classStatus: { $exists: false } }, { classStatus: null }],
      },
      { $set: { classStatus: 'member', classJoinedAt: new Date() } },
    );
    updatedUsers += fill.modifiedCount;
  }
  return { createdClasses, updatedUsers, totalClasses: userClasses.length };
}

// Класс создаётся при первой регистрации в нём: заявитель сразу становится участником.
export async function ensureLocalClass({ city, school, className, founderSpecId = '' }) {
  const classKey = getClassKey(school, className);
  const doc = await LocalClass.findOneAndUpdate(
    { classKey },
    {
      $setOnInsert: {
        classKey,
        city: city || '',
        school,
        className,
        founderSpecId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return doc;
}

// Регистрация: если класс уже существует — человек по умолчанию guest и может попроситься внутрь.
// Если класса нет — он его основывает и сразу получает права участника.
export async function attachOnRegistration(specId, { city, school, className }) {
  const classKey = getClassKey(school, className);
  const exists = await localClassExists(classKey);
  if (!exists) {
    await ensureLocalClass({ city, school, className, founderSpecId: specId });
    await User.updateOne(
      { specId: String(specId) },
      { $set: { classStatus: 'member', classJoinedAt: new Date(), voteBlocked: false } },
    );
    return { classKey, isMember: true, created: true };
  }
  // Класс есть: остаёмся гостем, права не выдаём и заявку автоматически не создаём.
  await User.updateOne({ specId: String(specId) }, { $set: { classStatus: 'guest' } });
  return { classKey, isMember: false, created: false };
}

// ---------- Заявки ----------

export async function getPendingRequest(classKey, applicantSpecId) {
  return ClassJoinRequest.findOne({ classKey: String(classKey), applicantSpecId: String(applicantSpecId), status: 'pending' });
}

export async function getRequestById(id) {
  if (!id) return null;
  return ClassJoinRequest.findById(id);
}

export async function listPendingRequests(classKey) {
  return ClassJoinRequest.find({ classKey: String(classKey), status: 'pending' }).sort({ createdAt: 1 });
}

export async function createJoinRequest(user) {
  const classKey = classKeyOf(user);
  if (!classKey) throw fail('no_class');
  // Статус читаем из базы: объект пользователя мог быть загружен до предыдущей заявки.
  const fresh = await User.findOne({ specId: String(user.specId) }).select('classStatus').lean();
  const classStatus = fresh?.classStatus || user.classStatus;
  if (classStatus === 'member') throw fail('already_member');
  if (classStatus === 'kicked') throw fail('kicked');
  if (!(await localClassExists(classKey))) throw fail('no_local_class');
  // Явная проверка дубликата: частичный уникальный индекс может быть ещё не построен.
  if (await getPendingRequest(classKey, user.specId)) throw fail('request_exists');
  const members = await getClassMembers(classKey);
  const memberCount = members.length;
  // В классе не осталось участников (все переехали в другие классы): просить не у кого,
  // поэтому заявитель занимает пустой класс сам — как при первичной регистрации.
  // Заявка не создаётся, но возвращается объект в той же форме со статусом approved.
  if (memberCount === 0) {
    await User.updateOne(
      { specId: String(user.specId) },
      { $set: { classStatus: 'member', classJoinedAt: new Date(), voteBlocked: false } },
    );
    return {
      _id: null,
      classKey,
      applicantSpecId: user.specId,
      applicantTgId: user.tgId ?? null,
      applicantName: user.firstName || '',
      status: 'approved',
      votes: [],
      requiredVotes: 1,
      resolvedAt: new Date(),
    };
  }
  const requiredVotes = requiredVotesFor(memberCount);
  try {
    // Отмечаем статус 'pending' сразу, чтобы карточка класса показывала «заявка отправлена».
    await User.updateOne(
      { specId: user.specId, classStatus: { $ne: 'member' } },
      { $set: { classStatus: 'pending' } },
    );
    const req = await ClassJoinRequest.create({
      classKey,
      applicantSpecId: user.specId,
      applicantTgId: user.tgId ?? null,
      applicantName: user.firstName || '',
      requiredVotes,
      expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
    });
    return req;
  } catch (err) {
    // Уникальный частичный индекс: у человека уже есть активная заявка в этот класс.
    // Откатываем статус, чтобы пользователь не остался в подвешенном состоянии.
    if (err?.code === 11000) {
      await User.updateOne({ specId: user.specId, classStatus: 'pending' }, { $set: { classStatus: 'guest' } });
      throw fail('request_exists');
    }
    throw err;
  }
}

// Голос участника. Возвращает заявку и признак того, что порог набран.
export async function voteOnRequest(requestId, voter) {
  const request = await ClassJoinRequest.findById(requestId);
  if (!request) throw fail('request_not_found');
  if (request.status !== 'pending') throw fail('request_closed');
  if (request.applicantSpecId === voter.specId) throw fail('own_request');
  if (!canVote(voter)) throw fail('vote_not_allowed');
  // Голосовать можно только за свой класс: модератор чужого класса в голосовании не участвует.
  if (classKeyOf(voter) !== request.classKey) throw fail('other_class');
  if (request.votes.some((vote) => vote.voterSpecId === voter.specId)) throw fail('already_voted');
  request.votes.push({ voterSpecId: voter.specId, at: new Date() });
  const approved = request.votes.length >= request.requiredVotes;
  if (approved) {
    request.status = 'approved';
    request.resolvedBy = voter.specId;
    request.resolvedAt = new Date();
  }
  await request.save();
  if (approved) await approveApplicant(request);
  return { request, approved };
}

async function approveApplicant(request) {
  await User.updateOne(
    { specId: request.applicantSpecId },
    { $set: { classStatus: 'member', classJoinedAt: new Date(), voteBlocked: false } },
  );
}

export async function rejectRequest(requestId, actor) {
  const request = await ClassJoinRequest.findById(requestId);
  if (!request) throw fail('request_not_found');
  if (request.status !== 'pending') throw fail('request_closed');
  request.status = 'rejected';
  request.resolvedBy = actor?.specId || '';
  request.resolvedAt = new Date();
  await request.save();
  // Отклонённый снова гость: он может подать заявку позже, когда одноклассники передумают.
  await User.updateOne(
    { specId: request.applicantSpecId, classStatus: 'pending' },
    { $set: { classStatus: 'guest' } },
  );
  return request;
}

// ---------- Управление составом ----------

export async function kickMember(specId, { keepClassStatus = true } = {}) {
  const user = await User.findOne({ specId: String(specId) });
  if (!user) throw fail('user_not_found');
  if (user.classStatus !== 'member') throw fail('not_member');
  const otherMembers = await User.countDocuments({
    _id: { $ne: user._id },
    status: 'active',
    classStatus: 'member',
    school: exactRegex(user.school),
    class: exactRegex(user.class),
  });
  // Из класса нельзя выкинуть последнего участника: иначе класс останется без управления.
  if (otherMembers === 0) throw fail('last_member');
  await User.updateOne(
    { _id: user._id },
    { $set: { classStatus: keepClassStatus ? 'kicked' : 'guest', voteBlocked: true }, $unset: { classJoinedAt: '' } },
  );
  // Заявки исключённого закрываем: право голоса и право просить его больше не касаются.
  await ClassJoinRequest.updateMany(
    { applicantSpecId: user.specId, status: 'pending' },
    { $set: { status: 'rejected', resolvedAt: new Date() } },
  );
  return user;
}

export async function setVoteBlocked(specId, blocked) {
  const user = await User.findOneAndUpdate(
    { specId: String(specId) },
    { $set: { voteBlocked: Boolean(blocked) } },
    { new: true },
  );
  if (!user) throw fail('user_not_found');
  return user;
}

// Снять исключение: человек снова может подать заявку (но участником не становится сам).
export async function unkickMember(specId) {
  const user = await User.findOneAndUpdate(
    { specId: String(specId), classStatus: 'kicked' },
    { $set: { classStatus: 'guest', voteBlocked: false }, $unset: { classJoinedAt: '' } },
    { new: true },
  );
  if (!user) throw fail('not_kicked');
  return user;
}

// Отмена своей заявки.
export async function cancelOwnRequest(classKey, specId) {
  const res = await ClassJoinRequest.findOneAndUpdate(
    { classKey: String(classKey), applicantSpecId: String(specId), status: 'pending' },
    { $set: { status: 'expired', resolvedAt: new Date() } },
    { new: true },
  );
  await User.updateOne({ specId: String(specId), classStatus: 'pending' }, { $set: { classStatus: 'guest' } });
  return res;
}

// Приведение статуса пользователя в соответствие с классом после смены класса:
// переезд в другой класс лишает прав в прежнем.
export async function detachFromClass(specId) {
  return User.updateOne(
    { specId: String(specId) },
    { $set: { classStatus: 'guest', voteBlocked: false }, $unset: { classJoinedAt: '' } },
  );
}
