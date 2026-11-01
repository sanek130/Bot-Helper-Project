import mongoose from 'mongoose';
import { SupportTicket } from '../db/models/SupportTicket.js';
import { getUserBySpecId } from './userService.js';

export const MAX_UNANSWERED = 5;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export async function getOpenTicket(userSpecId) {
  return SupportTicket.findOne({ userSpecId, status: 'open' });
}

export async function getOrCreateTicket(userSpecId) {
  const existing = await getOpenTicket(userSpecId);
  if (existing) return existing;
  return SupportTicket.create({ userSpecId, status: 'open', messages: [] });
}

export async function getTicketById(ticketId) {
  if (!mongoose.isValidObjectId(ticketId)) return null;
  return SupportTicket.findById(ticketId);
}

export async function addMessageToTicket(ticketId, from, authorSpecId, authorName, text, source = 'telegram') {
  const value = String(text ?? '').trim();
  if (value.length < 3 || value.length > 2000) throw fail('invalid_text');
  if (!['user', 'support'].includes(from)) throw fail('invalid_from');
  if (!mongoose.isValidObjectId(ticketId)) throw fail('ticket_not_found');
  const ticket = await SupportTicket.findOneAndUpdate(
    { _id: ticketId, status: 'open' },
    { $push: { messages: { from, authorSpecId, authorName, text: value, source, createdAt: new Date() } } },
    { new: true },
  );
  if (!ticket) throw fail('ticket_not_found');
  return ticket;
}

export async function closeTicket(ticketId, closedBy) {
  if (!mongoose.isValidObjectId(ticketId)) return null;
  return SupportTicket.findOneAndUpdate(
    { _id: ticketId, status: 'open' },
    { $set: { status: 'closed', closedBy, closedAt: new Date() } },
    { new: true },
  );
}

export async function getOpenTickets(limit = 10) {
  const tickets = await SupportTicket.find({ status: 'open' }).sort({ updatedAt: -1 }).limit(limit);
  const result = [];
  for (const ticket of tickets) {
    result.push({ ticket, user: await getUserBySpecId(ticket.userSpecId) });
  }
  return result;
}

export async function countOpenTickets() {
  return SupportTicket.countDocuments({ status: 'open' });
}

export async function getUserTickets(userSpecId, limit = 10) {
  return SupportTicket.find({ userSpecId }).sort({ updatedAt: -1 }).limit(limit);
}

// Считаются сообщения пользователя после последнего ответа поддержки.
export async function canSendMessage(userSpecId) {
  const ticket = await getOpenTicket(userSpecId);
  if (!ticket) return { allowed: true, remaining: MAX_UNANSWERED };
  let unanswered = 0;
  for (let i = ticket.messages.length - 1; i >= 0; i -= 1) {
    if (ticket.messages[i].from === 'support') break;
    unanswered += 1;
  }
  const remaining = Math.max(0, MAX_UNANSWERED - unanswered);
  return { allowed: remaining > 0, remaining };
}
