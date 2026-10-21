import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
import { User } from '../db/models/User.js';
import { Token } from '../db/models/Token.js';
import config from '../config.js';

const JWT_SECRET = new TextEncoder().encode(config.jwt.secret);
const JWT_ALGORITHM = 'HS256';
const COOKIE_NAME = 'session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
};

// Создание JWT токена
export async function createToken(userId) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
  
  // Сохраняем хэш токена в БД
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await Token.findOneAndUpdate(
    { userId, tokenHash },
    { userId, tokenHash, platform: 'web', createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    { upsert: true, new: true }
  );
  
  return token;
}

// Проверка JWT токена
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    
    // Проверяем, что токен не отозван
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenRecord = await Token.findOne({ tokenHash, revokedAt: { $exists: false } });
    
    if (!tokenRecord) {
      return null;
    }
    
    return payload;
  } catch (e) {
    return null;
  }
}

// Отзыв всех токенов пользователя
export async function revokeAllTokens(userId) {
  await Token.updateMany(
    { userId },
    { revokedAt: new Date() }
  );
}

// Middleware для проверки авторизации
export function authMiddleware(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  verifyToken(token)
    .then(payload => {
      req.userId = payload.userId;
      next();
    })
    .catch(() => {
      res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
      res.status(401).json({ error: 'Invalid token' });
    });
}

// Middleware для проверки ролей
export function roleMiddleware(allowedRoles) {
  return async (req, res, next) => {
    const user = await User.findOne({ specId: req.userId });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    req.user = user;
    next();
  };
}

// Middleware для проверки Origin
export function originMiddleware(req, res, next) {
  const origin = req.headers.origin;
  
  if (origin && origin !== config.site.url) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }
  
  next();
}

// Установка cookie с токеном
export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
}

// Очистка cookie
export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
}
