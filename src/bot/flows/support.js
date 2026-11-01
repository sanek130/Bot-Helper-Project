import { TEXTS } from '../texts.js';
import {
  getCancelKeyboard,
  getSupportDoneKeyboard,
  getTicketActionsKeyboard,
  getTicketsBackKeyboard,
  getBackToPanelKeyboard,
  getMenuOnlyKeyboard,
  getUnregisteredKeyboard,
} from '../keyboards.js';
import { show, say, toast } from '../ui.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { loadUser, requireActive } from '../guards.js';
import { isSupport } from '../roles.js';
import { notifyUser, notifyCreators } from '../notify.js';
import { getUserBySpecId } from '../../services/userService.js';
import {
  getOrCreateTicket,
  getTicketById,
  addMessageToTicket,
  closeTicket,
  getOpenTickets,
  canSendMessage,
} from '../../services/supportService.js';
import { fill, truncate } from '../../utils/normalize.js';

const TICKET_RE = '([0-9a-f]{24})';

// Поддержка доступна и забаненным (для обжалования), и тем, кто не закончил регистрацию:
// нужен только аккаунт со спец-ID.
async function requireTicketOwner(ctx) {
  const user = await loadUser(ctx);
  if (!user?.specId) {
    await show(ctx, TEXTS.UNREGISTERED_ACCESS, getUnregisteredKeyboard());
    return null;
  }
  return user;
}

async function requireSupportStaff(ctx) {
  const user = await requireActive(ctx);
  if (!user) return null;
  if (!isSupport(user)) {
    await toast(ctx, TEXTS.MODERATOR_ONLY, true);
    await show(ctx, TEXTS.MODERATOR_ONLY, getMenuOnlyKeyboard());
    return null;
  }
  return user;
}

export async function startSupport(ctx, { forceNew = false } = {}) {
  const user = await requireTicketOwner(ctx);
  if (!user) return null;
  const { allowed } = await canSendMessage(user.specId);
  if (!allowed) return (forceNew ? say : show)(ctx, TEXTS.SUP_TOO_MANY, getMenuOnlyKeyboard());
  const ticket = await getOrCreateTicket(user.specId);
  await setSession(ctx.from.id, 'telegram', 'sup:text', { ticketId: String(ticket._id) });
  return (forceNew ? say : show)(ctx, TEXTS.SUP_PROMPT, getCancelKeyboard());
}

function ticketCard(ticket, owner) {
  const last = ticket.messages[ticket.messages.length - 1];
  return fill(TEXTS.SUP_TICKET_CARD, {
    ticketId: String(ticket._id),
    name: owner?.firstName || 'Без имени',
    username: owner?.username || 'нет',
    class: owner?.class || '—',
    count: ticket.messages.length,
    last: truncate(last?.text || '—', 300),
  });
}

async function handleUserMessage(ctx, session, text) {
  const user = await requireTicketOwner(ctx);
  if (!user) return null;
  const value = String(text ?? '').trim();
  if (value.length < 3 || value.length > 2000) return say(ctx, TEXTS.SUP_TEXT_INVALID, getCancelKeyboard());
  const { allowed } = await canSendMessage(user.specId);
  if (!allowed) {
    await clearSession(ctx.from.id, 'telegram');
    return say(ctx, TEXTS.SUP_TOO_MANY, getMenuOnlyKeyboard());
  }
  // Тикет мог быть закрыт поддержкой, пока пользователь писал — тогда создаётся новый.
  let ticket = await getTicketById(session.data?.ticketId);
  if (!ticket || ticket.status !== 'open' || ticket.userSpecId !== user.specId) ticket = await getOrCreateTicket(user.specId);
  ticket = await addMessageToTicket(String(ticket._id), 'user', user.specId, user.firstName || '', value, 'telegram');
  await clearSession(ctx.from.id, 'telegram');
  await say(ctx, TEXTS.SUP_SENT, getSupportDoneKeyboard());
  const notice = fill(TEXTS.SUP_NOTIFY, {
    ticketId: String(ticket._id),
    name: user.firstName || 'Без имени',
    username: user.username || 'нет',
    class: user.class || '—',
    source: 'Telegram',
    text: value,
  });
  await notifyCreators(notice, getTicketActionsKeyboard(String(ticket._id)));
  return null;
}

async function handleSupportAnswer(ctx, session, text) {
  const staff = await requireSupportStaff(ctx);
  if (!staff) return null;
  const value = String(text ?? '').trim();
  if (value.length < 3 || value.length > 2000) return say(ctx, TEXTS.SUP_TEXT_INVALID, getCancelKeyboard());
  let ticket;
  try {
    ticket = await addMessageToTicket(session.data?.ticketId, 'support', staff.specId, staff.firstName || '', value, 'telegram');
  } catch (err) {
    if (err?.code === 'ticket_not_found') {
      await clearSession(ctx.from.id, 'telegram');
      return say(ctx, TEXTS.SUP_TICKET_GONE, getTicketsBackKeyboard());
    }
    throw err;
  }
  await clearSession(ctx.from.id, 'telegram');
  const owner = await getUserBySpecId(ticket.userSpecId);
  const delivered = owner?.tgId
    ? await notifyUser(owner.tgId, fill(TEXTS.SUP_ANSWER_TO_USER, { text: value }), getSupportDoneKeyboard())
    : false;
  return say(ctx, delivered ? TEXTS.SUP_ANSWER_SENT : TEXTS.SUP_ANSWER_NOT_DELIVERED, getTicketsBackKeyboard());
}

// Текстовый ввод на шагах sup:* (вызывается из router.js).
export async function handleSupportText(ctx, session, text) {
  if (session.step === 'sup:text') return handleUserMessage(ctx, session, text);
  if (session.step === 'sup:answer') return handleSupportAnswer(ctx, session, text);
  await clearSession(ctx.from.id, 'telegram');
  return startSupport(ctx, { forceNew: true });
}

export function supportFlow(bot) {
  bot.command('support', async (ctx) => startSupport(ctx, { forceNew: true }));
  bot.action('sup:start', async (ctx) => startSupport(ctx));

  bot.action('sup:list', async (ctx) => {
    const staff = await requireSupportStaff(ctx);
    if (!staff) return null;
    await clearSession(ctx.from.id, 'telegram');
    const tickets = await getOpenTickets(10);
    if (tickets.length === 0) return show(ctx, TEXTS.SUP_NO_TICKETS, getBackToPanelKeyboard());
    for (const { ticket, user } of tickets) {
      await say(ctx, ticketCard(ticket, user), getTicketActionsKeyboard(String(ticket._id)));
    }
    return say(ctx, fill(TEXTS.CRT_USERS_FOUND, { count: tickets.length }), getBackToPanelKeyboard());
  });

  bot.action(new RegExp(`^sup:reply:${TICKET_RE}$`), async (ctx) => {
    const staff = await requireSupportStaff(ctx);
    if (!staff) return null;
    const ticket = await getTicketById(ctx.match[1]);
    if (!ticket || ticket.status !== 'open') return say(ctx, TEXTS.SUP_TICKET_GONE, getTicketsBackKeyboard());
    await setSession(ctx.from.id, 'telegram', 'sup:answer', { ticketId: String(ticket._id) });
    return say(ctx, TEXTS.SUP_ANSWER_PROMPT, getCancelKeyboard());
  });

  bot.action(new RegExp(`^sup:close:${TICKET_RE}$`), async (ctx) => {
    const staff = await requireSupportStaff(ctx);
    if (!staff) return null;
    const ticket = await closeTicket(ctx.match[1], staff.specId);
    if (!ticket) return say(ctx, TEXTS.SUP_TICKET_GONE, getTicketsBackKeyboard());
    const owner = await getUserBySpecId(ticket.userSpecId);
    if (owner?.tgId) await notifyUser(owner.tgId, TEXTS.SUP_CLOSED_USER);
    const session = await getSession(ctx.from.id, 'telegram');
    if (session?.step === 'sup:answer' && session.data?.ticketId === String(ticket._id)) await clearSession(ctx.from.id, 'telegram');
    return show(ctx, TEXTS.SUP_CLOSED, getTicketsBackKeyboard());
  });
}
