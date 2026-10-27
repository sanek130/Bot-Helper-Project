import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import { statsKeyboard } from '../keyboards.js';
import { getUserByTgId } from '../../services/userService.js';
import { getClassStats } from '../../services/statsService.js';
import { escapeHtml } from '../../utils/normalize.js';

export async function showStats(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered);
    return;
  }

  const stats = await getClassStats(user);
  let body = TEXTS.stats.body
    .replace('{city}', escapeHtml(stats.city || '—'))
    .replace('{school}', escapeHtml(stats.school || '—'))
    .replace('{class}', escapeHtml(stats.className || '—'))
    .replace('{classUsers}', stats.classUsers)
    .replace('{homeworkViews}', stats.homeworkViews)
    .replace('{yesterdayCount}', stats.yesterdayCount)
    .replace('{todayCount}', stats.todayCount)
    .replace('{dayPercent}', stats.dayPercent)
    .replace('{weekPercent}', stats.weekPercent);

  if (user.role === 'admin' || user.role === 'creator') {
    const adminList = stats.admins.length
      ? stats.admins.map((admin) => TEXTS.stats.adminLine.replace('{name}', escapeHtml(admin.name)).replace('{count}', admin.added)).join('\n')
      : '—';
    body += `\n\n${TEXTS.stats.adminsBlock.replace('{adminCount}', stats.adminCount).replace('{adminList}', adminList)}`;
  }

  await replyOrEdit(ctx, `<b>${TEXTS.stats.title}</b>\n${body}`, statsKeyboard(user));
}

bot.action('stats', async (ctx) => {
  await answerCb(ctx);
  await showStats(ctx);
});
