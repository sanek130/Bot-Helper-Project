import crypto from 'node:crypto';
import { User } from '../db/models/User.js';
import { LoginRequest } from '../db/models/LoginRequest.js';
import { Session } from '../db/models/Session.js';

export const CODE_TTL_MS = 5 * 60 * 1000;
export const LINK_TTL_MS = 30 * 60 * 1000;
export const BOT_REQUEST_TTL_MS = 5 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export function hashCode(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function generateLinkToken() {
  return crypto.randomBytes(32).toString('base64url').slice(0, 43);
}

export function isExpired(request, now = new Date()) {
  return !request?.expiresAt || new Date(request.expiresAt).getTime() <= now.getTime();
}

// Чистая проверка кода: срок 5 минут, не больше 5 попыток
export function checkCode(request, code, now = new Date()) {
  if (!request) return { ok: false, error: 'not_found' };
  if (request.status !== 'pending') return { ok: false, error: 'used' };
  if (isExpired(request, now)) return { ok: false, error: 'expired' };
  if ((request.attempts || 0) >= MAX_ATTEMPTS) return { ok: false, error: 'too_many_attempts' };
  if (request.codeHash !== hashCode(code)) return { ok: false, error: 'invalid' };
  return { ok: true };
}

export async function createCodeLoginRequest(specId) {
  const user = await User.findOne({ specId });
  if (!user) return { ok: false, error: 'not_found' };
  if (user.status === 'pending') return { ok: false, error: 'pending' };
  if (!user.tgId) return { ok: false, error: 'no_telegram' };

  // Не больше 5 попыток за 15 минут на аккаунт
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  const recent = await LoginRequest.find({ userId: specId, kind: 'site-code', createdAt: { $gt: since } });
  const spent = recent.reduce((sum, request) => sum + (request.attempts || 0), 0);
  if (spent >= MAX_ATTEMPTS) return { ok: false, error: 'too_many_attempts' };

  await LoginRequest.updateMany(
    { userId: specId, kind: 'site-code', status: 'pending' },
    { status: 'expired' }
  );

  const code = generateCode();
  const request = await LoginRequest.create({
    userId: specId,
    kind: 'site-code',
    codeHash: hashCode(code),
    status: 'pending',
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  return { ok: true, code, requestId: String(request._id), user };
}

export async function verifyCodeLogin(specId, code) {
  const request = await LoginRequest.findOne({
    userId: specId,
    kind: 'site-code',
    status: 'pending',
  }).sort({ createdAt: -1 });

  const result = checkCode(request, code);
  if (!result.ok) {
    if (request && ['invalid', 'expired'].includes(result.error)) {
      request.attempts = (request.attempts || 0) + 1;
      if (result.error === 'expired') request.status = 'expired';
      await request.save();
    }
    return result;
  }

  request.status = 'approved';
  await request.save();

  const user = await User.findOne({ specId });
  if (!user) return { ok: false, error: 'not_found' };
  return { ok: true, user };
}

export async function createBotLoginRequest(specId, newTgId) {
  const user = await User.findOne({ specId });
  if (!user) return { ok: false, error: 'not_found' };
  if (user.status === 'pending') return { ok: false, error: 'pending' };
  if (!user.tgId) return { ok: false, error: 'no_telegram' };
  if (user.tgId === Number(newTgId)) return { ok: false, error: 'same_telegram' };

  const busy = await User.findOne({ tgId: Number(newTgId) });
  if (busy) return { ok: false, error: 'telegram_busy' };

  await LoginRequest.updateMany(
    { userId: specId, kind: 'bot', status: 'pending' },
    { status: 'expired' }
  );

  const request = await LoginRequest.create({
    userId: specId,
    kind: 'bot',
    newTgId: Number(newTgId),
    status: 'pending',
    expiresAt: new Date(Date.now() + BOT_REQUEST_TTL_MS),
  });

  return { ok: true, request, owner: user };
}

export async function approveBotLogin(requestId, approvedByTgId) {
  const request = await LoginRequest.findById(requestId);
  if (!request || request.kind !== 'bot' || request.status !== 'pending') {
    return { ok: false, error: 'not_found' };
  }
  if (isExpired(request)) {
    request.status = 'expired';
    await request.save();
    return { ok: false, error: 'expired' };
  }

  const user = await User.findOne({ specId: request.userId });
  if (!user) return { ok: false, error: 'not_found' };
  if (user.tgId !== Number(approvedByTgId)) return { ok: false, error: 'not_owner' };

  const previousTgId = user.tgId;
  user.tgId = request.newTgId;
  if (!user.platforms.includes('telegram')) user.platforms.push('telegram');
  await user.save();

  request.status = 'approved';
  await request.save();
  await Session.deleteMany({ userId: String(previousTgId), platform: 'telegram' });

  return { ok: true, user };
}

export async function rejectBotLogin(requestId, approvedByTgId) {
  const request = await LoginRequest.findById(requestId);
  if (!request || request.kind !== 'bot' || request.status !== 'pending') {
    return { ok: false, error: 'not_found' };
  }

  const user = await User.findOne({ specId: request.userId });
  if (!user || user.tgId !== Number(approvedByTgId)) return { ok: false, error: 'not_owner' };

  request.status = 'rejected';
  await request.save();
  return { ok: true };
}

export async function createLinkLoginRequest(specId) {
  const user = await User.findOne({ specId });
  if (!user) return { ok: false, error: 'not_found' };

  await LoginRequest.updateMany(
    { userId: specId, kind: 'link', status: 'pending' },
    { status: 'expired' }
  );

  const token = generateLinkToken();
  await LoginRequest.create({
    userId: specId,
    kind: 'link',
    codeHash: hashCode(token),
    status: 'pending',
    expiresAt: new Date(Date.now() + LINK_TTL_MS),
  });

  return { ok: true, token };
}

export async function activateLink(token, tgId, profile = {}) {
  const request = await LoginRequest.findOne({
    kind: 'link',
    codeHash: hashCode(token),
    status: 'pending',
  });

  if (!request) return { ok: false, error: 'not_found' };
  if (isExpired(request)) {
    request.status = 'expired';
    await request.save();
    return { ok: false, error: 'expired' };
  }

  const user = await User.findOne({ specId: request.userId });
  if (!user) return { ok: false, error: 'not_found' };

  const busy = await User.findOne({ tgId: Number(tgId) });
  if (busy && busy.specId !== user.specId) return { ok: false, error: 'telegram_busy' };

  user.tgId = Number(tgId);
  user.status = 'active';
  user.pendingExpiresAt = undefined;
  if (profile.first_name && !user.firstName) user.firstName = profile.first_name;
  if (profile.username && !user.username) user.username = profile.username;
  if (!user.platforms.includes('telegram')) user.platforms.push('telegram');
  await user.save();

  request.status = 'approved';
  await request.save();

  return { ok: true, user };
}

export async function findPendingLink(specId) {
  const request = await LoginRequest.findOne({
    userId: specId,
    kind: 'link',
    status: 'pending',
  }).sort({ createdAt: -1 });

  return request && !isExpired(request) ? request : null;
}
