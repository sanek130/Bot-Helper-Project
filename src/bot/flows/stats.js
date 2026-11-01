import { TEXTS } from '../texts.js';
import { getStatsKeyboard } from '../keyboards.js';
import { show } from '../ui.js';
import { requireActive } from '../guards.js';
import { isAdmin } from '../roles.js';
import { getClassStats, getAdminStats, touchUserActivity } from '../../services/statsService.js';
import { fill } from '../../utils/normalize.js';
import { capitalize } from '../../utils/subjects.js';

export async function showStats(ctx) {
  const user = await requireActive(ctx);
  if (!user) return null;
  const stats = await getClassStats(user.school, user.class);
  let text = fill(TEXTS.STATS_CARD, {
    city: user.city,
    school: capitalize(user.school),
    class: user.class,
    classUsers: stats.classUsers,
    homeworkViews: stats.homeworkViews,
    classAdmins: stats.classAdmins,
    yesterdayCount: stats.yesterdayCount,
    todayCount: stats.todayCount,
    dayPercent: stats.dayPercent,
    weekPercent: stats.weekPercent,
  });
  if (isAdmin(user)) {
    const admin = await getAdminStats(user.tgId);
    text += `\n\n${fill(TEXTS.STATS_ADMIN_BLOCK, admin)}`;
  }
  await touchUserActivity(user.tgId);
  return show(ctx, text, getStatsKeyboard(user));
}

export function statsFlow(bot) {
  bot.action('stats:open', async (ctx) => showStats(ctx));
  bot.action('stats:menu', async (ctx) => showStats(ctx));
}
