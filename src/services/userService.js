import crypto from 'node:crypto';
import { User } from '../db/models/User.js';
import { Token } from '../db/models/Token.js';
import { Session } from '../db/models/Session.js';

function moderatorIds() {
  return String(process.env.MODERATOR_IDS || '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

// Создатель — это либо роль в базе, либо tgId из MODERATOR_IDS.
async function ensureCreator(user) {
  if (!user?.tgId) return user;
  if (moderatorIds().includes(Number(user.tgId)) && user.role !== 'creator') {
    user.role = 'creator';
    await user.save();
  }
  return user;
}

export async function getUserByTgId(tgId) {
  // Черновики (status: unregistered) не считаются существующими пользователями:
  // их ищем отдельно через getDraftByTgId
  return ensureCreator(await User.findOne({ tgId: Number(tgId), status: { $ne: 'unregistered' } }));
}

export async function getUserBySpecId(specId) {
  return ensureCreator(await User.findOne({ specId, status: { $ne: 'unregistered' } }));
}

export async function createUser(data) {
  if (data.tgId && moderatorIds().includes(Number(data.tgId))) data.role = 'creator';
  // specId генерируется схемой по умолчанию — раньше его забывали передавать,
  // и регистрация падала с «User validation failed: specId: Path `specId` is required.»
  if (!data.specId) data.specId = crypto.randomUUID();
  const user = new User(data);
  await user.save();
  return user;
}

// === Промежуточная роль «незарегистрированный» (status: unregistered) ===
// Черновик аккаунта: пользователь начал регистрацию, но ещё не подтвердил данные.
// В этом статусе храним то, как изменялся аккаунт (regHistory) и текущие введённые
// данные (draft). Подтверждение регистрации переводит черновик в status: active.

const REG_HISTORY_LIMIT = 50;

export async function getDraftByTgId(tgId) {
  return User.findOne({ tgId: Number(tgId), status: 'unregistered' });
}

export async function createDraft(data) {
  const draftData = {
    ...data,
    status: 'unregistered',
    role: 'user',
    draft: data.draft || {},
    regHistory: [{ at: new Date(), action: 'created', step: data.step || 'start', data: data.draft || {} }],
  };
  delete draftData.step;
  return createUser(draftData);
}

// Сохраняет очередной шаг регистрации в черновик и пишет запись в историю изменений
export async function saveDraftStep(tgId, step, data = {}) {
  let draft = await getDraftByTgId(tgId);
  if (!draft) draft = await createDraft({ tgId, step, data });

  draft.draft = { ...(draft.draft || {}), ...data };
  draft.regHistory = [
    ...(draft.regHistory || []),
    { at: new Date(), action: 'step', step, data },
  ].slice(-REG_HISTORY_LIMIT);
  draft.markModified('draft');
  draft.markModified('regHistory');
  await draft.save();
  return draft;
}

export async function discardDraft(tgId, reason = 'cancelled') {
  const draft = await getDraftByTgId(tgId);
  if (!draft) return false;
  await draft.deleteOne();
  if (reason !== 'cancelled') {
    await Session.deleteMany({ userId: String(tgId), platform: 'telegram' }).catch(() => {});
  }
  return true;
}

// Черновик -> полноценный аккаунт. Данные шагов из history подтягиваются, если их не передали.
export async function activateDraft(tgId, updates = {}) {
  const draft = await getDraftByTgId(tgId);
  if (!draft) return null;

  const merged = { ...(draft.draft || {}), ...updates };
  draft.status = 'active';
  draft.city = merged.city ?? draft.city;
  draft.school = merged.school ?? draft.school;
  draft.class = merged.className ?? merged.class ?? draft.class;
  if (merged.firstName) draft.firstName = merged.firstName;
  if (merged.username) draft.username = merged.username;
  if (!draft.platforms.includes('telegram')) draft.platforms.push('telegram');

  draft.regHistory = [
    ...(draft.regHistory || []),
    { at: new Date(), action: 'activated', step: 'confirm', data: merged },
  ].slice(-REG_HISTORY_LIMIT);
  draft.markModified('regHistory');
  await draft.save();
  return draft;
}

export async function updateByTgId(tgId, updates) {
  return User.findOneAndUpdate({ tgId: Number(tgId) }, updates, { new: true });
}

export async function updateBySpecId(specId, updates) {
  return User.findOneAndUpdate({ specId }, updates, { new: true });
}

export async function unlinkTelegram(tgId) {
  await User.updateOne(
    { tgId: Number(tgId) },
    { $unset: { tgId: 1 }, $pull: { platforms: 'telegram' } }
  );
}

export async function linkTelegram(specId, tgId) {
  const busy = await User.findOne({ tgId: Number(tgId), status: { $ne: 'unregistered' } });
  if (busy && busy.specId !== specId) return null;

  const user = await User.findOne({ specId });
  if (!user) return null;

  user.tgId = Number(tgId);
  if (!user.platforms.includes('telegram')) user.platforms.push('telegram');
  await user.save();
  return user;
}

// Чистая логика варнов: три предупреждения снимают роль и закрывают путь в админы
export function applyWarn(user) {
  user.warns = Math.min((user.warns || 0) + 1, 3);
  const banned = user.warns >= 3;
  if (banned) {
    user.role = 'user';
    user.adminBanned = true;
  }
  return { user, banned };
}

export async function giveWarn(tgId) {
  const user = await getUserByTgId(tgId);
  if (!user) return null;
  applyWarn(user);
  await user.save();
  return user;
}

export async function warnUser(specId) {
  const user = await User.findOne({ specId });
  if (!user) return null;
  applyWarn(user);
  await user.save();
  return user;
}

export async function setRole(specId, role) {
  const update = role === 'admin' ? { role, adminBanned: false } : { role };
  return User.findOneAndUpdate({ specId }, update, { new: true });
}

export async function demoteUser(tgId) {
  const user = await getUserByTgId(tgId);
  if (!user) return null;
  user.role = 'user';
  await user.save();
  return user;
}

export async function promoteUser(tgId) {
  const user = await getUserByTgId(tgId);
  if (!user) return null;
  user.role = 'admin';
  user.adminBanned = false;
  await user.save();
  return user;
}

export function isProtectedCreator(user) {
  return user?.role === 'creator' || (user?.tgId && moderatorIds().includes(Number(user.tgId)));
}

// Создатель может модерировать всех, кроме других создателей и себя
export function canModerate(actor, target) {
  if (!actor || !target) return false;
  if (actor.specId === target.specId) return false;
  return !isProtectedCreator(target);
}

export async function banUser(specId, { reason = '', by = '' } = {}) {
  const user = await User.findOne({ specId });
  if (!user) return null;
  user.banned = true;
  user.banReason = String(reason || '').slice(0, 300) || undefined;
  user.bannedAt = new Date();
  user.bannedBy = by || undefined;
  if (user.role === 'admin') user.role = 'user';
  await user.save();
  // Токены не удаляем: requireAuth и так закрывает всё, кроме поддержки (для обжалования)
  return user;
}

export async function unbanUser(specId) {
  return User.findOneAndUpdate(
    { specId },
    { $set: { banned: false }, $unset: { banReason: 1, bannedAt: 1, bannedBy: 1 } },
    { new: true }
  );
}

export async function resetWarns(specId) {
  return User.findOneAndUpdate({ specId }, { warns: 0, adminBanned: false }, { new: true });
}

export async function getUserByPhone(phone) {
  if (!phone) return null;
  return ensureCreator(await User.findOne({ phone }));
}

export async function getUserByGoogleId(googleId) {
  if (!googleId) return null;
  return ensureCreator(await User.findOne({ googleId: String(googleId) }));
}

export async function setPhone(specId, phone) {
  const busy = await User.findOne({ phone });
  if (busy && busy.specId !== specId) return null;
  return User.findOneAndUpdate({ specId }, { phone }, { new: true });
}

export function classFilter(classKey) {
  const value = String(classKey || '');
  const index = value.indexOf('::');
  if (index === -1) return { class: value };
  return { school: value.slice(0, index), class: value.slice(index + 2) };
}

export async function getClassUsers(classKey) {
  return User.find({ ...classFilter(classKey), status: 'active' }).sort({ role: 1, firstName: 1 });
}

export async function getClassAdmins(classKey) {
  return User.find({ ...classFilter(classKey), role: 'admin', status: 'active' });
}

export async function getCreators() {
  return User.find({ role: 'creator' });
}

export async function deleteAccount(specId) {
  const user = await getUserBySpecId(specId);
  if (!user) return false;
  await Token.deleteMany({ userId: specId });
  if (user.tgId) await Session.deleteMany({ userId: String(user.tgId) });
  await user.deleteOne();
  return true;
}

export async function searchUsers(query, limit = 50) {
  const value = String(query || '').trim();
  if (!value) return User.find().sort({ registeredAt: -1 }).limit(limit);

  const regex = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return User.find({
    $or: [
      { specId: regex },
      { username: regex },
      { phone: regex },
      { email: regex },
      { firstName: regex },
      { school: regex },
      { class: regex },
    ],
  })
    .sort({ registeredAt: -1 })
    .limit(limit);
}

export function publicUser(user) {
  return {
    specId: user.specId,
    tgId: user.tgId || null,
    username: user.username || null,
    firstName: user.firstName || null,
    city: user.city || null,
    school: user.school || null,
    class: user.class || null,
    role: user.role,
    warns: user.warns || 0,
    adminBanned: Boolean(user.adminBanned),
    banned: Boolean(user.banned),
    banReason: user.banReason || null,
    phone: user.phone || null,
    email: user.email || null,
    hasGoogle: Boolean(user.googleId),
    platforms: user.platforms || [],
    status: user.status,
    registeredAt: user.registeredAt,
    stats: user.stats,
  };
}
