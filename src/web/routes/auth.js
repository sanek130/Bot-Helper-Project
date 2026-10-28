import express from 'express';
import rateLimit from 'express-rate-limit';
import { User } from '../../db/models/User.js';
import bot from '../../bot/bot.js';
import config from '../../config.js';
import {
  createCodeLoginRequest,
  verifyCodeLogin,
  createLinkLoginRequest,
  findPendingLink,
} from '../../services/loginService.js';
import {
  publicUser,
  createUser,
  getUserByTgId,
  getUserByPhone,
  getUserByGoogleId,
  getUserBySpecId,
} from '../../services/userService.js';
import {
  verifyTelegramWebAppData,
  verifyTelegramLoginWidget,
  verifyGoogleCredential,
} from '../../services/externalAuthService.js';
import {
  createToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireAuthAllowBanned,
  revokeToken,
  revokeAllTokens,
} from '../auth.js';
import { findCity, findSchool } from '../../services/searchService.js';
import { sanitizeSchoolName, escapeHtml, normalizePhone } from '../../utils/normalize.js';

const router = express.Router();

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.body?.specId || req.body?.phone || ''}`,
  message: { error: 'too_many_requests' },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.body?.specId || req.body?.phone || ''}`,
  message: { error: 'too_many_requests' },
});

const providerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

// Внешний способ входа → { kind, tgId?, googleId?, email?, firstName?, username? }
async function resolveIdentity(body = {}) {
  if (body.telegramInitData) {
    const tg = verifyTelegramWebAppData(body.telegramInitData, config.bot.token);
    return tg ? { kind: 'telegram', source: 'tma', tgId: tg.id, firstName: tg.firstName, username: tg.username } : { error: 'invalid_telegram' };
  }
  if (body.telegramAuth) {
    const tg = verifyTelegramLoginWidget(body.telegramAuth, config.bot.token);
    return tg ? { kind: 'telegram', source: 'widget', tgId: tg.id, firstName: tg.firstName, username: tg.username } : { error: 'invalid_telegram' };
  }
  if (body.googleCredential) {
    if (!config.google.clientId) return { error: 'google_disabled' };
    const google = await verifyGoogleCredential(body.googleCredential, config.google.clientId);
    return google ? { kind: 'google', googleId: google.googleId, email: google.email, firstName: google.name } : { error: 'invalid_google' };
  }
  return null;
}

async function findByIdentity(identity) {
  if (identity.kind === 'telegram') return getUserByTgId(identity.tgId);
  if (identity.kind === 'google') return getUserByGoogleId(identity.googleId);
  return null;
}

// Забаненный тоже получает сессию, но сервер пустит его только в поддержку
async function issueSession(res, user) {
  const token = await createToken(user.specId);
  setAuthCookie(res, token);
  return res.json({ registered: true, user: publicUser(user), token });
}

function activationUrl(token) {
  return `https://t.me/${config.bot.username}?start=link_${token}`;
}

router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { city, school, class: className } = req.body || {};
    const identity = await resolveIdentity(req.body);
    if (identity?.error) return res.status(400).json({ error: identity.error });

    if (!city || !school || !className) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const foundCity = findCity(city);
    // «Другой город» — служебный вариант: разрешаем ввести название вручную
    const cityName = foundCity ? foundCity.name : sanitizeSchoolName(city);
    if (!cityName) return res.status(400).json({ error: 'unknown_city' });

    const canonicalSchool = await findSchool(cityName, school);
    const schoolName = canonicalSchool || sanitizeSchoolName(school);
    if (!schoolName) return res.status(400).json({ error: 'invalid_school' });

    const match = String(className).toUpperCase().match(/^(4|5|6|7|8|9|10|11)([А-ЯЁ])$/);
    if (!match) return res.status(400).json({ error: 'invalid_class' });

    // С подтверждённым Telegram или Google аккаунт активен сразу
    if (identity) {
      if (await findByIdentity(identity)) return res.status(409).json({ error: 'already_registered' });
      const user = await createUser({
        city: cityName,
        school: schoolName,
        class: match[0],
        role: 'user',
        status: 'active',
        firstName: identity.firstName || undefined,
        username: identity.username || undefined,
        tgId: identity.tgId,
        googleId: identity.googleId,
        email: identity.email || undefined,
        platforms: identity.kind === 'telegram' ? ['telegram', 'web'] : ['google', 'web'],
        customKeyboard: ['Сегодня', 'Завтра', 'Меню'],
      });
      return await issueSession(res, user);
    }

    const user = await User.create({
      city: cityName,
      school: schoolName,
      class: match[0],
      role: 'user',
      status: 'pending',
      platforms: ['web'],
      pendingExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      customKeyboard: ['Сегодня', 'Завтра', 'Меню'],
    });

    const link = await createLinkLoginRequest(user.specId);
    if (!link.ok) return res.status(500).json({ error: 'link_failed' });

    return res.json({ specId: user.specId, activationLink: activationUrl(link.token) });
  } catch (error) {
    return next(error);
  }
});

// Экран «Заверши регистрацию в боте»: отдаём статус и, если нужно, свежую ссылку
router.get('/pending', async (req, res, next) => {
  try {
    const specId = String(req.query.specId || '');
    const user = await User.findOne({ specId });
    if (!user) return res.status(404).json({ error: 'not_found' });
    if (user.status === 'active') return res.json({ status: 'active' });

    let token = null;
    if (!(await findPendingLink(specId))) {
      const link = await createLinkLoginRequest(specId);
      token = link.ok ? link.token : null;
    }

    return res.json({ status: 'pending', activationLink: token ? activationUrl(token) : null });
  } catch (error) {
    return next(error);
  }
});

// Вход по спец-ID или по номеру телефона, подтверждённому в боте
async function resolveLoginSpecId(body = {}) {
  if (body.phone) {
    const phone = normalizePhone(body.phone);
    const user = phone ? await getUserByPhone(phone) : null;
    return user?.specId || null;
  }
  return String(body.specId || '').trim() || null;
}

// Telegram Mini App, виджет Telegram или Google: вход, если аккаунт уже есть
router.post('/provider', providerLimiter, async (req, res, next) => {
  try {
    const identity = await resolveIdentity(req.body);
    if (!identity) return res.status(400).json({ error: 'missing_credential' });
    if (identity.error) return res.status(400).json({ error: identity.error });

    const user = await findByIdentity(identity);
    if (!user) {
      return res.json({
        registered: false,
        profile: { kind: identity.kind, firstName: identity.firstName || '', email: identity.email || '' },
      });
    }
    return await issueSession(res, user);
  } catch (error) {
    return next(error);
  }
});

// Привязка Google или Telegram к уже существующему аккаунту
router.post('/link-provider', requireAuth, providerLimiter, async (req, res, next) => {
  try {
    const identity = await resolveIdentity(req.body);
    if (!identity) return res.status(400).json({ error: 'missing_credential' });
    if (identity.error) return res.status(400).json({ error: identity.error });

    const busy = await findByIdentity(identity);
    if (busy && busy.specId !== req.user.specId) return res.status(409).json({ error: 'provider_busy' });

    const user = req.user;
    if (identity.kind === 'google') {
      user.googleId = identity.googleId;
      if (identity.email) user.email = identity.email;
      if (!user.platforms.includes('google')) user.platforms.push('google');
    } else {
      user.tgId = identity.tgId;
      if (identity.username) user.username = identity.username;
      if (!user.firstName && identity.firstName) user.firstName = identity.firstName;
      if (!user.platforms.includes('telegram')) user.platforms.push('telegram');
    }
    await user.save();
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', codeLimiter, async (req, res, next) => {
  try {
    const specId = await resolveLoginSpecId(req.body);
    if (!specId) return res.status(400).json({ error: req.body?.phone ? 'phone_not_found' : 'missing_spec_id' });

    const result = await createCodeLoginRequest(specId);
    if (!result.ok) {
      const status = result.error === 'too_many_attempts' ? 429 : 400;
      return res.status(status).json({ error: result.error });
    }

    try {
      await bot.telegram.sendMessage(
        result.user.tgId,
        `Код для входа на сайт КлассныйБот: <b>${result.code}</b>\nКод действует 5 минут. Если это не ты — просто проигнорируй сообщение.`,
        { parse_mode: 'HTML' }
      );
    } catch {
      return res.status(502).json({ error: 'telegram_unavailable' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/verify', verifyLimiter, async (req, res, next) => {
  try {
    const specId = await resolveLoginSpecId(req.body);
    const code = String(req.body?.code || '').trim();
    if (!specId || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });

    const result = await verifyCodeLogin(specId, code);
    if (!result.ok) {
      const status = result.error === 'too_many_attempts' ? 429 : 400;
      return res.status(status).json({ error: result.error });
    }

    return await issueSession(res, result.user);
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', requireAuthAllowBanned, async (req, res, next) => {
  try {
    await revokeToken(req.token);
    clearAuthCookie(res);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await revokeAllTokens(req.user.specId);
    clearAuthCookie(res);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuthAllowBanned, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Новая ссылка на привязку Telegram из профиля на сайте
router.post('/link', requireAuth, async (req, res, next) => {
  try {
    const link = await createLinkLoginRequest(req.user.specId);
    if (!link.ok) return res.status(500).json({ error: 'link_failed' });
    return res.json({ activationLink: activationUrl(link.token) });
  } catch (error) {
    return next(error);
  }
});

// Заглушка «Макс»: в этой версии мессенджер не подключён
router.get('/max', (req, res) => {
  res.json({ available: false, message: 'Макс — скоро' });
});

export default router;
