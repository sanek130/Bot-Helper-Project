import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { asyncRoute, parseLimit, errorCode, displayName, displayUsername } from '../helpers.js';
import { TEXTS } from '../../bot/texts.js';
import { fill } from '../../utils/normalize.js';
import { notifyUser, notifyCreators } from '../../bot/notify.js';
import { getTicketActionsKeyboard, getSupportDoneKeyboard } from '../../bot/keyboards.js';
import { SUPPORT_ROLES } from '../../bot/roles.js';
import {
  getOrCreateTicket,
  getTicketById,
  addMessageToTicket,
  closeTicket,
  getOpenTickets,
  getUserTickets,
  canSendMessage,
} from '../../services/supportService.js';
import { getUserBySpecId, publicUser } from '../../services/userService.js';

export const supportRouter = Router();

supportRouter.use(requireAuth);

function serializeTicket(ticket) {
  return {
    _id: String(ticket._id),
    userSpecId: ticket.userSpecId,
    status: ticket.status,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    closedAt: ticket.closedAt || null,
    messages: (ticket.messages || []).map((message) => ({
      from: message.from,
      authorName: message.authorName || '',
      text: message.text,
      source: message.source,
      createdAt: message.createdAt,
    })),
  };
}

async function sendMine(req, res) {
  const tickets = await getUserTickets(req.user.specId, parseLimit(req.query.limit, 10, 50));
  return res.json({ tickets: tickets.map(serializeTicket) });
}

supportRouter.get('/mine', asyncRoute(sendMine));

supportRouter.get(
  '/tickets',
  asyncRoute(async (req, res, next) => {
    if (req.query.mine === 'true') return sendMine(req, res);
    return requireRole(...SUPPORT_ROLES)(req, res, next);
  }),
  asyncRoute(async (req, res) => {
    const items = await getOpenTickets(parseLimit(req.query.limit, 10, 50));
    return res.json({
      tickets: items.map(({ ticket, user }) => ({ ticket: serializeTicket(ticket), user: publicUser(user) })),
    });
  }),
);

supportRouter.post(
  '/message',
  asyncRoute(async (req, res) => {
    const text = String(req.body?.text ?? '').trim();
    if (text.length < 3 || text.length > 2000) return res.status(400).json({ error: 'invalid_text' });
    const { allowed } = await canSendMessage(req.user.specId);
    if (!allowed) return res.status(429).json({ error: 'too_many_messages' });
    let ticket = await getOrCreateTicket(req.user.specId);
    ticket = await addMessageToTicket(String(ticket._id), 'user', req.user.specId, req.user.firstName || '', text, 'web');
    const notice = fill(TEXTS.SUP_NOTIFY, {
      ticketId: String(ticket._id),
      name: displayName(req.user),
      username: displayUsername(req.user),
      class: req.user.class || '—',
      source: TEXTS.WEB_SUPPORT_SOURCE,
      text,
    });
    await notifyCreators(notice, getTicketActionsKeyboard(String(ticket._id)));
    return res.json({ ok: true, ticketId: String(ticket._id) });
  }),
);

supportRouter.post(
  '/reply',
  requireRole(...SUPPORT_ROLES),
  asyncRoute(async (req, res) => {
    const ticketId = String(req.body?.ticketId ?? '');
    const text = String(req.body?.text ?? '').trim();
    let ticket;
    try {
      ticket = await addMessageToTicket(ticketId, 'support', req.user.specId, req.user.firstName || '', text, 'web');
    } catch (err) {
      const code = errorCode(err);
      return res.status(code === 'ticket_not_found' ? 404 : 400).json({ error: code });
    }
    const owner = await getUserBySpecId(ticket.userSpecId);
    const delivered = owner?.tgId
      ? await notifyUser(owner.tgId, fill(TEXTS.SUP_ANSWER_TO_USER, { text }), getSupportDoneKeyboard())
      : false;
    return res.json({ ok: true, delivered: Boolean(delivered) });
  }),
);

supportRouter.post(
  '/close',
  requireRole(...SUPPORT_ROLES),
  asyncRoute(async (req, res) => {
    const ticket = await closeTicket(String(req.body?.ticketId ?? ''), req.user.specId);
    if (!ticket) return res.status(404).json({ error: 'ticket_not_found' });
    const owner = await getUserBySpecId(ticket.userSpecId);
    if (owner?.tgId) await notifyUser(owner.tgId, TEXTS.SUP_CLOSED_USER);
    return res.json({ ok: true });
  }),
);

// Тикет по id доступен владельцу и поддержке: так пользователь видит ответы на сайте.
supportRouter.get(
  '/ticket/:ticketId',
  asyncRoute(async (req, res) => {
    const ticket = await getTicketById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ error: 'ticket_not_found' });
    const staff = SUPPORT_ROLES.includes(req.user.role);
    if (!staff && ticket.userSpecId !== req.user.specId) return res.status(403).json({ error: 'forbidden' });
    return res.json({ ticket: serializeTicket(ticket) });
  }),
);
