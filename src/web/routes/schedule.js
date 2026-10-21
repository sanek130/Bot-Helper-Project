import express from 'express';
import { authMiddleware, roleMiddleware } from '../auth.js';
import { User } from '../../db/models/User.js';
import { Homework } from '../../db/models/Homework.js';
import { getClassKey } from '../../services/homeworkService.js';
import bot from '../../bot/bot.js';

const router = express.Router();

// GET /api/schedule - получить расписание
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ specId: req.userId });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const classKey = getClassKey(user);
    
    // Находим расписание (ищем любое ДЗ с schedulePhotoId)
    const homework = await Homework.findOne({ classKey, schedulePhotoId: { $exists: true } });
    
    if (!homework || !homework.schedulePhotoId) {
      return res.json({ hasSchedule: false });
    }
    
    // Генерируем временную ссылку на фото через Telegram
    const photoUrl = `/api/file/${homework.schedulePhotoId}`;
    
    res.json({
      hasSchedule: true,
      photoUrl,
      updatedAt: homework.updatedAt
    });
  } catch (e) {
    console.error('Get schedule error:', e);
    res.status(500).json({ error: 'Failed to get schedule' });
  }
});

// POST /api/schedule - загрузить расписание (админ)
router.post('/', authMiddleware, roleMiddleware(['admin', 'creator']), async (req, res) => {
  try {
    const { photoId } = req.body;
    
    const user = await User.findOne({ specId: req.userId });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const classKey = getClassKey(user);
    
    // Обновляем schedulePhotoId во всех ДЗ класса
    await Homework.updateMany(
      { classKey },
      { schedulePhotoId: photoId, updatedAt: new Date() }
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error('Upload schedule error:', e);
    res.status(500).json({ error: 'Failed to upload schedule' });
  }
});

// DELETE /api/schedule - удалить расписание (админ)
router.delete('/', authMiddleware, roleMiddleware(['admin', 'creator']), async (req, res) => {
  try {
    const user = await User.findOne({ specId: req.userId });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const classKey = getClassKey(user);
    
    await Homework.updateMany(
      { classKey },
      { $unset: { schedulePhotoId: 1 }, updatedAt: new Date() }
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error('Delete schedule error:', e);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

export default router;
