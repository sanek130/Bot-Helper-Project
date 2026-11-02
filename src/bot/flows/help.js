import { TEXTS } from '../texts.js';
import { getHelpKeyboard, getContactsKeyboard, getDonateKeyboard } from '../keyboards.js';
import { show } from '../ui.js';
import { getRawUserByTgId } from '../../services/userService.js';
import { CONTACTS } from '../../utils/contacts.js';
import { fill } from '../../utils/normalize.js';

export async function showHelp(ctx) {
  const user = ctx.from ? await getRawUserByTgId(ctx.from.id) : null;
  return show(ctx, TEXTS.HELP, getHelpKeyboard(user));
}

export function contactsText() {
  let text = fill(TEXTS.CONTACTS_CARD, {
    ownerName: CONTACTS.ownerName,
    creatorUsername: CONTACTS.creatorUsername,
    emails: CONTACTS.emails.join(', '),
    chatUrl: CONTACTS.chatUrl,
  });
  if (CONTACTS.donateUrl) text += TEXTS.CONTACTS_DONATE_LINE;
  return text;
}

async function showContacts(ctx) {
  return show(ctx, contactsText(), getContactsKeyboard(CONTACTS));
}

async function showDonate(ctx) {
  return show(ctx, CONTACTS.donateUrl ? TEXTS.DONATE_TEXT : TEXTS.DONATE_SOON, getDonateKeyboard(CONTACTS));
}

export function helpFlow(bot) {
  bot.help(async (ctx) => showHelp(ctx));
  bot.action('help:open', async (ctx) => showHelp(ctx));
  bot.command('contacts', async (ctx) => showContacts(ctx));
  bot.action('help:contacts', async (ctx) => showContacts(ctx));
  bot.command('donate', async (ctx) => showDonate(ctx));
}
