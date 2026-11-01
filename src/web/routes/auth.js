import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../../config.js';
import { bot } from '../../bot/instance.js';
import { TEXTS } from '../../bot/texts.js';
import { fill } from '../../utils/normalize.js';
import { getCityById, getSchoolOptions } from '../../utils/searchService.js';
import {
  SPEC_ID_RE,
  getUserBySpecId,
  getUserByTgId,
  getRegisteredSchoolsInCity,
  createPendingWebUser,
  publicUser,
} from '../../services/userService.js';
import { createSiteCodeRequest, verifySiteCode, createLinkToken, activateLink } from '../../services/loginService.js';
import { requireAuth, issueSession, revokeToken, revokeAllUserTokens, clearAuthCookie } from '../auth.js';
import { asyncRoute, errorCode } from '../helpers.js';

export const authRouter = Router();

const CLASS_LETTER_RE = /^[А-ЯЁ]$/;
const TMA_MAX_AGE_SECONDS = 24 * 60 * 60;

authRouter.post(
  '/start',
  asyncRoute(async (req, res) => {
    const specId = String(req.body?.specId ?? '').trim().toLowerCase();
    if (!SPEC_ID_RE.test(specId)) return res.status(400).json({ error: 'invalid_spec_id' });
    const user = await getUserBySpecId(specId);
    if (!user || user.status !== 'active') return res.status(400).json({ error: 'not_found_or_pending' });
    if (!user.tgId) return res.status(400).json({ error: 'no_telegram', message: TEXTS.WEB_NO_TELEGRAM });
    const { code } = await createSiteCodeRequest(specId);
    try {
      await bot.telegram.sendMessage(user.tgId, fill(TEXTS.WEB_SITE_CODE, { code }), { parse_mode: 'HTML' });
    } catch {
      return res.status(502).json({ error: 'telegram_unavailable' });
    }
    return res.json({ ok: true });
  }),
);

authRouter.post(
  '/verify',
  asyncRoute(async (req, res) => {
    const specId = String(req.body?.specId ?? '').trim().toLowerCase();
    const code = String(req.body?.code ?? '').trim();
    if (!SPEC_ID_RE.test(specId) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });
    let user;
    try {
      user = await verifySiteCode(specId, code);
    } catch (err) {
      const reason = errorCode(err);
      if (['invalid_code', 'too_many_attempts', 'expired'].includes(reason)) return res.status(400).json({ error: reason });
      return res.status(400).json({ error: 'invalid_code' });
    }
    if (user.status !== 'active') return res.status(400).json({ error: 'not_found_or_pending' });
    if (user.banned) return res.status(403).json({ error: 'banned', reason: user.banReason || '' });
    await issueSession(res, user);
    return res.json({ ok: true, user: publicUser(user) });
  }),
);

authRouter.post(
  '/link',
  asyncRoute(async (req, res) => {
    const user = await activateLink(String(req.body?.token ?? ''));
    if (!user) return res.status(400).json({ error: 'invalid_or_expired' });
    await issueSession(res, user);
    return res.json({ ok: true, user: publicUser(user) });
  }),
);

authRouter.post(
  '/register',
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const city = getCityById(String(body.cityId ?? ''));
    if (!city) return res.status(400).json({ error: 'invalid_city' });
    const registered = await getRegisteredSchoolsInCity(city.name);
    const schools = getSchoolOptions(city.id, registered);
    const school = schools.find((name) => name === String(body.school ?? '').trim());
    if (!school) return res.status(400).json({ error: 'invalid_school' });
    const letter = String(body.letter ?? '').trim().toUpperCase().replace('Ё', 'Е');
    if (!CLASS_LETTER_RE.test(letter)) return res.status(400).json({ error: 'invalid_letter' });
    const number = Number.parseInt(body.number, 10);
    if (!Number.isInteger(number) || number < 4 || number > 11) return res.status(400).json({ error: 'invalid_number' });
    const role = body.role === 'admin' ? 'admin' : 'user';
    const firstName = String(body.firstName ?? '').trim().slice(0, 64);
    const user = await createPendingWebUser({
      firstName,
      city: city.name,
      school,
      className: `${number}${letter}`,
      role,
    });
    const token = await createLinkToken(user.specId);
    return res.status(201).json({
      ok: true,
      specId: user.specId,
      botLink: `https://t.me/${config.bot.username}?start=link_${token}`,
    });
  }),
);

// Проверка initData Telegram Mini App по алгоритму из документации Telegram:
// ключ = HMAC_SHA256("WebAppData", BOT_TOKEN), подпись = HMAC_SHA256(ключ, data_check_string).
function verifyInitData(initData) {
  const params = new URLSearchParams(String(initData || ''));
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(config.bot.token).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > TMA_MAX_AGE_SECONDS) return null;
  try {
    return JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
}

authRouter.post(
  '/tma',
  asyncRoute(async (req, res) => {
    const tgUser = verifyInitData(req.body?.initData);
    if (!tgUser?.id) return res.status(400).json({ error: 'invalid_init_data' });
    const user = await getUserByTgId(tgUser.id);
    if (!user || user.status !== 'active') return res.status(404).json({ error: 'not_registered' });
    if (user.banned) return res.status(403).json({ error: 'banned', reason: user.banReason || '' });
    await issueSession(res, user);
    return res.json({ ok: true, user: publicUser(user) });
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncRoute(async (req, res) => {
    await revokeToken(req.authToken);
    clearAuthCookie(res);
    return res.json({ ok: true });
  }),
);

authRouter.post(
  '/logout-all',
  requireAuth,
  asyncRoute(async (req, res) => {
    await revokeAllUserTokens(req.user.specId);
    clearAuthCookie(res);
    return res.json({ ok: true });
  }),
);

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});
