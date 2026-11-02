import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('../data/contacts.json', import.meta.url), 'utf8'));
const HTTPS_RE = /^https:\/\/[^\s<>"']+$/;

function safeUrl(value) {
  const url = String(value ?? '').trim();
  return HTTPS_RE.test(url) ? url : '';
}

const username = String(raw.creatorUsername ?? '').trim().replace(/^@/, '');

// Ссылка на донат берётся из DONATE_URL, если она задана, иначе из contacts.json.
// Пустая ссылка — кнопки и строки про донат нигде не показываются.
export const CONTACTS = Object.freeze({
  ownerName: String(raw.ownerName ?? '').trim(),
  creatorUsername: username,
  creatorUrl: username ? `https://t.me/${username}` : '',
  emails: Object.freeze((raw.emails || []).map((email) => String(email).trim()).filter(Boolean)),
  chatUrl: safeUrl(raw.chatUrl),
  donateUrl: safeUrl(process.env.DONATE_URL) || safeUrl(raw.donateUrl),
});
