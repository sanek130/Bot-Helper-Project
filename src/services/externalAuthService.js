import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const DAY_SECONDS = 24 * 60 * 60;

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isFresh(authDate, maxAgeSeconds, now) {
  const value = Number(authDate);
  return Number.isFinite(value) && value > 0 && now / 1000 - value <= maxAgeSeconds;
}

// Telegram Mini App: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyTelegramWebAppData(initData, botToken, { maxAgeSeconds = DAY_SECONDS, now = Date.now() } = {}) {
  if (!initData || typeof initData !== 'string' || initData.length > 4096) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!safeEqualHex(expected, hash)) return null;
  if (!isFresh(params.get('auth_date'), maxAgeSeconds, now)) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user?.id) return null;
    return { id: Number(user.id), firstName: user.first_name || '', username: user.username || '' };
  } catch {
    return null;
  }
}

// Виджет «Войти через Telegram»: https://core.telegram.org/widgets/login#checking-authorization
export function verifyTelegramLoginWidget(data, botToken, { maxAgeSeconds = DAY_SECONDS, now = Date.now() } = {}) {
  if (!data || typeof data !== 'object' || !data.hash || !data.id) return null;
  const allowed = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date'];
  const dataCheckString = allowed
    .filter((key) => data[key] !== undefined && data[key] !== null && data[key] !== '')
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!safeEqualHex(expected, data.hash)) return null;
  if (!isFresh(data.auth_date, maxAgeSeconds, now)) return null;
  return { id: Number(data.id), firstName: data.first_name || '', username: data.username || '' };
}

let googleKeys = null;

// Google Identity Services отдаёт ID-токен (JWT), проверяем подпись и аудиторию
export async function verifyGoogleCredential(credential, clientId, { keys } = {}) {
  if (!clientId || !credential || typeof credential !== 'string') return null;
  googleKeys ||= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  try {
    const { payload } = await jwtVerify(credential, keys || googleKeys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
    });
    if (!payload.sub || payload.email_verified === false) return null;
    return { googleId: String(payload.sub), email: payload.email || '', name: payload.given_name || payload.name || '' };
  } catch {
    return null;
  }
}
