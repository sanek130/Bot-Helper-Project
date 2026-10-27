import express from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { getClassStats } from '../../services/statsService.js';
import { sendBroadcast } from '../../services/broadcastService.js';
import { getClassKey } from '../../services/homeworkService.js';
import bot from '../../bot/bot.js';

const router = express.Router();
const adminOnly = requireRole(['admin', 'creator']);

router.get('/stats', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const stats = await getClassStats(req.user);
    return res.json({ stats });
  } catch (error) {
    return next(error);
  }
});

// Админ класса рассылает только своему классу: значение target не принимаем с клиента
router.post('/broadcast', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text || text.length > 4000) return res.status(400).json({ error: 'bad_text' });

    const result = await sendBroadcast(bot, {
      target: 'class',
      value: getClassKey(req.user),
      text,
      fromName: req.user.firstName || 'Админ',
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

export default router;
