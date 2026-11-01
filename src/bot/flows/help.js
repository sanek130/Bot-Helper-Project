import { TEXTS } from '../texts.js';
import { getHelpKeyboard } from '../keyboards.js';
import { show } from '../ui.js';
import { getRawUserByTgId } from '../../services/userService.js';

export async function showHelp(ctx) {
  const user = ctx.from ? await getRawUserByTgId(ctx.from.id) : null;
  return show(ctx, TEXTS.HELP, getHelpKeyboard(user));
}

export function helpFlow(bot) {
  bot.help(async (ctx) => showHelp(ctx));
  bot.action('help:open', async (ctx) => showHelp(ctx));
}
