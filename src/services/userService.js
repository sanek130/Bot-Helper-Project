import { config } from '../config.js';
import { User, ROLES } from '../db/models/User.js';
import { Token } from '../db/models/Token.js';
import { Session } from '../db/models/Session.js';
import { LoginRequest } from '../db/models/LoginRequest.js';
import { escapeRegex } from '../utils/normalize.js';

export const SPEC_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REG_HISTORY_LIMIT = 50;
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export function isSpecId(value) {
  return typeof value === 'string' && SPEC_ID_RE.test(value);
}

// Функции модерации принимают и tgId (число), и specId (строка UUID):
// у пользователей, зарегистрированных только на сайте, tgId может отсутствовать.
function byKey(key) {
  if (typeof key === 'string' && isSpecId(key)) return { specId: key.toLowerCase() };
  const tgId = Number(key);
  if (!Number.isFinite(tgId) || tgId <= 0) {
    const error = new Error('invalid_user_key');
    error.code = 'invalid_user_key';
    throw error;
  }
  return { tgId };
}

function exactRegex(value) {
  return new RegExp(`^${escapeRegex(String(value ?? '').trim())}$`, 'i');
}

function privilegedRoleFor(tgId) {
  const id = Number(tgId);
  if (config.creatorIds.includes(id)) return 'creator';
  if (config.moderatorIds.includes(id)) return 'moderator';
  return null;
}

// Спецификация требует выдавать повышенную роль по MODERATOR_IDS/CREATOR_IDS при каждом чтении.
// CREATOR_IDS получают role='creator', MODERATOR_IDS — role='moderator' (иерархия Модулей 4–7).
export async function ensureCreator(tgId) {
  const role = privilegedRoleFor(tgId);
  if (!role) return null;
  const user = await User.findOne({ tgId: Number(tgId) });
  if (!user) return null;
  if (user.status === 'active' && user.role !== role && !(role === 'moderator' && user.role === 'creator')) {
    user.role = role;
    user.adminBanned = false;
    await user.save();
  }
  return user;
}

export async function getUserByTgId(tgId) {
  if (!tgId) return null;
  if (privilegedRoleFor(tgId)) {
    const user = await ensureCreator(tgId);
    if (!user || user.status === 'unregistered') return null;
    return user;
  }
  return User.findOne({ tgId: Number(tgId), status: { $ne: 'unregistered' } });
}

// Любой документ по tgId, включая черновик регистрации (status='unregistered').
export async function getRawUserByTgId(tgId) {
  if (!tgId) return null;
  return User.findOne({ tgId: Number(tgId) });
}

export async function getUserBySpecId(specId) {
  if (!isSpecId(specId)) return null;
  const user = await User.findOne({ specId: specId.toLowerCase() });
  if (user?.tgId && privilegedRoleFor(user.tgId)) return (await ensureCreator(user.tgId)) || user;
  return user;
}

export async function createDraftUser(tgId, firstName = '', username = '') {
  const existing = await User.findOne({ tgId: Number(tgId) });
  if (existing) {
    if (existing.status === 'unregistered') {
      existing.firstName = firstName || existing.firstName;
      existing.username = username || existing.username;
      await existing.save();
    }
    return existing;
  }
  try {
    return await User.create({
      tgId: Number(tgId),
      firstName: firstName || '',
      username: username || '',
      status: 'unregistered',
      draft: {},
      platforms: ['telegram'],
    });
  } catch (err) {
    // Гонка двух параллельных /start: второй запрос получает уже созданный документ.
    if (err?.code === 11000) return User.findOne({ tgId: Number(tgId) });
    throw err;
  }
}

function trimHistory(history) {
  return history.length > REG_HISTORY_LIMIT ? history.slice(history.length - REG_HISTORY_LIMIT) : history;
}

export async function saveDraftStep(tgId, step, data = {}) {
  const user = await User.findOne({ tgId: Number(tgId) });
  if (!user) return null;
  user.draft = { ...(user.draft || {}), ...data, step };
  user.regHistory = trimHistory([...(user.regHistory || []), { at: new Date(), action: 'step', step, data }]);
  user.markModified('draft');
  await user.save();
  return user;
}

export async function setDraft(tgId, draft) {
  const user = await User.findOne({ tgId: Number(tgId) });
  if (!user) return null;
  user.draft = draft;
  user.markModified('draft');
  await user.save();
  return user;
}

export async function discardDraft(tgId) {
  return User.findOneAndUpdate({ tgId: Number(tgId) }, { $set: { draft: {}, regHistory: [] } }, { new: true });
}

export async function activateDraft(tgId) {
  const user = await User.findOne({ tgId: Number(tgId) });
  if (!user) {
    const error = new Error('user_not_found');
    error.code = 'user_not_found';
    throw error;
  }
  const { city, school, class: className, role } = user.draft || {};
  if (!city || !school || !className || !role) {
    const error = new Error('draft_incomplete');
    error.code = 'draft_incomplete';
    throw error;
  }
  if (!['user', 'admin'].includes(role)) {
    const error = new Error('invalid_role');
    error.code = 'invalid_role';
    throw error;
  }
  user.status = 'active';
  user.city = city;
  user.school = school;
  user.class = className;
  user.role = role === 'admin' && user.adminBanned ? 'user' : role;
  user.draft = {};
  user.regHistory = [{ at: new Date(), action: 'activated', data: { city, school, class: className, role } }];
  user.registeredAt = new Date();
  user.pendingExpiresAt = undefined;
  if (!user.platforms.includes('telegram')) user.platforms.push('telegram');
  user.markModified('draft');
  await user.save();
  return (await ensureCreator(tgId)) || user;
}

export async function updateUserClass(tgId, newClass) {
  const user = await User.findOne({ tgId: Number(tgId), status: 'active' });
  if (!user) return null;
  const oldClass = user.class;
  if (oldClass === newClass) return user;
  // Ленивый импорт защищает от циклической зависимости userService ↔ homeworkService.
  const { getClassKey, renameClassKey } = await import('./homeworkService.js');
  const others = await User.countDocuments({
    _id: { $ne: user._id },
    status: 'active',
    school: exactRegex(user.school),
    class: exactRegex(oldClass),
  });
  user.class = newClass;
  user.completedHomework = {};
  user.markModified('completedHomework');
  await user.save();
  // ДЗ переносится за пользователем, только если в старом классе больше никого нет:
  // иначе ученики старого класса потеряли бы свои задания.
  if (others === 0) {
    await renameClassKey(getClassKey(user.school, oldClass), getClassKey(user.school, newClass));
  }
  return user;
}

export async function applyWarn(key) {
  const filter = byKey(key);
  const user = await User.findOneAndUpdate(
    filter,
    [{ $set: { warns: { $min: [3, { $add: [{ $ifNull: ['$warns', 0] }, 1] }] } } }],
    { new: true },
  );
  if (!user) return null;
  if (user.warns >= 3 && (!user.adminBanned || user.role !== 'user')) {
    user.adminBanned = true;
    if (['admin', 'support'].includes(user.role)) user.role = 'user';
    await user.save();
  }
  return user;
}

export async function resetWarns(key) {
  return User.findOneAndUpdate(byKey(key), { $set: { warns: 0 } }, { new: true });
}

export async function liftAdminBan(key) {
  return User.findOneAndUpdate(byKey(key), { $set: { adminBanned: false } }, { new: true });
}

export async function setRole(key, newRole) {
  if (!ROLES.includes(newRole)) {
    const error = new Error('invalid_role');
    error.code = 'invalid_role';
    throw error;
  }
  const update = { role: newRole };
  if (newRole === 'admin') update.pendingAdminRequest = false;
  return User.findOneAndUpdate(byKey(key), { $set: update }, { new: true });
}

export async function demoteToUser(key) {
  return User.findOneAndUpdate(byKey(key), { $set: { role: 'user' } }, { new: true });
}

export async function ban(key, reason = '', bySpecId = '') {
  return User.findOneAndUpdate(
    byKey(key),
    { $set: { banned: true, banReason: String(reason || '').slice(0, 300), bannedBy: bySpecId || '', bannedAt: new Date() } },
    { new: true },
  );
}

export async function unban(key) {
  return User.findOneAndUpdate(
    byKey(key),
    { $set: { banned: false, banReason: '', bannedBy: '' }, $unset: { bannedAt: '' } },
    { new: true },
  );
}

export async function unlinkTelegram(tgId) {
  const user = await User.findOneAndUpdate(
    { tgId: Number(tgId) },
    { $unset: { tgId: '' }, $pull: { platforms: 'telegram' } },
    { new: true },
  );
  await Session.deleteMany({ userId: String(tgId) });
  return user;
}

// Привязка Telegram к существующему аккаунту. Черновик регистрации с этим tgId удаляется,
// чтобы не нарушить уникальный индекс tgId.
export async function linkTelegram(specId, tgId, profile = {}) {
  const numericId = Number(tgId);
  const owner = await User.findOne({ tgId: numericId });
  if (owner && owner.specId !== specId) {
    if (owner.status === 'unregistered') {
      await User.deleteOne({ _id: owner._id });
    } else {
      const error = new Error('tg_already_linked');
      error.code = 'tg_already_linked';
      throw error;
    }
  }
  const update = { $set: { tgId: numericId }, $addToSet: { platforms: 'telegram' } };
  if (profile.firstName) update.$set.firstName = profile.firstName;
  if (profile.username) update.$set.username = profile.username;
  return User.findOneAndUpdate({ specId }, update, { new: true });
}

export async function deleteAccount(specId) {
  const user = await User.findOne({ specId });
  if (!user) return { deletedCount: 0 };
  const results = await Promise.all([
    Token.deleteMany({ userId: specId }),
    LoginRequest.deleteMany({ userId: specId }),
    user.tgId ? Session.deleteMany({ userId: String(user.tgId) }) : Promise.resolve({ deletedCount: 0 }),
    User.deleteOne({ _id: user._id }),
  ]);
  return { deletedCount: results.reduce((sum, r) => sum + (r.deletedCount || 0), 0) };
}

export async function getClassUsers(school, className) {
  return User.find({ status: 'active', school: exactRegex(school), class: exactRegex(className) });
}

export async function getClassAdmins(school, className) {
  return User.find({ status: 'active', role: 'admin', school: exactRegex(school), class: exactRegex(className) });
}

export async function getRegisteredSchoolsInCity(city) {
  if (!city) return [];
  const list = await User.distinct('school', { city: exactRegex(city), status: 'active' });
  return list.filter(Boolean);
}

export async function searchUsers(query = '', limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const q = String(query ?? '').trim();
  const filter = { status: { $ne: 'unregistered' } };
  if (q) {
    if (isSpecId(q)) {
      filter.specId = q.toLowerCase();
    } else {
      const re = new RegExp(escapeRegex(q.replace(/^@/, '')), 'i');
      const or = [{ firstName: re }, { lastName: re }, { username: re }, { school: re }, { class: re }, { city: re }];
      if (/^\d+$/.test(q)) or.push({ tgId: Number(q) });
      filter.$or = or;
    }
  }
  return User.find(filter).sort({ createdAt: -1 }).limit(safeLimit);
}

export async function countUsersOverview() {
  const [totalUsers, totalAdmins, totalBanned] = await Promise.all([
    User.countDocuments({ status: 'active' }),
    User.countDocuments({ status: 'active', role: 'admin' }),
    User.countDocuments({ banned: true }),
  ]);
  return { totalUsers, totalAdmins, totalBanned };
}

export async function createPendingWebUser({ firstName = '', city, school, className, role }) {
  return User.create({
    firstName,
    city,
    school,
    class: className,
    role: role === 'admin' ? 'admin' : 'user',
    status: 'pending',
    platforms: ['web'],
    pendingExpiresAt: new Date(Date.now() + PENDING_TTL_MS),
  });
}

export async function setCustomKeyboard(tgId, items) {
  const list = [...new Set((items || []).filter((item) => typeof item === 'string' && item !== 'Меню'))];
  return User.findOneAndUpdate({ tgId: Number(tgId) }, { $set: { customKeyboard: [...list, 'Меню'] } }, { new: true });
}

export async function setWorkClassKey(tgId, classKey) {
  return User.findOneAndUpdate({ tgId: Number(tgId) }, { $set: { workClassKey: classKey || '' } }, { new: true });
}

export function publicUser(user) {
  if (!user) return null;
  const stats = user.stats || {};
  return {
    specId: user.specId,
    tgId: user.tgId ?? null,
    firstName: user.firstName || '',
    username: user.username || '',
    city: user.city || '',
    school: user.school || '',
    class: user.class || '',
    role: user.role,
    status: user.status,
    warns: user.warns || 0,
    adminBanned: Boolean(user.adminBanned),
    banned: Boolean(user.banned),
    stats: {
      homeworkViews: stats.homeworkViews || 0,
      homeworkAdded: stats.homeworkAdded || 0,
      lastActive: stats.lastActive || null,
    },
    registeredAt: user.registeredAt || user.createdAt || null,
  };
}
