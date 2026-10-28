import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { SignJWT, generateKeyPair, createLocalJWKSet, exportJWK } from 'jose';
import {
  verifyTelegramWebAppData,
  verifyTelegramLoginWidget,
  verifyGoogleCredential,
} from '../src/services/externalAuthService.js';

const BOT_TOKEN = '123456789:AAE1234567890abcdef1234567890abcdef';
const now = Date.now();
const authDate = String(Math.floor(now / 1000) - 60);

function signWebApp(fields) {
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

test('Mini App: корректная подпись initData принимается', () => {
  const initData = signWebApp({
    auth_date: authDate,
    query_id: 'AAH',
    user: JSON.stringify({ id: 42, first_name: 'Аня', username: 'anya' }),
  });
  assert.deepEqual(verifyTelegramWebAppData(initData, BOT_TOKEN, { now }), { id: 42, firstName: 'Аня', username: 'anya' });
});

test('Mini App: подделанные или устаревшие данные отклоняются', () => {
  const initData = signWebApp({ auth_date: authDate, user: JSON.stringify({ id: 42 }) });
  const forged = initData.replace('42', '43');
  assert.equal(verifyTelegramWebAppData(forged, BOT_TOKEN, { now }), null);
  assert.equal(verifyTelegramWebAppData(initData, 'другой:токен', { now }), null);
  assert.equal(verifyTelegramWebAppData(initData, BOT_TOKEN, { now: now + 2 * 24 * 3600 * 1000 }), null);
  assert.equal(verifyTelegramWebAppData('', BOT_TOKEN), null);
});

test('виджет Telegram: подпись проверяется по sha256(токена)', () => {
  const data = { id: '7', first_name: 'Петя', username: 'petya', auth_date: authDate };
  const dataCheckString = Object.keys(data).sort().map((key) => `${key}=${data[key]}`).join('\n');
  const secret = crypto.createHash('sha256').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  assert.deepEqual(verifyTelegramLoginWidget({ ...data, hash }, BOT_TOKEN, { now }), { id: 7, firstName: 'Петя', username: 'petya' });
  assert.equal(verifyTelegramLoginWidget({ ...data, id: '8', hash }, BOT_TOKEN, { now }), null);
});

test('Google: проверяются подпись, издатель и аудитория', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims) => new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer('https://accounts.google.com')
    .setAudience('client-1')
    .setSubject('google-123')
    .sign(privateKey);

  const token = await sign({ email: 'a@example.com', email_verified: true, given_name: 'Аня' });
  assert.deepEqual(await verifyGoogleCredential(token, 'client-1', { keys }), { googleId: 'google-123', email: 'a@example.com', name: 'Аня' });
  assert.equal(await verifyGoogleCredential(token, 'client-2', { keys }), null);
  assert.equal(await verifyGoogleCredential(await sign({ email_verified: false }), 'client-1', { keys }), null);
  assert.equal(await verifyGoogleCredential(token, '', { keys }), null);
});
