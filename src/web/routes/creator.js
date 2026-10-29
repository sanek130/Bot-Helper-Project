import express from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { User } from '../../db/models/User.js';
import { Report } from '../../db/models/Report.js';
import bot from '../../bot/bot.js';
import {
  searchUsers,
  publicUser,
  giveWarn,
  demoteUser,
  deleteAccount,
  getUserBySpecId,
  canModerate,
  warnUser,
  resetWarns,
  setRole,
  banUser,
  unbanUser,
} from '../../services/userService.js';
import {
  listTickets,
  addSupportReply,
  closeTicket,
  publicTicket,
  countOpenTickets,
} from '../../services/supportService.js';
import { notifyUser } from '../../bot/notify.js';
import { deliverSupportReply } from '../../bot/flows/support.js';
import { banNotice } from '../../bot/flows/creator.js';
import { TEXTS } from '../../bot/texts.js';
import { sendBroadcast } from '../../services/broadcastService.js';
import { escapeHtml } from '../../utils/normalize.js';

const router = express.Router();
const creatorOnly = requireRole(['creator']);

router.use(requireAuth, creatorOnly);

router.get('/users', async (req, res, next) => {
  try {
    const users = await searchUsers(String(req.query.q || ''), 100);
    return res.json({ users: users.map(publicUser) });
  } catch (error) {
    return next(error);
  }
});

// Все действия над пользователем: создателей модерировать нельзя
async function loadTarget(req, res) {
  const target = await getUserBySpecId(req.params.specId);
  if (!target) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  if (!canModerate(req.user, target)) {
    res.status(403).json({ error: 'protected_user' });
    return null;
  }
  return target;
}

function userAction(handler) {
  return async (req, res, next) => {
    try {
      const target = await loadTarget(req, res);
      if (!target) return undefined;
      const updated = await handler(target, req);
      return res.json({ user: publicUser(updated) });
    } catch (error) {
      return next(error);
    }
  };
}

router.post('/users/:specId/warn', userAction(async (target) => {
  const updated = await warnUser(target.specId);
  await notifyUser(updated, TEXTS.creator.userWarned.replace('{warns}', updated.warns));
  return updated;
}));

router.post('/users/:specId/unwarn', userAction(async (target) => resetWarns(target.specId)));

router.post('/users/:specId/promote', userAction(async (target) => {
  if (target.banned) {
    const error = new Error('banned');
    error.status = 400;
    error.code = 'user_banned';
    throw error;
  }
  const updated = await setRole(target.specId, 'admin');
  await notifyUser(updated, TEXTS.creator.userPromoted);
  return updated;
}));

router.post('/users/:specId/demote', userAction(async (target) => {
  const updated = await setRole(target.specId, 'user');
  await notifyUser(updated, TEXTS.creator.userDemoted);
  return updated;
}));

router.post('/users/:specId/ban', userAction(async (target, req) => {
  const reason = String(req.body?.reason || '').trim().slice(0, 300);
  const updated = await banUser(target.specId, { reason, by: req.user.specId });
  await notifyUser(updated, banNotice(updated));
  return updated;
}));

router.post('/users/:specId/unban', userAction(async (target) => {
  const updated = await unbanUser(target.specId);
  await notifyUser(updated, TEXTS.creator.userUnbanned);
  return updated;
}));

router.delete('/users/:specId', async (req, res, next) => {
  try {
    const target = await loadTarget(req, res);
    if (!target) return undefined;
    const result = await deleteAccount(target.specId);
    return res.json({ ok: result });
  } catch (error) {
    return next(error);
  }
});

router.get('/overview', async (req, res, next) => {
  try {
    const [users, admins, banned, reports, tickets] = await Promise.all([
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ banned: true }),
      Report.countDocuments({ status: 'open' }),
      countOpenTickets(),
    ]);
    return res.json({ users, admins, banned, reports, tickets });
  } catch (error) {
    return next(error);
  }
});

router.get('/support', async (req, res, next) => {
  try {
    const status = ['open', 'closed', 'all'].includes(req.query.status) ? req.query.status : 'open';
    const tickets = await listTickets({ status, limit: 100 });
    const data = [];
    for (const ticket of tickets) {
      data.push(publicTicket(ticket, await getUserBySpecId(ticket.userSpecId)));
    }
    return res.json({ tickets: data });
  } catch (error) {
    return next(error);
  }
});

router.post('/support/:id/reply', async (req, res, next) => {
  try {
    const result = await addSupportReply(req.params.id, req.user, req.body?.text);
    if (!result.ok) return res.status(result.error === 'not_found' ? 404 : 400).json({ error: result.error });
    await deliverSupportReply(result.user, result.text);
    return res.json({ ticket: publicTicket(result.ticket, result.user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/support/:id/close', async (req, res, next) => {
  try {
    const result = await closeTicket(req.params.id, req.user);
    if (!result.ok && result.error === 'not_found') return res.status(404).json({ error: 'not_found' });
    if (result.ok) await notifyUser(result.user, TEXTS.support.closed);
    return res.json({ ticket: publicTicket(result.ticket, result.user) });
  } catch (error) {
    return next(error);
  }
});

router.get('/reports', async (req, res, next) => {
  try {
    const status = ['open', 'resolved', 'rejected'].includes(req.query.status) ? req.query.status : 'open';
    const reports = await Report.find({ status }).sort({ createdAt: -1 }).limit(100);

    const data = [];
    for (const report of reports) {
      const from = await getUserBySpecId(report.fromUserId) || await User.findOne({ tgId: Number(report.fromUserId) });
      const onAdmin = await User.findOne({ tgId: Number(report.onAdminId) });
      data.push({
        id: String(report._id),
        text: report.text,
        status: report.status,
        classKey: report.classKey,
        createdAt: report.createdAt,
        from: from ? publicUser(from) : null,
        onAdmin: onAdmin ? publicUser(onAdmin) : null,
      });
    }

    return res.json({ reports: data });
  } catch (error) {
    return next(error);
  }
});

async function resolveReport(req, res, action) {
  const report = await Report.findById(req.params.id);
  if (!report || report.status !== 'open') return res.status(409).json({ error: 'already_resolved' });

  const admin = await User.findOne({ tgId: Number(report.onAdminId) });
  if (!admin) return res.status(404).json({ error: 'admin_not_found' });

  if (action === 'warn') {
    const updated = await giveWarn(admin.tgId);
    report.status = 'resolved';
    report.resolvedBy = req.user.specId;
    report.resolvedAt = new Date();
    await report.save();
    await bot.telegram.sendMessage(
      admin.tgId,
      updated.adminBanned ? 'Ты получил три предупреждения и больше не можешь быть админом.' : `Тебе выдано предупреждение. Всего: ${updated.warns} из 3.`
    ).catch(() => {});
    return res.json({ ok: true, user: publicUser(updated) });
  }

  if (action === 'demote') {
    await demoteUser(admin.tgId);
    report.status = 'resolved';
    report.resolvedBy = req.user.specId;
    report.resolvedAt = new Date();
    await report.save();
    await bot.telegram.sendMessage(admin.tgId, 'Ты понижен до участника решением создателя.').catch(() => {});
    return res.json({ ok: true });
  }

  report.status = 'rejected';
  report.resolvedBy = req.user.specId;
  report.resolvedAt = new Date();
  await report.save();
  return res.json({ ok: true });
}

router.post('/reports/:id/warn', async (req, res, next) => {
  try {
    return await resolveReport(req, res, 'warn');
  } catch (error) {
    return next(error);
  }
});

router.post('/reports/:id/demote', async (req, res, next) => {
  try {
    return await resolveReport(req, res, 'demote');
  } catch (error) {
    return next(error);
  }
});

router.post('/reports/:id/reject', async (req, res, next) => {
  try {
    return await resolveReport(req, res, 'reject');
  } catch (error) {
    return next(error);
  }
});

router.post('/broadcast', async (req, res, next) => {
  try {
    const { target, value, text } = req.body || {};
    if (!['all', 'city', 'school', 'class'].includes(target)) return res.status(400).json({ error: 'bad_target' });
    if (!text || String(text).length > 4000) return res.status(400).json({ error: 'bad_text' });
    if (target !== 'all' && !value) return res.status(400).json({ error: 'missing_value' });

    const result = await sendBroadcast(bot, { target, value, text: String(text) });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.get('/audiences', async (req, res, next) => {
  try {
    const cities = (await User.distinct('city')).filter(Boolean).sort();
    const schools = (await User.distinct('school')).filter(Boolean).sort();
    const users = await User.find({ school: { $nin: [null, ''] }, class: { $nin: [null, ''] } }).select('school class').lean();
    const classes = [...new Set(users.map((user) => `${user.school}::${user.class}`))].sort();
    return res.json({ cities, schools, classes });
  } catch (error) {
    return next(error);
  }
});

export { escapeHtml };
export default router;
