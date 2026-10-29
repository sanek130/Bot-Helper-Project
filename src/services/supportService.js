import { SupportTicket } from '../db/models/SupportTicket.js';
import { User } from '../db/models/User.js';

export const SUPPORT_MAX_LENGTH = 2000;
const MAX_UNANSWERED = 5;

export function cleanSupportText(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (text.length < 3 || text.length > SUPPORT_MAX_LENGTH) return null;
  return text;
}

// Сколько сообщений пользователя подряд ждут ответа
export function unansweredCount(ticket) {
  let count = 0;
  for (let i = ticket.messages.length - 1; i >= 0; i -= 1) {
    if (ticket.messages[i].from !== 'user') break;
    count += 1;
  }
  return count;
}

export async function getOpenTicket(specId) {
  return SupportTicket.findOne({ userSpecId: specId, status: 'open' });
}

// Одно открытое обращение на пользователя: новые сообщения дописываются в него
export async function addUserMessage(user, rawText, source = 'telegram') {
  const text = cleanSupportText(rawText);
  if (!text) return { ok: false, error: 'invalid_text' };

  let ticket = await getOpenTicket(user.specId);
  if (ticket && unansweredCount(ticket) >= MAX_UNANSWERED) return { ok: false, error: 'too_many' };
  if (!ticket) ticket = new SupportTicket({ userSpecId: user.specId });

  ticket.messages.push({
    from: 'user',
    authorSpecId: user.specId,
    authorName: user.firstName || user.username || '',
    text,
    source,
  });
  await ticket.save();
  return { ok: true, ticket, text };
}

export async function addSupportReply(ticketId, creator, rawText) {
  const text = cleanSupportText(rawText);
  if (!text) return { ok: false, error: 'invalid_text' };
  const ticket = await SupportTicket.findById(ticketId).catch(() => null);
  if (!ticket) return { ok: false, error: 'not_found' };

  ticket.messages.push({
    from: 'support',
    authorSpecId: creator.specId,
    authorName: creator.firstName || creator.username || 'Поддержка',
    text,
  });
  await ticket.save();
  const user = await User.findOne({ specId: ticket.userSpecId });
  return { ok: true, ticket, user, text };
}

export async function closeTicket(ticketId, creator) {
  const ticket = await SupportTicket.findById(ticketId).catch(() => null);
  if (!ticket) return { ok: false, error: 'not_found' };
  if (ticket.status === 'closed') return { ok: false, error: 'already_closed', ticket };
  ticket.status = 'closed';
  ticket.closedBy = creator?.specId;
  await ticket.save();
  const user = await User.findOne({ specId: ticket.userSpecId });
  return { ok: true, ticket, user };
}

export async function listTickets({ status = 'open', limit = 50 } = {}) {
  const filter = status === 'all' ? {} : { status };
  return SupportTicket.find(filter).sort({ updatedAt: -1 }).limit(limit);
}

export async function listUserTickets(specId, limit = 10) {
  return SupportTicket.find({ userSpecId: specId }).sort({ updatedAt: -1 }).limit(limit);
}

export async function countOpenTickets() {
  return SupportTicket.countDocuments({ status: 'open' });
}

export function publicTicket(ticket, user = null) {
  return {
    id: String(ticket._id),
    status: ticket.status,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    messages: ticket.messages.map((message) => ({
      from: message.from,
      authorName: message.from === 'support' ? 'Поддержка' : message.authorName || '',
      text: message.text,
      source: message.source,
      at: message.at,
    })),
    user: user
      ? {
          specId: user.specId,
          firstName: user.firstName || null,
          username: user.username || null,
          school: user.school || null,
          class: user.class || null,
          role: user.role,
          banned: Boolean(user.banned),
        }
      : undefined,
  };
}
