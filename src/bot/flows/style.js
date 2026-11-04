// /style — выбор стиля подписей кнопок бота (classic | emoji | bright | minimal).
import { TEXTS, BUTTON_STYLES, getStyleById } from '../texts.js';
import { getStyleKeyboard, getReplyKeyboard, DEFAULT_STYLE } from '../keyboards.js';
import { show, say, toast } from '../ui.js';
import { requireActive } from '../guards.js';
import { setButtonStyle } from '../../services/userService.js';
import { fill } from '../../utils/normalize.js';

function currentStyle(user) {
  return getStyleById(user?.buttonStyle || DEFAULT_STYLE);
}

function pickerText(user) {
  const current = currentStyle(user).id;
  const list = BUTTON_STYLES.map(
    (style) => `${style.id === current ? '✅' : '▫️'} ${style.emoji} <b>${style.name}</b> — ${style.desc}`,
  ).join('\n');
  // list собран из констант со своей HTML-разметкой, поэтому подставляется без экранирования.
  return fill(TEXTS.STYLE_PICKER, { list }, { escape: false });
}

export async function showStylePicker(ctx, { forceNew = false } = {}) {
  const user = await requireActive(ctx);
  if (!user) return null;
  const send = forceNew ? say : show;
  return send(ctx, pickerText(user), getStyleKeyboard(user));
}

// Нижняя клавиатура обновляется только новым сообщением, поэтому после смены стиля
// отправляем её заново — иначе на ней остались бы подписи старого стиля.
function hasReplyKeyboard(user) {
  return Array.isArray(user?.customKeyboard) && user.customKeyboard.length > 0;
}

async function applyStyle(ctx, styleId) {
  const user = await requireActive(ctx);
  if (!user) return null;

  const style = BUTTON_STYLES.find((item) => item.id === styleId);
  if (!style) {
    await toast(ctx, TEXTS.STYLE_UNKNOWN);
    return show(ctx, pickerText(user), getStyleKeyboard(user));
  }
  if (currentStyle(user).id === style.id) {
    await toast(ctx, TEXTS.STYLE_SAME);
    return null;
  }

  const updated = (await setButtonStyle(ctx.from.id, style.id)) || user;
  await toast(ctx, fill(TEXTS.STYLE_APPLIED, { emoji: style.emoji, name: style.name }).replace(/<\/?b>/g, ''));
  await show(ctx, pickerText(updated), getStyleKeyboard(updated));
  if (hasReplyKeyboard(updated)) {
    await say(ctx, fill(TEXTS.STYLE_APPLIED, { emoji: style.emoji, name: style.name }), getReplyKeyboard(updated));
  }
  return updated;
}

export function styleFlow(bot) {
  bot.command('style', async (ctx) => showStylePicker(ctx, { forceNew: true }));
  bot.action('style:open', async (ctx) => {
    await toast(ctx);
    return showStylePicker(ctx);
  });
  bot.action(/^style:set:([a-z]+)$/, async (ctx) => applyStyle(ctx, ctx.match[1]));
}
