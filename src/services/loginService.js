import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { LoginRequest } from '../db/models/LoginRequest.js';
import { Session } from '../db/models/Session.js';
import { User } from '../db/models/User.js';
import { SPEC_ID_RE, linkTelegram } from './userService.js';

export { SPEC_ID_RE };

const FIVE_MINUTES = 5 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export async function createBotLoginRequest(specId, newTgId) {
  // Для kind='bot' код не нужен: подтверждение идёт кнопкой у владельца аккаунта.
  // В codeHash кладётся хэш случайной строки, чтобы поле оставалось обязательным и неугадываемым.
  return LoginRequest.create({
    userId: specId,
    kind: 'bot',
    codeHash: sha256(crypto.randomBytes(16).toString('hex')),
    newTgId: Number(newTgId),
    status: 'pending',
    attempts: 0,
    expiresAt: new Date(Date.now() + FIVE_MINUTES),
  });
}

export async function getLoginRequest(requestId) {
  if (!mongoose.isValidObjectId(requestId)) return null;
  const request = await LoginRequest.findById(requestId);
  if (!request) return null;
  if (request.expiresAt.getTime() < Date.now()) {
    if (request.status === 'pending') {
      request.status = 'expired';
      await request.save();
    }
    return null;
  }
  return request;
}

export async function approveLoginRequest(requestId, confirmTgId) {
  const request = await getLoginRequest(requestId);
  if (!request || request.status !== 'pending') throw fail('expired');
  const owner = await User.findOne({ specId: request.userId });
  if (!owner) throw fail('user_not_found');
  if (Number(owner.tgId) !== Number(confirmTgId)) throw fail('not_owner');
  const oldTgId = owner.tgId;
  // Текущий аккаунт того, кто входит, не мешает входу: он отвязывается и остаётся в его «Моих аккаунтах».
  const updated = await linkTelegram(owner.specId, request.newTgId, {}, { replaceActive: true });
  await Session.deleteMany({ userId: String(request.newTgId) });
  // Старое устройство разлогинивается: его незавершённые шаги больше не действуют.
  await Session.deleteMany({ userId: String(oldTgId) });
  request.status = 'approved';
  await request.save();
  return updated;
}

export async function rejectLoginRequest(requestId) {
  if (!mongoose.isValidObjectId(requestId)) return null;
  return LoginRequest.findByIdAndUpdate(requestId, { $set: { status: 'rejected' } }, { new: true });
}

const CODE_COOLDOWN_MS = 60 * 1000;

async function createCodeRequest(key, kind) {
  const code = crypto.randomInt(100000, 1000000).toString();
  // Предыдущие неиспользованные коды гасятся, чтобы действовал только последний.
  await LoginRequest.updateMany(
    { userId: key, kind, status: 'pending', attempts: { $lt: MAX_ATTEMPTS } },
    { $set: { status: 'expired' } },
  );
  const request = await LoginRequest.create({
    userId: key,
    kind,
    codeHash: sha256(code),
    status: 'pending',
    attempts: 0,
    expiresAt: new Date(Date.now() + FIVE_MINUTES),
  });
  // Код в открытом виде возвращается только здесь и нигде не сохраняется.
  return { request, code };
}

async function verifyCodeRequest(key, kind, code) {
  const since = new Date(Date.now() - FIFTEEN_MINUTES);
  const blocked = await LoginRequest.findOne({
    userId: key,
    kind,
    attempts: { $gte: MAX_ATTEMPTS },
    updatedAt: { $gte: since },
  });
  if (blocked) throw fail('too_many_attempts');

  const request = await LoginRequest.findOne({
    userId: key,
    kind,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  if (!request) throw fail('expired');

  const expected = Buffer.from(request.codeHash, 'hex');
  const actual = Buffer.from(sha256(String(code ?? '').trim()), 'hex');
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!matches) {
    request.attempts += 1;
    if (request.attempts >= MAX_ATTEMPTS) request.status = 'rejected';
    await request.save();
    if (request.attempts >= MAX_ATTEMPTS) throw fail('too_many_attempts');
    throw fail('invalid_code');
  }
  request.status = 'approved';
  await request.save();
  return request;
}

export async function createSiteCodeRequest(specId) {
  return createCodeRequest(specId, 'site-code');
}

export async function verifySiteCode(specId, code) {
  await verifyCodeRequest(specId, 'site-code', code);
  const user = await User.findOne({ specId });
  if (!user) throw fail('user_not_found');
  return user;
}

function tgKey(tgId) {
  return `tg:${Number(tgId)}`;
}

// Код подтверждения Telegram ID на сайте. Повторная отправка не чаще раза в минуту,
// чтобы сайт нельзя было использовать для рассылки сообщений чужому Telegram.
export async function createTgCodeRequest(tgId) {
  const recent = await LoginRequest.findOne({
    userId: tgKey(tgId),
    kind: 'tg-code',
    createdAt: { $gt: new Date(Date.now() - CODE_COOLDOWN_MS) },
  });
  if (recent) throw fail('code_cooldown');
  return createCodeRequest(tgKey(tgId), 'tg-code');
}

export async function verifyTgCode(tgId, code) {
  await verifyCodeRequest(tgKey(tgId), 'tg-code', code);
  return Number(tgId);
}

export async function createLinkToken(specId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await LoginRequest.create({
    userId: specId,
    kind: 'link',
    codeHash: sha256(token),
    status: 'pending',
    attempts: 0,
    expiresAt: new Date(Date.now() + THIRTY_MINUTES),
  });
  return token;
}

// tgId передаётся, когда ссылку открыли в боте: так аккаунт с сайта получает привязку к Telegram.
export async function activateLink(token, tgId = null, profile = {}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const request = await LoginRequest.findOne({
    codeHash: sha256(token),
    kind: 'link',
    status: 'pending',
    expiresAt: { $gt: new Date() },
  });
  if (!request) return null;
  let user = await User.findOne({ specId: request.userId });
  if (!user) return null;
  if (tgId) {
    user = await linkTelegram(user.specId, tgId, profile);
  }
  user.status = 'active';
  user.pendingExpiresAt = undefined;
  await user.save();
  request.status = 'approved';
  await request.save();
  return user;
}
