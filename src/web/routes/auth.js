import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../../config.js';
import { bot } from '../../bot/instance.js';
import { TEXTS } from '../../bot/texts.js';
import { fill } from '../../utils/normalize.js';
import { capitalize } from '../../utils/subjects.js';
import { getCityById, getSchoolOptions, findSchoolInCity, createSchool, SCHOOL_TYPES } from '../../utils/searchService.js';
import {
  SPEC_ID_RE,
  getUserBySpecId,
  getUserByTgId,
  getRegisteredSchoolsInCity,
  createPendingWebUser,
  publicUser,
} from '../../services/userService.js';
import {
  createSiteCodeRequest,
  verifySiteCode,
  createLinkToken,
  activateLink,
  createTgCodeRequest,
  verifyTgCode,
} from '../../services/loginService.js';
import { getActiveBan } from '../../services/banService.js';
import {
  parseTgId,
  getAccountsForTg,
  getBoundAccount,
  canEnterWithTg,
  accountSummary,
  bindAccountToTg,
  createVerifiedWebUser,
} from '../../services/tgAccessService.js';
import {
  requireAuth,
  issueSession,
  revokeToken,
  revokeAllUserTokens,
  clearAuthCookie,
  setTgVerifiedCookie,
  readTgVerified,
  clearTgCookie,
  verifyToken,
  AUTH_COOKIE,
} from '../auth.js';
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
    // Код уходит в привязанный Telegram, а если человек вышел из аккаунта в боте — на его постоянный Telegram ID.
    const targetTgId = user.tgId || user.ownerTgId;
    if (!targetTgId) return res.status(400).json({ error: 'no_telegram', message: TEXTS.WEB_NO_TELEGRAM });
    const { code } = await createSiteCodeRequest(specId);
    try {
      await bot.telegram.sendMessage(targetTgId, fill(TEXTS.WEB_SITE_CODE, { code }), { parse_mode: 'HTML' });
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
    const wantedSchool = String(body.school ?? '').trim();
    // Школу можно выбрать из списка или ввести вручную (тип + номер): ищем в справочнике, иначе создаём новую.
    let school = schools.find((name) => name === wantedSchool) || null;
    if (!school && wantedSchool) {
      const found = findSchoolInCity(city.id, wantedSchool);
      if (found) {
        school = found.name;
      } else {
        const parsedType = SCHOOL_TYPES.find((type) => wantedSchool.toLowerCase().includes(type));
        const parsedNumber = wantedSchool.match(/\d{1,4}/)?.[0];
        if (parsedType && parsedNumber) {
          const created = createSchool({ cityId: city.id, type: parsedType, number: parsedNumber });
          if (created) school = created.name;
        }
      }
    }
    if (!school) return res.status(400).json({ error: 'invalid_school' });
    const letter = String(body.letter ?? '').trim().toUpperCase().replace('Ё', 'Е');
    if (!CLASS_LETTER_RE.test(letter)) return res.status(400).json({ error: 'invalid_letter' });
    const number = Number.parseInt(body.number, 10);
    if (!Number.isInteger(number) || number < 4 || number > 11) return res.status(400).json({ error: 'invalid_number' });
    const role = body.role === 'admin' ? 'admin' : 'user';
    const firstName = String(body.firstName ?? '').trim().slice(0, 64);
    const fields = { firstName, city: city.name, school, className: `${number}${letter}`, role };
    const tgId = await readTgVerified(req);
    if (tgId) {
      const ban = await getActiveBan({ tgId });
      if (ban) return res.status(403).json({ error: 'banned', reason: ban.reason || '' });
      const result = await createVerifiedWebUser(fields, tgId);
      if (result.linked) await notifyTgLinked(tgId, result.user);
      await issueSession(res, result.user);
      return res.status(201).json({
        ok: true,
        active: true,
        specId: result.user.specId,
        linked: result.linked,
        current: result.current,
        user: publicUser(result.user),
      });
    }
    const user = await createPendingWebUser(fields);
    const token = await createLinkToken(user.specId);
    return res.status(201).json({
      ok: true,
      active: false,
      specId: user.specId,
      botLink: `https://t.me/${config.bot.username}?start=link_${token}`,
    });
  }),
);

async function notifyTgLinked(tgId, user) {
  try {
    await bot.telegram.sendMessage(
      tgId,
      fill(TEXTS.WEB_TG_LINKED_NOTIFY, { school: capitalize(user.school || ''), className: user.class || '' }),
      { parse_mode: 'HTML' },
    );
  } catch {
    // Уведомление необязательное: привязка уже выполнена.
  }
}

async function tgAccountsPayload(tgId, currentSpecId = null) {
  const accounts = await getAccountsForTg(tgId);
  return {
    tgId,
    accounts: accounts.map((user) => accountSummary(user, tgId)),
    hasBound: accounts.some((user) => Number(user.tgId) === Number(tgId)),
    current: currentSpecId,
  };
}

async function currentSpecIdFromCookie(req) {
  try {
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) return null;
    const payload = await verifyToken(token);
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

authRouter.post(
  '/tg/start',
  asyncRoute(async (req, res) => {
    const tgId = parseTgId(req.body?.tgId);
    if (!tgId) return res.status(400).json({ error: 'invalid_tg_id' });
    const ban = await getActiveBan({ tgId });
    if (ban) return res.status(403).json({ error: 'banned', reason: ban.reason || '' });
    let code;
    try {
      ({ code } = await createTgCodeRequest(tgId));
    } catch (err) {
      if (errorCode(err) === 'code_cooldown') return res.status(429).json({ error: 'code_cooldown' });
      throw err;
    }
    try {
      await bot.telegram.sendMessage(tgId, fill(TEXTS.WEB_TG_CODE, { code }), { parse_mode: 'HTML' });
    } catch {
      // Бот может написать только тому, кто хотя бы раз нажал «Старт».
      return res.status(400).json({ error: 'bot_not_started', botUsername: config.bot.username });
    }
    return res.json({ ok: true });
  }),
);

authRouter.post(
  '/tg/verify',
  asyncRoute(async (req, res) => {
    const tgId = parseTgId(req.body?.tgId);
    const code = String(req.body?.code ?? '').trim();
    if (!tgId || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });
    try {
      await verifyTgCode(tgId, code);
    } catch (err) {
      const reason = errorCode(err);
      if (['invalid_code', 'too_many_attempts', 'expired'].includes(reason)) return res.status(400).json({ error: reason });
      return res.status(400).json({ error: 'invalid_code' });
    }
    await setTgVerifiedCookie(res, tgId);
    return res.json({ ok: true, ...(await tgAccountsPayload(tgId, await currentSpecIdFromCookie(req))) });
  }),
);

authRouter.get(
  '/tg/status',
  asyncRoute(async (req, res) => {
    const tgId = await readTgVerified(req);
    if (!tgId) return res.json({ verified: false });
    return res.json({ verified: true, ...(await tgAccountsPayload(tgId, await currentSpecIdFromCookie(req))) });
  }),
);

authRouter.post('/tg/forget', (req, res) => {
  clearTgCookie(res);
  res.json({ ok: true });
});

authRouter.post(
  '/tg/enter',
  asyncRoute(async (req, res) => {
    const tgId = await readTgVerified(req);
    if (!tgId) return res.status(401).json({ error: 'tg_not_verified' });
    const specId = String(req.body?.specId ?? '').trim().toLowerCase();
    if (!SPEC_ID_RE.test(specId)) return res.status(400).json({ error: 'invalid_spec_id' });
    let user = await getUserBySpecId(specId);
    if (!canEnterWithTg(user, tgId)) return res.status(403).json({ error: 'forbidden' });
    if (user.banned) return res.status(403).json({ error: 'banned', reason: user.banReason || '' });
    const makeMain = req.body?.makeMain === true;
    let linked = Boolean(user.tgId);
    if (!user.tgId) {
      const bound = await getBoundAccount(tgId);
      // Аккаунт без привязки сразу получает полный доступ, если не отнимает место у текущего аккаунта в боте.
      if (!bound || makeMain) {
        const result = await bindAccountToTg(specId, tgId, { makeMain: true });
        user = result.user;
        linked = true;
        if (result.changed) await notifyTgLinked(tgId, user);
      }
    }
    await issueSession(res, user);
    return res.json({ ok: true, linked, user: publicUser(user) });
  }),
);

authRouter.post(
  '/tg/link',
  requireAuth,
  asyncRoute(async (req, res) => {
    const tgId = await readTgVerified(req);
    if (!tgId) return res.status(401).json({ error: 'tg_not_verified' });
    try {
      const result = await bindAccountToTg(req.user.specId, tgId, { makeMain: req.body?.makeMain === true });
      if (result.changed) await notifyTgLinked(tgId, result.user);
      return res.json({ ok: true, changed: result.changed, user: publicUser(result.user) });
    } catch (err) {
      const reason = errorCode(err);
      if (reason === 'tg_has_account') return res.status(409).json({ error: reason, current: err.current });
      if (reason === 'tg_already_linked') return res.status(409).json({ error: reason });
      throw err;
    }
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
    clearTgCookie(res);
    return res.json({ ok: true });
  }),
);

authRouter.post(
  '/logout-all',
  requireAuth,
  asyncRoute(async (req, res) => {
    await revokeAllUserTokens(req.user.specId);
    clearAuthCookie(res);
    clearTgCookie(res);
    return res.json({ ok: true });
  }),
);

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});
