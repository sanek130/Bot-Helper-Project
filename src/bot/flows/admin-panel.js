import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import { adminPanelKeyboard, reportActionsKeyboard } from '../keyboards.js';
import { getUserByTgId, searchUsers } from '../../services/userService.js';
import { getAdminStats } from '../../services/statsService.js';
import { Report } from '../../db/models/Report.js';
import { escapeHtml } from '../../utils/normalize.js';

export async function showAdminPanel(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered);
    return;
  }
  if (user.role !== 'admin' && user.role !== 'creator') {
    await replyOrEdit(ctx, TEXTS.errors.noPermission);
    return;
  }

  const stats = await getAdminStats(user);
  const body = TEXTS.adminPanel.body
    .replace('{warns}', stats.warns)
    .replace('{myCount}', stats.myAdded)
    .replace('{othersCount}', stats.othersAdded);

  await replyOrEdit(ctx, `<b>${TEXTS.adminPanel.title}</b>\n${body}`, adminPanelKeyboard(user));
}

async function showReports(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user || user.role !== 'creator') {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return;
  }

  const reports = await Report.find({ status: 'open' }).sort({ createdAt: 1 }).limit(10);

  if (!reports.length) {
    await answerCb(ctx);
    await ctx.reply('Открытых жалоб нет.', { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.menu, callback_data: 'menu1' }]] } });
    return;
  }

  for (const report of reports) {
    const from = await getUserByTgId(report.fromUserId);
    const onAdmin = await getUserByTgId(report.onAdminId);
    const text = `${TEXTS.complaints.creatorTitle}\n${TEXTS.complaints.creatorBody
      .replace('{from}', escapeHtml(from?.firstName || report.fromUserId))
      .replace('{on}', escapeHtml(onAdmin?.firstName || report.onAdminId))
      .replace('{classKey}', escapeHtml(report.classKey))
      .replace('{date}', new Date(report.createdAt).toLocaleString('ru-RU'))
      .replace('{text}', escapeHtml(report.text))}`;

    await ctx.reply(text, { parse_mode: 'HTML', ...reportActionsKeyboard(String(report._id)) });
  }

  await answerCb(ctx);
}

async function showUsers(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user || user.role !== 'creator') {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return;
  }

  const users = await searchUsers('', 30);
  const lines = users.map((item) => {
    const name = item.username ? `@${escapeHtml(item.username)}` : escapeHtml(item.firstName || '—');
    return `${name} · ${TEXTS.roles[item.role]} · ${escapeHtml(item.school || '—')}, ${escapeHtml(item.class)} · варны ${item.warns}`;
  });

  await answerCb(ctx);
  await ctx.reply(`<b>Пользователи (${users.length})</b>\n\n${lines.join('\n') || '—'}`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.menu, callback_data: 'menu1' }]] },
  });
}

bot.action('adm:panel', async (ctx) => {
  await answerCb(ctx);
  await showAdminPanel(ctx);
});

bot.action('adm:reports', async (ctx) => showReports(ctx));
bot.action('adm:users', async (ctx) => showUsers(ctx));
