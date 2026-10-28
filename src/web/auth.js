import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';
import config from '../config.js';
import { getUserBySpecId } from '../services/userService.js';
import { Token } from '../db/models/Token.js';

export const COOKIE_NAME = 'session';
export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ALGORITHM = 'HS256';
const secret = new TextEncoder().encode(config.jwt.secret);

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.site.url.startsWith('https://'),
  sameSite: 'lax',
  path: '/',
  maxAge: TOKEN_TTL_MS,
});

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createToken(specId) {
  const token = await new SignJWT({ sub: specId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime('30d')
    .sign(secret);

  await Token.create({
    userId: specId,
    tokenHash: hashToken(token),
    platform: 'web',
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });

  return token;
}

export async function verifyToken(token) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALGORITHM] });
    const record = await Token.findOne({
      tokenHash: hashToken(token),
      revokedAt: { $exists: false },
    });

    if (!record || record.expiresAt <= new Date()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Сайт хранит токен в httpOnly-cookie, мини-приложение — в заголовке Authorization
function readToken(req) {
  const header = String(req.headers.authorization || '');
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[COOKIE_NAME];
}

function authenticate({ allowBanned = false } = {}) {
  return async (req, res, next) => {
    try {
      const token = readToken(req);
      const payload = await verifyToken(token);
      if (!payload?.sub) return res.status(401).json({ error: 'unauthorized' });

      const user = await getUserBySpecId(payload.sub);
      if (!user || user.status !== 'active') return res.status(401).json({ error: 'unauthorized' });
      if (user.banned && !allowBanned) {
        return res.status(403).json({ error: 'banned', reason: user.banReason || null });
      }

      req.user = user;
      req.token = token;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export const requireAuth = authenticate();
// Для поддержки: забаненный пользователь может обжаловать бан
export const requireAuthAllowBanned = authenticate({ allowBanned: true });

export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    return next();
  };
}

// Origin проверяется для изменяющих запросов: чужой сайт не сможет
// дёргать API от имени пользователя, даже если cookie уедет.
export function originGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.headers.origin;
  if (origin && origin.replace(/\/+$/, '') !== config.site.url) {
    return res.status(403).json({ error: 'forbidden_origin' });
  }
  return next();
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
}

export async function revokeToken(token) {
  if (!token) return;
  await Token.updateOne({ tokenHash: hashToken(token) }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllTokens(specId) {
  await Token.updateMany({ userId: specId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
}
