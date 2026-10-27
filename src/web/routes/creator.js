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
  promoteUser,
  deleteAccount,
  getUserBySpecId,
} from '../../services/userService.js';
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

router.post('/users/:specId/warn', async (req, res, next) => {
  try {
    const user = await getUserBySpecId(req.params.specId);
    if (!user || !user.tgId) return res.status(404).json({ error: 'not_found' });

    const updated = await giveWarn(user.tgId);
    if (!updated) return res.status(404).json({ error: 'not_found' });

    if (updated.role === 'user' && updated.adminBanned) {
      await bot.telegram.sendMessage(updated.tgId, 'Ты получил три предупреждения и больше не можешь быть админом.').catch(() => {});
    } else {
      await bot.telegram.sendMessage(updated.tgId, `Тебе выдано предупреждение. Всего: ${updated.warns} из 3.`).catch(() => {});
    }

    return res.json({ user: publicUser(updated) });
  } catch (error) {
    return next(error);
  }
});

router.post('/users/:specId/demote', async (req, res, next) => {
  try {
    const user = await getUserBySpecId(req.params.specId);
    if (!user || !user.tgId) return res.status(404).json({ error: 'not_found' });

    const updated = await demoteUser(user.tgId);
    await bot.telegram.sendMessage(user.tgId, 'Ты понижен до участника решением создателя.').catch(() => {});
    return res.json({ user: publicUser(updated) });
  } catch (error) {
    return next(error);
  }
});

router.post('/users/:specId/promote', async (req, res, next) => {
  try {
    const user = await getUserBySpecId(req.params.specId);
    if (!user || !user.tgId) return res.status(404).json({ error: 'not_found' });

    const updated = await promoteUser(user.tgId);
    return res.json({ user: publicUser(updated) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/users/:specId', async (req, res, next) => {
  try {
    const result = await deleteAccount(req.params.specId);
    return res.json({ ok: result });
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
