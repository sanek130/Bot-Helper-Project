import express from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { Homework } from '../../db/models/Homework.js';
import { getClassKey, setSchedulePhotoId } from '../../services/homeworkService.js';
import { uploadPhotoToTelegram, parseImageDataUrl } from '../../services/photoService.js';
import bot from '../../bot/bot.js';

const router = express.Router();
const adminOnly = requireRole(['admin', 'creator']);

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const doc = await Homework.findOne({ classKey: getClassKey(req.user) }).lean();
    if (!doc?.schedulePhotoId) return res.json({ hasSchedule: false });

    return res.json({
      hasSchedule: true,
      photoUrl: `/api/files/${encodeURIComponent(doc.schedulePhotoId)}`,
      updatedAt: doc.updatedAt,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireAuth, adminOnly, async (req, res, next) => {
  try {
    if (!req.user.tgId) return res.status(400).json({ error: 'no_telegram' });

    const image = parseImageDataUrl(req.body?.photo);
    if (!image) return res.status(400).json({ error: 'bad_photo' });

    const fileId = await uploadPhotoToTelegram(bot, req.user.tgId, image, 'Расписание с сайта');
    if (!fileId) return res.status(502).json({ error: 'telegram_unavailable' });

    await setSchedulePhotoId(getClassKey(req.user), fileId);
    return res.json({ ok: true, photoUrl: `/api/files/${encodeURIComponent(fileId)}` });
  } catch (error) {
    return next(error);
  }
});

router.delete('/', requireAuth, adminOnly, async (req, res, next) => {
  try {
    await Homework.updateOne({ classKey: getClassKey(req.user) }, { $unset: { schedulePhotoId: 1 }, $set: { updatedAt: new Date() } });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
