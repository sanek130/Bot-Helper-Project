import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';
import { Token } from '../db/models/Token.js';
import { User } from '../db/models/User.js';
import { getActiveBanForUser } from '../services/banService.js';

export const AUTH_COOKIE = 'hw_token';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MUTATING_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

function secretKey() {
  return new TextEncoder().encode(config.jwtSecret);
}

export async function signToken(user) {
  return new SignJWT({ role: user.role, jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.specId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey());
}

export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
  return payload;
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: config.siteUrl.startsWith('https'),
    sameSite: 'lax',
    maxAge: THIRTY_DAYS_MS,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: config.siteUrl.startsWith('https'),
    sameSite: 'lax',
    path: '/',
  });
}

export const TG_COOKIE = 'hw_tg';
const TG_VERIFY_MS = 30 * 60 * 1000;

// Отметка «Telegram ID подтверждён кодом из бота». Это не сессия: она только открывает список
// аккаунтов этого Telegram и даёт привязать к нему аккаунт. Действует 30 минут.
export async function setTgVerifiedCookie(res, tgId) {
  const token = await new SignJWT({ purpose: 'tg' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(tgId))
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(secretKey());
  res.cookie(TG_COOKIE, token, {
    httpOnly: true,
    secure: config.siteUrl.startsWith('https'),
    sameSite: 'lax',
    maxAge: TG_VERIFY_MS,
    path: '/',
  });
}

export async function readTgVerified(req) {
  const token = req.cookies?.[TG_COOKIE];
  if (!token) return null;
  try {
    const payload = await verifyToken(token);
    if (payload.purpose !== 'tg') return null;
    const tgId = Number(payload.sub);
    return Number.isSafeInteger(tgId) && tgId > 0 ? tgId : null;
  } catch {
    return null;
  }
}

export function clearTgCookie(res) {
  res.clearCookie(TG_COOKIE, {
    httpOnly: true,
    secure: config.siteUrl.startsWith('https'),
    sameSite: 'lax',
    path: '/',
  });
}

export function originGuard(req, res, next) {
  if (!MUTATING_METHODS.includes(req.method)) return next();
  if (req.path.startsWith('/api/files') || req.path.startsWith('/tg/')) return next();
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  if (!origin || origin !== config.siteUrl) {
    return res.status(403).json({ error: 'origin_mismatch' });
  }
  return next();
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export async function saveToken(userId, token, platform = 'web') {
  return Token.create({
    tokenHash: hashToken(token),
    userId,
    platform,
    expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
  });
}

export async function revokeToken(token) {
  return Token.findOneAndUpdate(
    { tokenHash: hashToken(token) },
    { $set: { revokedAt: new Date() } },
    { new: true },
  );
}

export async function revokeAllUserTokens(specId) {
  const result = await Token.updateMany(
    { userId: specId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
  return { modifiedCount: result.modifiedCount || 0 };
}

// Выдаёт новую сессию сайта: JWT подписывается, его хэш сохраняется, сам токен уходит только в cookie.
export async function issueSession(res, user) {
  const token = await signToken(user);
  await saveToken(user.specId, token);
  setAuthCookie(res, token);
  return token;
}

// Забаненному оставлен только доступ к поддержке и к выходу из аккаунта, чтобы он мог обжаловать бан.
function bannedAllowed(req) {
  const url = req.originalUrl.split('?')[0];
  return url.startsWith('/api/support/') || url === '/api/auth/me' || url === '/api/auth/logout' || url === '/api/auth/logout-all';
}

// Mini App внутри web.telegram.org работает во фрейме, где браузер не отправляет cookie сайта.
// Поэтому кроме cookie принимается заголовок Authorization: Bearer <токен>.
export function readAuthToken(req) {
  const header = String(req.headers.authorization || '');
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[AUTH_COOKIE] || '';
}

export async function requireAuth(req, res, next) {
  try {
    const token = readAuthToken(req);
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    let payload;
    try {
      payload = await verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
    // JWT без записи в Token или с revokedAt считается отозванным (выход со всех устройств).
    const stored = await Token.findOne({ tokenHash: hashToken(token) });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const user = await User.findOne({ specId: payload.sub });
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'unauthorized' });
    if (!user.banned) {
      // Бан по Telegram ID или юзернейму действует и на аккаунты, созданные после бана.
      const personBan = await getActiveBanForUser(user);
      if (personBan) {
        user.banned = true;
        user.banReason = personBan.reason || '';
        user.bannedBy = personBan.bannedBy || '';
        user.bannedAt = new Date();
        await user.save();
      }
    }
    if (user.banned && !bannedAllowed(req)) {
      return res.status(403).json({ error: 'banned', reason: user.banReason || '' });
    }
    req.user = user;
    req.authToken = token;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    // Админ, получивший 3 варна, теряет права даже если роль ещё не успела смениться.
    if (req.user.role === 'admin' && req.user.adminBanned) return res.status(403).json({ error: 'admin_banned' });
    return next();
  };
}
