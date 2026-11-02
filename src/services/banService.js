import { config } from '../config.js';
import { Ban } from '../db/models/Ban.js';
import { User } from '../db/models/User.js';
import { escapeRegex } from '../utils/normalize.js';

const USERNAME_RE = /^[a-z0-9_]{4,32}$/i;
const ACCOUNTS_LIMIT = 50;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// Цель бана из ввода модератора: число — Telegram ID, иначе юзернейм (с @ или без).
export function parseBanTarget(input) {
  const value = String(input ?? '').trim();
  if (/^\d{3,15}$/.test(value)) return { tgId: Number(value) };
  const username = value.replace(/^@/, '');
  if (USERNAME_RE.test(username)) return { username: username.toLowerCase() };
  return null;
}

// Цель бана для конкретного аккаунта: Telegram ID (текущий или постоянный), а если его нет — юзернейм.
export function banTargetForUser(user) {
  if (!user) return null;
  const tgId = user.tgId || user.ownerTgId;
  if (tgId) return { tgId: Number(tgId) };
  if (user.username) return parseBanTarget(user.username);
  return null;
}

function usernameRegex(username) {
  return new RegExp(`^${escapeRegex(username)}$`, 'i');
}

function accountsFilter(target) {
  if (target.tgId) return { $or: [{ tgId: target.tgId }, { ownerTgId: target.tgId }] };
  return { username: usernameRegex(target.username) };
}

function banFilter(target) {
  return target.tgId ? { tgId: target.tgId } : { username: target.username };
}

export function describeBanTarget(target) {
  if (!target) return '';
  return target.tgId ? `Telegram ID ${target.tgId}` : `@${target.username}`;
}

export async function findAccountsForBanTarget(target) {
  if (!target) return [];
  return User.find({ ...accountsFilter(target), status: { $ne: 'unregistered' } }).limit(ACCOUNTS_LIMIT);
}

// Модератор не банит модераторов и создателей, создатель — других создателей; себя банить нельзя.
// Проверяются и ID из MODERATOR_IDS/CREATOR_IDS, и роли всех найденных аккаунтов человека.
export function canBanTarget(actor, target, accounts = []) {
  if (!actor || !target) return false;
  if (!['creator', 'moderator'].includes(actor.role)) return false;
  const actorTgIds = [actor.tgId, actor.ownerTgId].filter(Boolean).map(Number);
  if (target.tgId && actorTgIds.includes(target.tgId)) return false;
  if (target.username && actor.username && actor.username.toLowerCase() === target.username) return false;
  if (target.tgId && config.creatorIds.includes(target.tgId)) return false;
  if (target.tgId && config.moderatorIds.includes(target.tgId) && actor.role !== 'creator') return false;
  return accounts.every((account) => {
    if (account.specId === actor.specId) return false;
    if (account.role === 'creator') return false;
    if (account.role === 'moderator' && actor.role !== 'creator') return false;
    return true;
  });
}

export async function getActiveBan({ tgId, username } = {}) {
  const or = [];
  if (tgId) or.push({ tgId: Number(tgId) });
  const name = String(username ?? '').replace(/^@/, '').toLowerCase();
  if (name) or.push({ username: name });
  if (or.length === 0) return null;
  return Ban.findOne({ $or: or });
}

export async function getActiveBanForUser(user) {
  if (!user) return null;
  return getActiveBan({ tgId: user.tgId || user.ownerTgId, username: user.username });
}

export async function banPerson(target, reason = '', bySpecId = '') {
  if (!target || (!target.tgId && !target.username)) throw fail('invalid_ban_target');
  const cleanReason = String(reason || '').slice(0, 300);
  await Ban.findOneAndUpdate(
    banFilter(target),
    { $set: { ...banFilter(target), reason: cleanReason, bannedBy: bySpecId || '' } },
    { upsert: true, new: true },
  );
  const res = await User.updateMany(accountsFilter(target), {
    $set: { banned: true, banReason: cleanReason, bannedBy: bySpecId || '', bannedAt: new Date() },
  });
  return { accountsBanned: res.modifiedCount };
}

export async function unbanPerson(target) {
  if (!target || (!target.tgId && !target.username)) throw fail('invalid_ban_target');
  const removed = await Ban.deleteMany(banFilter(target));
  const res = await User.updateMany(accountsFilter(target), {
    $set: { banned: false, banReason: '', bannedBy: '' },
    $unset: { bannedAt: '' },
  });
  return { bansRemoved: removed.deletedCount, accountsUnbanned: res.modifiedCount };
}
