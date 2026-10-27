import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import { getUserByTgId } from '../../services/userService.js';
import config from '../../config.js';

function helpKeyboard(isRegistered) {
  const rows = [[{ text: TEXTS.buttons.menu, callback_data: 'menu1' }]];

  if (!isRegistered) {
    rows[0].push({ text: TEXTS.buttons.register, callback_data: 'reg:start' });
  } else {
    rows.push([{ text: TEXTS.buttons.reportAdmin, callback_data: 'cmp:start' }]);
  }

  rows.push([{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

export async function showHelp(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  const text = `<b>${TEXTS.help.title}</b>\n${TEXTS.help.body}\n\nℹ️ Политика конфиденциальности: ${config.site.url}/privacy`;
  await replyOrEdit(ctx, text, helpKeyboard(Boolean(user)));
  await answerCb(ctx);
}

bot.command('help', async (ctx) => showHelp(ctx));

bot.action('help', async (ctx) => showHelp(ctx));
