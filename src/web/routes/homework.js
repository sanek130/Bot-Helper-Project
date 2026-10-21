import express from 'express';
import { authMiddleware, roleMiddleware } from '../auth.js';
import { User } from '../../db/models/User.js';
import { Homework } from '../../db/models/Homework.js';
import { getClassKey } from '../../services/homeworkService.js';
import { formatDateForDB } from '../../services/dateService.js';
import { SUBJECT_ICONS } from '../../utils/subjects.js';

const router = express.Router();

// GET /api/homework - получить ДЗ на дату
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ specId: req.userId });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const classKey = getClassKey(user);
    const date = req.query.date || formatDateForDB(new Date());
    
    const homework = await Homework.findOne({ classKey, date });
    
    const result = {
      classKey,
      date,
      homework: homework?.data || {},
      completed: user.completedHomework || {}
    };
    
    res.json(result);
  } catch (e) {
    console.error('Get homework error:', e);
    res.status(500).json({ error: 'Failed to get homework' });
  }
});

// POST /api/homework/check - отметить ДЗ выполненным
router.post('/check', authMiddleware, async (req, res) => {
  try {
    const { date, subject, done } = req.body;
    
    const user = await User.findOne({ specId: req.userId });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (!user.completedHomework) {
      user.completedHomework = {};
    }
    
    if (!user.completedHomework[date]) {
      user.completedHomework[date] = [];
    }
    
    if (done) {
      if (!user.completedHomework[date].includes(subject)) {
        user.completedHomework[date].push(subject);
      }
    } else {
      user.completedHomework[date] = user.completedHomework[date].filter(s => s !== subject);
    }
    
    await user.save();
    
    res.json({ success: true });
  } catch (e) {
    console.error('Check homework error:', e);
    res.status(500).json({ error: 'Failed to update homework' });
  }
});

// GET /api/homework/copy - получить текст ДЗ для копирования
router.get('/copy', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ specId: req.userId });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const classKey = getClassKey(user);
    const date = req.query.date || formatDateForDB(new Date());
    
    const homework = await Homework.findOne({ classKey, date });
    
    if (!homework || !homework.data) {
      return res.json({ text: '' });
    }
    
    const lines = [];
    Object.entries(homework.data).forEach(([subject, data]) => {
      const icon = SUBJECT_ICONS[subject] || '📝';
      lines.push(`${icon} ${subject}: ${data.text || ''}`);
    });
    
    res.json({ text: lines.join('\n') });
  } catch (e) {
    console.error('Copy homework error:', e);
    res.status(500).json({ error: 'Failed to copy homework' });
  }
});

// POST /api/homework - добавить ДЗ (админ)
router.post('/', authMiddleware, roleMiddleware(['admin', 'creator']), async (req, res) => {
  try {
    const { date, subject, text, photos } = req.body;
    
    const user = await User.findOne({ specId: req.userId });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const classKey = getClassKey(user);
    
    const homework = await Homework.findOneAndUpdate(
      { classKey, date },
      {
        classKey,
        date,
        $set: {
          [`data.${subject}`]: { text, photos: photos || [] }
        },
        $setOnInsert: { data: {} },
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, homework });
  } catch (e) {
    console.error('Add homework error:', e);
    res.status(500).json({ error: 'Failed to add homework' });
  }
});

// DELETE /api/homework - удалить ДЗ (админ)
router.delete('/', authMiddleware, roleMiddleware(['admin', 'creator']), async (req, res) => {
  try {
    const { date, subject } = req.body;
    
    const user = await User.findOne({ specId: req.userId });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const classKey = getClassKey(user);
    
    const homework = await Homework.findOne({ classKey, date });
    
    if (!homework) {
      return res.status(404).json({ error: 'Homework not found' });
    }
    
    delete homework.data[subject];
    homework.updatedAt = new Date();
    
    if (Object.keys(homework.data).length === 0) {
      await Homework.deleteOne({ classKey, date });
    } else {
      await homework.save();
    }
    
    res.json({ success: true });
  } catch (e) {
    console.error('Delete homework error:', e);
    res.status(500).json({ error: 'Failed to delete homework' });
  }
});

export default router;
