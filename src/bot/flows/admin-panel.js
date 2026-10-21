import bot, { replyOrEdit, safeAnswerCb } from '../bot.js';
import { TEXTS } from '../texts.js';
import { adminPanelKeyboard } from '../keyboards.js';
import { getUserByTgId } from '../../services/userService.js';
import { getAdminStats } from '../../services/statsService.js';
import { escapeHtml } from '../../utils/normalize.js';

// Админ-панель
bot.action('adminPanel', async (ctx) => {
  await showAdminPanel(ctx);
});

async function showAdminPanel(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user || (user.role !== 'admin' && user.role !== 'creator')) {
    await safeAnswerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  
  const stats = await getAdminStats(user);
  
  if (!stats) {
    await safeAnswerCb(ctx, 'Ошибка получения статистики');
    return;
  }
  
  const body = TEXTS.adminPanel.body
    .replace('{warns}', stats.warns)
    .replace('{myCount}', stats.myAdded)
    .replace('{othersCount}', stats.othersAdded);
  
  const msg = `<b>${TEXTS.adminPanel.title}</b>\n\n${body}`;
  const isCreator = user.role === 'creator';
  const keyboard = adminPanelKeyboard(isCreator);
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

export { showAdminPanel };
