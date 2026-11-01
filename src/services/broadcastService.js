import { bot } from '../bot/instance.js';
import { User } from '../db/models/User.js';
import { escapeHtml, escapeRegex, fill } from '../utils/normalize.js';
import { TEXTS } from '../bot/texts.js';

export const AUDIENCES = ['class', 'school', 'city', 'all'];
const PAUSE_MS = 100;

function exact(value) {
  return new RegExp(`^${escapeRegex(String(value ?? '').trim())}$`, 'i');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Для рассылки создателя по классу audienceValue имеет вид «школа::класс».
function buildFilter(audience, audienceValue, senderSchool, senderClass) {
  const filter = { status: 'active', banned: { $ne: true }, tgId: { $exists: true, $ne: null } };
  if (audience === 'class') {
    let school = senderSchool;
    let className = senderClass;
    if (audienceValue && String(audienceValue).includes('::')) {
      const [s, ...rest] = String(audienceValue).split('::');
      school = s;
      className = rest.join('::');
    }
    filter.school = exact(school);
    filter.class = exact(className);
  } else if (audience === 'school') {
    filter.school = exact(audienceValue || senderSchool);
  } else if (audience === 'city') {
    filter.city = exact(audienceValue);
  } else if (audience !== 'all') {
    const error = new Error('invalid_audience');
    error.code = 'invalid_audience';
    throw error;
  }
  return filter;
}

export async function getRecipients(audience, audienceValue, senderSchool, senderClass) {
  return User.find(buildFilter(audience, audienceValue, senderSchool, senderClass), { tgId: 1 }).lean();
}

export async function countRecipients(audience, audienceValue, senderSchool, senderClass) {
  return User.countDocuments(buildFilter(audience, audienceValue, senderSchool, senderClass));
}

export async function getAudienceValues(audience) {
  if (audience === 'city') return (await User.distinct('city', { status: 'active' })).filter(Boolean).sort();
  if (audience === 'school') return (await User.distinct('school', { status: 'active' })).filter(Boolean).sort();
  if (audience === 'class') {
    const pairs = await User.aggregate([
      { $match: { status: 'active', school: { $ne: '' }, class: { $ne: '' } } },
      { $group: { _id: { school: '$school', class: '$class' } } },
      { $limit: 200 },
    ]);
    return pairs.map((p) => `${p._id.school}::${p._id.class}`).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  }
  return [];
}

export async function sendBroadcast(audience, audienceValue, text, senderName, senderSchool, senderClass, { excludeTgId = null } = {}) {
  const recipients = await getRecipients(audience, audienceValue, senderSchool, senderClass);
  const message =
    audience === 'class' && !String(audienceValue || '').includes('::')
      ? fill(TEXTS.BC_FROM_ADMIN, { senderName: senderName || 'класса', text })
      : escapeHtml(text);
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    if (excludeTgId && Number(recipient.tgId) === Number(excludeTgId)) continue;
    try {
      await bot.telegram.sendMessage(recipient.tgId, message, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      sent += 1;
    } catch (err) {
      // 403 — пользователь заблокировал бота; остальные ошибки тоже не прерывают рассылку.
      failed += 1;
      const code = err?.response?.error_code;
      if (code !== 403) console.warn(`broadcast: ошибка доставки (${code || 'нет кода'}): ${err?.response?.description || err.message}`);
    }
    await sleep(PAUSE_MS);
  }
  return { sent, failed };
}
