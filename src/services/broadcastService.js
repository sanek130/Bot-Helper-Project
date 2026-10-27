import { User } from '../db/models/User.js';
import { escapeHtml } from '../utils/normalize.js';
import { parseClassKey } from './homeworkService.js';

const DELAY_MS = 100;

function targetFilter(target, value) {
  switch (target) {
    case 'all':
      return {};
    case 'city':
      return { city: value };
    case 'school':
      return { school: value };
    case 'class': {
      const { school, className } = parseClassKey(value);
      return school ? { school, class: className } : { class: className };
    }
    default:
      return null;
  }
}

export async function resolveRecipients(target, value) {
  const filter = targetFilter(target, value);
  if (!filter) return [];
  return User.find({ ...filter, tgId: { $exists: true }, status: 'active' });
}

export async function sendBroadcast(bot, { target, value, text, fromName }) {
  const recipients = await resolveRecipients(target, value);
  const safeText = escapeHtml(text);
  const body = fromName ? `📢 Сообщение от админа ${escapeHtml(fromName)}:\n\n${safeText}` : safeText;

  let delivered = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      await bot.telegram.sendMessage(recipient.tgId, body, { parse_mode: 'HTML' });
      delivered += 1;
    } catch (error) {
      // 403 «bot was blocked» и подобные ошибки не ломают рассылку
      failed += 1;
      console.error('Рассылка: получатель пропущен', { tgId: recipient.tgId, code: error?.code || error?.response?.error_code });
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  return { total: recipients.length, delivered, failed };
}

export async function countRecipients(target, value) {
  return resolveRecipients(target, value).then((users) => users.length);
}
