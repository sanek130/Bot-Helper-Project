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
  return ensureCreator(await User.findOne({ tgId: Number(tgId) }));
}

export async function getUserBySpecId(specId) {
  return ensureCreator(await User.findOne({ specId }));
}

export async function createUser(data) {
  if (data.tgId && moderatorIds().includes(Number(data.tgId))) data.role = 'creator';
  const user = new User(data);
  await user.save();
  return user;
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
  const busy = await User.findOne({ tgId: Number(tgId) });
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
