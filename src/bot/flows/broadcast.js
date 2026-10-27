import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import { broadcastTargetKeyboard, broadcastValuesKeyboard, broadcastConfirmKeyboard } from '../keyboards.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { getUserByTgId } from '../../services/userService.js';
import { getClassKey } from '../../services/homeworkService.js';
import { countRecipients, sendBroadcast } from '../../services/broadcastService.js';
import { User } from '../../db/models/User.js';
import { escapeHtml } from '../../utils/normalize.js';
import { showMenuPage1 } from './menu.js';

const TARGET_LABELS = { all: 'Всем', city: 'По городу', school: 'По школе', class: 'По классу' };

async function valuesFor(target) {
  if (target === 'city') {
    return (await User.distinct('city')).filter(Boolean).sort();
  }
  if (target === 'school') {
    return (await User.distinct('school')).filter(Boolean).sort();
  }
  if (target === 'class') {
    const users = await User.find({ school: { $nin: [null, ''] }, class: { $nin: [null, ''] } }).select('school class').lean();
    const set = new Set(users.map((user) => `${user.school}::${user.class}`));
    return [...set].sort();
  }
  return [];
}

export async function startClassBroadcast(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  if (user.role !== 'admin' && user.role !== 'creator') {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return;
  }

  await answerCb(ctx);
  await setSession(ctx.from.id, 'bc:text', {
    target: 'class',
    value: getClassKey(user),
    fromName: user.firstName || 'Админ',
  });
  await replyOrEdit(ctx, TEXTS.broadcast.classPrompt.replace('{class}', user.class), {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]] },
  });
}

export async function startCreatorBroadcast(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user || user.role !== 'creator') {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  await answerCb(ctx);
  await setSession(ctx.from.id, 'bc:target', {});
  await replyOrEdit(ctx, TEXTS.broadcast.targetPrompt, broadcastTargetKeyboard());
}

export async function handleBroadcastCallback(ctx, action, value) {
  const user = await getUserByTgId(ctx.from?.id);

  if (action === 'target') {
    if (!user || user.role !== 'creator') {
      await answerCb(ctx, TEXTS.errors.noPermission);
      return;
    }

    if (value === 'all') {
      await setSession(ctx.from.id, 'bc:text', { target: 'all' });
      await answerCb(ctx);
      await replyOrEdit(ctx, TEXTS.broadcast.textPrompt, {
        reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]] },
      });
      return;
    }

    const values = await valuesFor(value);
    if (!values.length) {
      await answerCb(ctx, TEXTS.broadcast.noRecipients);
      return;
    }

    await setSession(ctx.from.id, 'bc:value', { target: value, values });
    await answerCb(ctx);
    await replyOrEdit(
      ctx,
      TEXTS.broadcast.valuePrompt.replace('{target}', TARGET_LABELS[value]),
      broadcastValuesKeyboard(value, values)
    );
    return;
  }

  if (action === 'value') {
    if (!user || user.role !== 'creator') {
      await answerCb(ctx, TEXTS.errors.noPermission);
      return;
    }
    const session = await getSession(ctx.from.id);
    const selected = session.data.values?.[Number(value)];
    if (!selected) {
      await answerCb(ctx, TEXTS.errors.staleMenu);
      return;
    }
    await setSession(ctx.from.id, 'bc:text', { target: session.data.target, value: selected });
    await answerCb(ctx);
    await replyOrEdit(ctx, TEXTS.broadcast.textPrompt, {
      reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]] },
    });
    return;
  }
}

export async function handleBroadcastText(ctx, session) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return true;
  if (user.role !== 'admin' && user.role !== 'creator') {
    await clearSession(ctx.from.id);
    await ctx.reply(TEXTS.errors.noPermission);
    return true;
  }

  const text = ctx.message.text.trim();
  if (!text) {
    await ctx.reply(TEXTS.broadcast.textPrompt);
    return true;
  }

  const data = session.data;
  const count = await countRecipients(data.target, data.value);
  if (!count) {
    await clearSession(ctx.from.id);
    await ctx.reply(TEXTS.broadcast.noRecipients, {
      reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.menu, callback_data: 'menu1' }]] },
    });
    return true;
  }

  await setSession(ctx.from.id, 'bc:confirm', { ...data, text, count });
  await replyOrEdit(ctx, TEXTS.broadcast.confirm.replace('{count}', count), broadcastConfirmKeyboard());
  return true;
}

export async function sendPreparedBroadcast(ctx) {
  const session = await getSession(ctx.from.id);
  const user = await getUserByTgId(ctx.from?.id);
  if (!user || !session.data.text) {
    await answerCb(ctx, TEXTS.errors.noSession);
    return;
  }
  if (user.role !== 'admin' && user.role !== 'creator') {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return;
  }

  await answerCb(ctx, 'Отправляю…');
  const result = await sendBroadcast(bot, {
    target: session.data.target,
    value: session.data.value,
    text: session.data.text,
    fromName: session.data.target === 'class' ? session.data.fromName : null,
  });

  await clearSession(ctx.from.id);
  const message = session.data.target === 'class'
    ? TEXTS.broadcast.total.replace('{count}', result.total)
    : TEXTS.broadcast.sent.replace('{delivered}', result.delivered).replace('{failed}', result.failed);
  await ctx.reply(message);
  await showMenuPage1(ctx);
}

bot.action('bc:class', async (ctx) => startClassBroadcast(ctx));
bot.action('bc:creator', async (ctx) => startCreatorBroadcast(ctx));
bot.action(/^bc:target:(all|city|school|class)$/, async (ctx) => {
  await handleBroadcastCallback(ctx, 'target', ctx.match[1]);
});
bot.action(/^bc:value:(\d+)$/, async (ctx) => {
  await handleBroadcastCallback(ctx, 'value', ctx.match[1]);
});
bot.action('bc:send', async (ctx) => sendPreparedBroadcast(ctx));
