import bot, { replyOrEdit, safeAnswerCb } from '../bot.js';
import { TEXTS } from '../texts.js';
import { getUserByTgId } from '../../services/userService.js';
import { sendBroadcast } from '../../services/broadcastService.js';
import { getClassKey } from '../../services/homeworkService.js';
import { escapeHtml } from '../../utils/normalize.js';

// Рассылка классу (админ)
bot.action('broadcastClass', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user || (user.role !== 'admin' && user.role !== 'creator')) {
    await safeAnswerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  
  await setSessionStep(ctx, 'broadcastEnter', { target: 'class', value: getClassKey(user) });
  const msg = TEXTS.broadcast.prompt.replace('{class}', user.class);
  const keyboard = { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]] } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

// Рассылка создателю (любой группе)
bot.action('broadcastCreator', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user || user.role !== 'creator') {
    await safeAnswerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  
  const msg = 'Выбери получателей рассылки:';
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Всем', callback_data: 'broadcast_target_all' }],
        [{ text: 'По городу', callback_data: 'broadcast_target_city' }],
        [{ text: 'По школе', callback_data: 'broadcast_target_school' }],
        [{ text: 'По классу', callback_data: 'broadcast_target_class' }],
        [{ text: TEXTS.buttons.back, callback_data: 'adminPanel' }],
        [{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

// Выбор цели рассылки
bot.action(/^broadcast_target_(all|city|school|class)$/, async (ctx) => {
  const target = ctx.match[1];
  
  if (target === 'all') {
    await setSessionStep(ctx, 'broadcastEnter', { target: 'all', value: null });
    await showBroadcastEnter(ctx);
  } else {
    await setSessionStep(ctx, 'broadcastSelectValue', { target });
    await showValueSelection(ctx, target);
  }
});

async function showValueSelection(ctx, target) {
  const labels = {
    city: 'Введи город:',
    school: 'Введи школу:',
    class: 'Введи класс:'
  };
  
  const msg = labels[target];
  const keyboard = { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.back, callback_data: 'broadcastCreator' }], [{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]] } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

async function showBroadcastEnter(ctx) {
  const msg = 'Напиши текст рассылки:';
  const keyboard = { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]] } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Обработка ввода значения (город/школа/класс)
bot.on('message', async (ctx) => {
  const step = getSessionData(ctx, 'step');
  
  if (step === 'broadcastSelectValue') {
    const text = ctx.message.text;
    if (!text) return;
    
    const data = getSessionData(ctx);
    await setSessionStep(ctx, 'broadcastEnter', { target: data.target, value: text });
    await showBroadcastEnter(ctx);
  }
});

// Обработка ввода текста рассылки
bot.on('message', async (ctx) => {
  const step = getSessionData(ctx, 'step');
  
  if (step === 'broadcastEnter') {
    const text = ctx.message.text;
    if (!text) return;
    
    const data = getSessionData(ctx);
    const user = await getUserByTgId(ctx.from?.id);
    
    if (!user) return;
    
    const result = await sendBroadcast(bot, data.target, data.value, text);
    
    await clearSession(ctx);
    
    if (result.success) {
      const msg = TEXTS.broadcast.sent.replace('{count}', result.delivered);
      const keyboard = { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.menu, callback_data: 'menu' }]] } };
      await safeAnswerCb(ctx);
      await replyOrEdit(ctx, msg, keyboard);
    } else {
      await ctx.reply(`❌ ${result.error}`);
    }
  }
});

function setSessionStep(ctx, step, data = {}) {
  if (ctx.session) {
    ctx.session.step = step;
    ctx.session.data = { ...ctx.session.data, ...data };
  }
}

function getSessionData(ctx, key) {
  if (ctx.session && ctx.session.data) {
    return key ? ctx.session.data[key] : ctx.session.data;
  }
  return null;
}

function clearSession(ctx) {
  if (ctx.session) {
    ctx.session.step = null;
    ctx.session.data = {};
  }
}
