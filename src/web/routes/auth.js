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
import { publicUser } from '../../services/userService.js';
import {
  createToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  revokeToken,
  revokeAllTokens,
} from '../auth.js';
import { findCity, findSchool } from '../../services/searchService.js';
import { sanitizeSchoolName, escapeHtml } from '../../utils/normalize.js';

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
  keyGenerator: (req) => `${req.ip}:${req.body?.specId || ''}`,
  message: { error: 'too_many_requests' },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.body?.specId || ''}`,
  message: { error: 'too_many_requests' },
});

function activationUrl(token) {
  return `https://t.me/${config.bot.username}?start=link_${token}`;
}

router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { city, school, class: className, role } = req.body || {};

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

    const user = await User.create({
      city: cityName,
      school: schoolName,
      class: match[0],
      role: 'user',
      status: 'pending',
      platforms: ['web'],
      pendingExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      pendingAdminRequest: role === 'admin',
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

router.post('/login', codeLimiter, async (req, res, next) => {
  try {
    const specId = String(req.body?.specId || '').trim();
    if (!specId) return res.status(400).json({ error: 'missing_spec_id' });

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
    const specId = String(req.body?.specId || '').trim();
    const code = String(req.body?.code || '').trim();
    if (!specId || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });

    const result = await verifyCodeLogin(specId, code);
    if (!result.ok) {
      const status = result.error === 'too_many_attempts' ? 429 : 400;
      return res.status(status).json({ error: result.error });
    }

    const token = await createToken(result.user.specId);
    setAuthCookie(res, token);
    return res.json({ user: publicUser(result.user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
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

router.get('/me', requireAuth, (req, res) => {
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
