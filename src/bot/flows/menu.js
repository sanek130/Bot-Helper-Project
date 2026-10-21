import bot, { replyOrEdit, safeAnswerCb } from '../bot.js';
import { TEXTS } from '../texts.js';
import { mainMenuPage1Keyboard, mainMenuPage2Keyboard } from '../keyboards.js';
import { getUserByTgId } from '../../services/userService.js';
import { getClassKey } from '../../services/homeworkService.js';
import { escapeHtml } from '../../utils/normalize.js';

// Команда /menu и кнопка
bot.command('menu', async (ctx) => {
  await showMenuPage1(ctx);
});

bot.action('menu', async (ctx) => {
  await showMenuPage1(ctx);
});

async function showMenuPage1(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user) {
    const msg = `<b>${TEXTS.menu.title}</b>\n\nТы не зарегистрирован. Зарегистрируйся, чтобы видеть ДЗ.`;
    const keyboard = { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.register, callback_data: 'reg_step1' }]] } };
    await safeAnswerCb(ctx);
    await replyOrEdit(ctx, msg, keyboard);
    return;
  }
  
  const body = TEXTS.menu.page1
    .replace('{username}', escapeHtml(user.username || '—'))
    .replace('{role}', user.role === 'admin' ? 'Админ' : user.role === 'creator' ? 'Создатель' : 'Участник')
    .replace('{school}', escapeHtml(user.school || '—'))
    .replace('{class}', escapeHtml(user.class || '—'));
  
  const msg = `<b>${TEXTS.menu.title}</b>\n\n${body}`;
  const isAdmin = user.role === 'admin' || user.role === 'creator';
  const keyboard = mainMenuPage1Keyboard(isAdmin);
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Страница 2 меню
bot.action('menuPage2', async (ctx) => {
  await showMenuPage2(ctx);
});

async function showMenuPage2(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user) {
    await showMenuPage1(ctx);
    return;
  }
  
  const msg = `<b>${TEXTS.menu.page2}</b>`;
  const isAdmin = user.role === 'admin' || user.role === 'creator';
  const keyboard = mainMenuPage2Keyboard(isAdmin);
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

export { showMenuPage1, showMenuPage2 };
