import bot, { replyOrEdit, safeAnswerCb } from '../bot.js';
import { TEXTS } from '../texts.js';
import { helpKeyboard } from '../keyboards.js';
import { getUserByTgId } from '../../services/userService.js';

// Команда /help и кнопка "Помощь"
bot.command('help', async (ctx) => {
  await showHelp(ctx);
});

bot.action('help', async (ctx) => {
  await showHelp(ctx);
});

async function showHelp(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  const isRegistered = !!user;
  
  const msg = `<b>${TEXTS.help.title}</b>\n\n${TEXTS.help.body}`;
  const keyboard = helpKeyboard(isRegistered);
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}
