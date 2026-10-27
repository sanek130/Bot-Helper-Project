import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import { complaintsAdminKeyboard, reportActionsKeyboard } from '../keyboards.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { getUserByTgId, getClassAdmins, getCreators } from '../../services/userService.js';
import { getClassKey } from '../../services/homeworkService.js';
import { giveWarn, demoteUser } from '../../services/userService.js';
import { Report } from '../../db/models/Report.js';
import { escapeHtml } from '../../utils/normalize.js';
import config from '../../config.js';

const MIN_TEXT = 10;
const MAX_TEXT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function creatorIds() {
  const ids = new Set(config.moderators.ids);
  for (const creator of await getCreators()) {
    if (creator.tgId) ids.add(creator.tgId);
  }
  return [...ids];
}

export async function startComplaint(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered);
    return;
  }

  const admins = await getClassAdmins(getClassKey(user));
  if (!admins.length) {
    await answerCb(ctx);
    await replyOrEdit(ctx, TEXTS.complaints.noAdmins, {
      reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.menu, callback_data: 'menu1' }]] },
    });
    return;
  }

  await setSession(ctx.from.id, 'cmp:admin', {
    admins: admins.map((admin) => ({ specId: admin.specId, tgId: admin.tgId, name: admin.firstName || 'Админ', className: admin.class })),
  });
  await answerCb(ctx);
  await replyOrEdit(ctx, TEXTS.complaints.chooseAdmin, complaintsAdminKeyboard(
    admins.map((admin) => ({ firstName: admin.firstName || 'Админ', class: admin.class }))
  ));
}

export async function handleComplaintText(ctx, session) {
  if (session.step !== 'cmp:text') return false;

  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return false;

  const text = ctx.message.text.trim();
  if (text.length < MIN_TEXT || text.length > MAX_TEXT) {
    await ctx.reply(TEXTS.complaints.tooShort);
    return true;
  }

  await setSession(ctx.from.id, 'cmp:confirm', {
    ...session.data,
    text,
  });

  await replyOrEdit(
    ctx,
    `Проверь жалобу перед отправкой:\n\n${escapeHtml(text)}\n\nОтправить создателю?`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }, { text: TEXTS.buttons.send, callback_data: 'cmp:send' }],
        ],
      },
    }
  );
  return true;
}

export async function sendComplaint(ctx) {
  const session = await getSession(ctx.from.id);
  const user = await getUserByTgId(ctx.from?.id);
  if (!user || !session.data.text) {
    await answerCb(ctx, TEXTS.errors.noSession);
    await startComplaint(ctx);
    return;
  }

  const since = new Date(Date.now() - DAY_MS);
  const existing = await Report.findOne({
    fromUserId: String(user.tgId),
    onAdminId: String(session.data.adminTgId),
    createdAt: { $gt: since },
  });

  if (existing) {
    await clearSession(ctx.from.id);
    await answerCb(ctx, TEXTS.complaints.dailyLimit);
    return;
  }

  const report = await Report.create({
    fromUserId: String(user.tgId),
    onAdminId: String(session.data.adminTgId),
    classKey: getClassKey(user),
    text: session.data.text,
    status: 'open',
  });

  await clearSession(ctx.from.id);
  await answerCb(ctx, TEXTS.complaints.sent);

  const card = `${TEXTS.complaints.creatorTitle}\n${TEXTS.complaints.creatorBody
    .replace('{from}', escapeHtml(user.firstName || String(user.tgId)))
    .replace('{on}', escapeHtml(session.data.adminName || String(session.data.adminTgId)))
    .replace('{classKey}', escapeHtml(getClassKey(user)))
    .replace('{date}', new Date().toLocaleString('ru-RU'))
    .replace('{text}', escapeHtml(session.data.text))}`;

  for (const tgId of await creatorIds()) {
    try {
      await bot.telegram.sendMessage(tgId, card, { parse_mode: 'HTML', ...reportActionsKeyboard(String(report._id)) });
    } catch {
      // создатель мог не начинать чат с ботом
    }
  }

  await replyOrEdit(ctx, TEXTS.complaints.sent, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.menu, callback_data: 'menu1' }]] },
  });
}

export async function handleReportAction(ctx, action, reportId) {
  const creator = await getUserByTgId(ctx.from?.id);
  if (!creator || creator.role !== 'creator') {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return;
  }

  const report = await Report.findById(reportId);
  if (!report || report.status !== 'open') {
    await answerCb(ctx, 'Жалоба уже рассмотрена');
    return;
  }

  const admin = await getUserByTgId(report.onAdminId);
  if (!admin) {
    await answerCb(ctx, 'Админ не найден');
    return;
  }

  if (action === 'warn') {
    const updated = await giveWarn(admin.tgId);
    if (!updated) return;
    const banned = updated.role === 'user' && updated.adminBanned;
    report.status = 'resolved';
    report.resolvedBy = creator.specId;
    report.resolvedAt = new Date();
    await report.save();

    await answerCb(ctx, TEXTS.complaints.warned.replace('{warns}', updated.warns));
    await notifyAdmin(admin.tgId, updated.warns, banned);
    return;
  }

  if (action === 'reject') {
    report.status = 'rejected';
    report.resolvedBy = creator.specId;
    report.resolvedAt = new Date();
    await report.save();
    await answerCb(ctx, TEXTS.complaints.rejected);
    return;
  }

  if (action === 'demote') {
    await demoteUser(admin.tgId);
    report.status = 'resolved';
    report.resolvedBy = creator.specId;
    report.resolvedAt = new Date();
    await report.save();
    await answerCb(ctx, TEXTS.complaints.demoted);

    try {
      await bot.telegram.sendMessage(admin.tgId, 'Ты понижен до участника решением создателя.');
    } catch {
      // ignore
    }
  }
}

async function notifyAdmin(tgId, warns, banned) {
  try {
    if (banned) {
      await bot.telegram.sendMessage(tgId, TEXTS.profile.adminBanned);
    } else {
      await bot.telegram.sendMessage(tgId, `Тебе выдано предупреждение. Всего: ${warns} из 3.`);
    }
  } catch {
    // ignore
  }
}

bot.action('cmp:start', async (ctx) => startComplaint(ctx));

bot.action(/^cmp:admin:(\d+)$/, async (ctx) => {
  const session = await getSession(ctx.from.id);
  const admin = session.data.admins?.[Number(ctx.match[1])];
  if (!admin) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    await startComplaint(ctx);
    return;
  }

  await answerCb(ctx);
  await setSession(ctx.from.id, 'cmp:text', {
    adminTgId: admin.tgId,
    adminName: admin.name,
  });
  await replyOrEdit(ctx, TEXTS.complaints.prompt, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]] },
  });
});

bot.action('cmp:send', async (ctx) => sendComplaint(ctx));

bot.action(/^rep:(warn|reject|demote):([0-9a-f]{24})$/, async (ctx) => {
  await handleReportAction(ctx, ctx.match[1], ctx.match[2]);
});
