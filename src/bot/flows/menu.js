import bot, { answerCb, replyOrEdit, isAdmin } from '../bot.js';
import { TEXTS } from '../texts.js';
import { menuPage1Keyboard, menuPage2Keyboard, webAppButton } from '../keyboards.js';
import { getUserByTgId } from '../../services/userService.js';
import { escapeHtml } from '../../utils/normalize.js';

export async function showMenuPage1(ctx, greeting = '') {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered, {
      reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.register, callback_data: 'reg:start' }], [{ text: TEXTS.buttons.help, callback_data: 'help' }]] },
    });
    return;
  }

  const body = TEXTS.menu.page1
    .replace('{name}', escapeHtml(user.firstName || user.username || 'друг'))
    .replace('{role}', TEXTS.roles[user.role] || TEXTS.roles.user)
    .replace('{school}', escapeHtml(user.school || '—'))
    .replace('{class}', escapeHtml(user.class || '—'));

  const prefix = greeting ? `${greeting}\n\n` : '';
  const message = `${prefix}<b>${TEXTS.menu.title}</b>\n${body}`;

  await replyOrEdit(ctx, message, menuPage1Keyboard(user));
}

export async function showMenuPage2(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await showMenuPage1(ctx);
    return;
  }

  await replyOrEdit(ctx, `<b>${TEXTS.menu.page2}</b>`, menuPage2Keyboard(user));
}

bot.command('menu', async (ctx) => {
  await showMenuPage1(ctx);
});

bot.action('menu1', async (ctx) => {
  await answerCb(ctx);
  await showMenuPage1(ctx);
});

bot.action('menu2', async (ctx) => {
  await answerCb(ctx);
  await showMenuPage2(ctx);
});

bot.action('noop', async (ctx) => {
  await answerCb(ctx);
});

bot.action('web', async (ctx) => {
  const config = (await import('../../config.js')).default;
  await answerCb(ctx);
  await replyOrEdit(ctx, `🌐 ${TEXTS.buttons.web}: ${config.site.url}`, {
    reply_markup: { inline_keyboard: [[{ text: 'Открыть сайт', url: config.site.url }], [{ text: TEXTS.buttons.menu, callback_data: 'menu1' }]] },
  });
});

export { isAdmin };


bot.command('web', async (ctx) => {
  const config = (await import('../../config.js')).default;
  await ctx.reply(`🌐 ${TEXTS.buttons.web}: ${config.site.url}`, {
    reply_markup: { inline_keyboard: [[{ text: 'Открыть сайт', url: config.site.url }]] },
  });
});

bot.action('max', async (ctx) => {
  await answerCb(ctx, TEXTS.max.soon);
});

bot.command('app', async (ctx) => {
  const config = (await import('../../config.js')).default;
  const app = webAppButton('📱 Открыть приложение');
  if (!app) {
    await ctx.reply(`Мини-приложение доступно, когда сайт работает по https. Пока открой сайт: ${config.site.url}`);
    return;
  }
  await ctx.reply('📱 Мини-приложение: ДЗ, расписание, профиль и поддержка в одном окне.', {
    reply_markup: { inline_keyboard: [[app]] },
  });
});
