import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACTS } from '../src/utils/contacts.js';
import { contactsText } from '../src/bot/flows/help.js';
import { getContactsKeyboard } from '../src/bot/keyboards.js';

function buttonTexts(keyboard) {
  return keyboard.reply_markup.inline_keyboard.flat().map((button) => button.text);
}

test('контакты создателя читаются из contacts.json', () => {
  assert.equal(CONTACTS.creatorUsername, 'sanek120');
  assert.equal(CONTACTS.creatorUrl, 'https://t.me/sanek120');
  assert.equal(CONTACTS.chatUrl, 'https://t.me/HomeWorklyHelper');
  assert.ok(CONTACTS.emails.includes('sashshih@gmail.com'));
});

test('карточка контактов в боте содержит создателя, почту и чат', () => {
  const text = contactsText();
  assert.match(text, /@sanek120/);
  assert.match(text, /sanek130\.2@mail\.ru/);
  assert.match(text, /t\.me\/HomeWorklyHelper/);
});

test('кнопка доната появляется только при заданной ссылке', () => {
  assert.ok(!buttonTexts(getContactsKeyboard({ ...CONTACTS, donateUrl: '' })).includes('Поддержать проект'));
  assert.ok(buttonTexts(getContactsKeyboard({ ...CONTACTS, donateUrl: 'https://example.org/donate' })).includes('Поддержать проект'));
});

test('DONATE_URL важнее файла, а небезопасная ссылка отбрасывается', async () => {
  process.env.DONATE_URL = 'https://boosty.to/hwhelper';
  const withEnv = await import('../src/utils/contacts.js?env=1');
  assert.equal(withEnv.CONTACTS.donateUrl, 'https://boosty.to/hwhelper');
  process.env.DONATE_URL = 'javascript:alert(1)';
  const bad = await import('../src/utils/contacts.js?env=2');
  assert.equal(bad.CONTACTS.donateUrl, '');
  delete process.env.DONATE_URL;
});
