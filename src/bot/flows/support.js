import bot, { answerCb, replyOrEdit, isCreator } from '../bot.js';
import { TEXTS } from '../texts.js';
import { supportTicketKeyboard } from '../keyboards.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { getUserByTgId, getUserBySpecId } from '../../services/userService.js';
import {
  addUserMessage,
  addSupportReply,
  closeTicket,
  listTickets,
} from '../../services/supportService.js';
import { getClassKey } from '../../services/homeworkService.js';
import { notifyCreators, notifyUser } from '../notify.js';
import { escapeHtml } from '../../utils/normalize.js';

const SOURCES = { telegram: 'бот', web: 'сайт', tma: 'мини-приложение' };

function userLabel(user) {
  const name = escapeHtml(user.firstName || '—');
  return user.username ? `${name} (@${escapeHtml(user.username)})` : name;
}

export function supportCreatorText(user, text, source) {
  const body = TEXTS.support.creatorBody
    .replace('{from}', userLabel(user) + (user.banned ? ' ⛔ забанен' : ''))
    .replace('{classKey}', escapeHtml(user.class ? getClassKey(user) : '—'))
    .replace('{source}', SOURCES[source] || source)
    .replace('{text}', escapeHtml(text));
  return `${TEXTS.support.creatorTitle}\n${body}`;
}

export async function forwardToCreators(user, ticket, text, source) {
  await notifyCreators(supportCreatorText(user, text, source), supportTicketKeyboard(String(ticket._id)));
}

export async function deliverSupportReply(user, text) {
  return notifyUser(user, TEXTS.support.reply.replace('{text}', escapeHtml(text)), {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.writeSupport, callback_data: 'sup:start' }]] },
  });
}

async function startSupport(ctx) {
  await answerCb(ctx);
  const user = await getUserByTgId(ctx.from.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered, {
      reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.register, callback_data: 'reg:start' }]] },
    });
    return;
  }
  await setSession(ctx.from.id, 'sup:text', {});
  await replyOrEdit(ctx, TEXTS.support.prompt, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]] },
  });
}

async function requireCreator(ctx) {
  const user = await getUserByTgId(ctx.from.id);
  if (!isCreator(user)) {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return null;
  }
  return user;
}

export async function handleSupportText(ctx, session) {
  const text = ctx.message.text;

  if (session.step === 'sup:text') {
    const user = await getUserByTgId(ctx.from.id);
    if (!user) return false;
    const result = await addUserMessage(user, text, 'telegram');
    if (!result.ok) {
      await ctx.reply(result.error === 'too_many' ? TEXTS.support.tooMany : TEXTS.support.tooShort);
      return true;
    }
    await clearSession(ctx.from.id);
    await forwardToCreators(user, result.ticket, result.text, 'telegram');
    await ctx.reply(TEXTS.support.sent, {
      reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.menu, callback_data: 'menu1' }]] },
    });
    return true;
  }

  if (session.step === 'sup:answer') {
    const creator = await getUserByTgId(ctx.from.id);
    if (!isCreator(creator)) return false;
    const result = await addSupportReply(session.data.ticketId, creator, text);
    if (!result.ok) {
      await ctx.reply(result.error === 'not_found' ? TEXTS.errors.noSession : TEXTS.support.tooShort);
      return true;
    }
    await clearSession(ctx.from.id);
    const delivered = await deliverSupportReply(result.user, result.text);
    await ctx.reply(delivered ? TEXTS.support.answered : `${TEXTS.support.answered} Пользователь увидит его на сайте.`, supportTicketKeyboard(session.data.ticketId));
    return true;
  }

  return false;
}

bot.command('support', async (ctx) => startSupport(ctx));
bot.action('sup:start', async (ctx) => startSupport(ctx));

bot.action(/^sup:reply:([0-9a-f]{24})$/, async (ctx) => {
  if (!await requireCreator(ctx)) return;
  await answerCb(ctx);
  await setSession(ctx.from.id, 'sup:answer', { ticketId: ctx.match[1] });
  await ctx.reply(TEXTS.support.answerPrompt, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]] },
  });
});

bot.action(/^sup:close:([0-9a-f]{24})$/, async (ctx) => {
  const creator = await requireCreator(ctx);
  if (!creator) return;
  const result = await closeTicket(ctx.match[1], creator);
  if (!result.ok) {
    await answerCb(ctx, result.error === 'already_closed' ? TEXTS.support.alreadyClosed : TEXTS.errors.noSession);
    return;
  }
  await answerCb(ctx, 'Закрыто');
  await notifyUser(result.user, TEXTS.support.closed);
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
});

bot.action('sup:list', async (ctx) => {
  if (!await requireCreator(ctx)) return;
  await answerCb(ctx);
  const tickets = await listTickets({ status: 'open', limit: 10 });
  if (!tickets.length) {
    await ctx.reply(TEXTS.support.noOpen, { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.creatorPanel, callback_data: 'adm:panel' }]] } });
    return;
  }
  for (const ticket of tickets) {
    const user = await getUserBySpecId(ticket.userSpecId);
    const last = ticket.messages[ticket.messages.length - 1];
    const history = ticket.messages.slice(-3)
      .map((message) => `${message.from === 'support' ? '↩️ Поддержка' : '👤'}: ${escapeHtml(message.text.slice(0, 300))}`)
      .join('\n');
    const head = user ? supportCreatorText(user, '', last?.source || 'telegram').trimEnd() : TEXTS.support.creatorTitle;
    await ctx.reply(`${head}\n${history}`, { parse_mode: 'HTML', ...supportTicketKeyboard(String(ticket._id)) });
  }
});
