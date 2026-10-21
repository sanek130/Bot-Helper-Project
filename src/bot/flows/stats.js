import bot, { replyOrEdit, safeAnswerCb } from '../bot.js';
import { TEXTS } from '../texts.js';
import { getUserByTgId, getClassUsers } from '../../services/userService.js';
import { getClassKey } from '../../services/homeworkService.js';
import { escapeHtml } from '../../utils/normalize.js';

// Статистика
bot.action('stats', async (ctx) => {
  await showStats(ctx);
});

async function showStats(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user || (user.role !== 'admin' && user.role !== 'creator')) {
    await safeAnswerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  
  const stats = await (await import('../../services/statsService.js')).getClassStats(user);
  
  if (!stats) {
    await safeAnswerCb(ctx, 'Ошибка получения статистики');
    return;
  }
  
  const adminList = stats.adminStats.map(a => 
    `Админ ${escapeHtml(a.name)}: добавил ДЗ, ${a.added}`
  ).join('\n');
  
  const body = TEXTS.stats.body
    .replace('{city}', escapeHtml(user.city || '—'))
    .replace('{school}', escapeHtml(user.school || '—'))
    .replace('{class}', escapeHtml(user.class || '—'))
    .replace('{classUsers}', stats.classUsers)
    .replace('{homeworkViews}', stats.homeworkViews)
    .replace('{adminCount}', stats.adminCount)
    .replace('{adminList}', adminList)
    .replace('{yesterdayCount}', stats.yesterdayCount)
    .replace('{todayCount}', stats.todayCount)
    .replace('{dayPercent}', stats.dayPercent)
    .replace('{weekPercent}', stats.weekPercent);
  
  const msg = `<b>${TEXTS.stats.title}</b>\n\n${body}`;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.buttons.menu, callback_data: 'menu' }],
        [{ text: TEXTS.buttons.profile, callback_data: 'profile' }],
        [{ text: TEXTS.buttons.help, callback_data: 'help' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

export { showStats };
