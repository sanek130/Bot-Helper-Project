import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveReplyText,
  normalizeKeyboardItems,
  getReplyKeyboard,
  getStyleKeyboard,
  getMenuPage1Keyboard,
} from '../src/bot/keyboards.js';
import { BUTTON_STYLES, STYLE_EMOJI } from '../src/bot/texts.js';

const userWith = (buttonStyle, extra = {}) => ({ buttonStyle, role: 'user', customKeyboard: ['Сегодня', 'Завтра', 'Меню'], ...extra });

test('reply-кнопки любого стиля распознаются как базовые подписи', () => {
  for (const style of BUTTON_STYLES) {
    const rows = getReplyKeyboard(userWith(style.id)).reply_markup.keyboard;
    const labels = rows.flat().map((b) => (typeof b === 'string' ? b : b.text));
    assert.deepEqual(labels.map(resolveReplyText), ['сегодня', 'завтра', 'меню'], style.id);
  }
});

test('старые подписи с эмодзи из базы приводятся к базовым', () => {
  assert.deepEqual(normalizeKeyboardItems(['📅 Сегодня', '➡️ Завтра', '🏠 Меню']), ['Сегодня', 'Завтра']);
  assert.equal(resolveReplyText('📌 СЕГОДНЯ'), 'сегодня');
});

test('в тихом стиле у кнопок без значка остаётся текст, а не пустые подписи', () => {
  const kb = getStyleKeyboard(userWith('minimal')).reply_markup.inline_keyboard.flat();
  assert.ok(kb.every((b) => b.text.trim().length > 0));
});

test('по умолчанию классический стиль: подписи без эмодзи', () => {
  const menu = getMenuPage1Keyboard({ role: 'user' }).reply_markup.inline_keyboard.flat();
  assert.ok(menu.every((b) => /^[\p{L}\s«»-]+$/u.test(b.text)), menu.map((b) => b.text).join(', '));
});

test('на главной странице меню у всех кнопок разные значки', () => {
  const user = { buttonStyle: 'minimal', role: 'creator' };
  const icons = getMenuPage1Keyboard(user).reply_markup.inline_keyboard.flat().map((b) => b.text);
  assert.equal(new Set(icons).size, icons.length, icons.join(' '));
  assert.ok(Object.values(STYLE_EMOJI).every((icon) => icon.trim().length > 0));
});

test('экран /style отмечает текущий стиль и есть кнопка «Стиль» в меню', () => {
  const kb = getStyleKeyboard(userWith('bright')).reply_markup.inline_keyboard.flat();
  const active = kb.filter((b) => b.text.startsWith('✅'));
  assert.equal(active.length, 1);
  assert.equal(active[0].callback_data, 'style:set:bright');
  const menu = getMenuPage1Keyboard(userWith('emoji')).reply_markup.inline_keyboard.flat();
  assert.ok(menu.some((b) => b.callback_data === 'style:open'));
});
