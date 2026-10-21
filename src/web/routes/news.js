import express from 'express';
import { News } from '../../db/models/News.js';

const router = express.Router();

// GET /api/news - получить новости
router.get('/', async (req, res) => {
  try {
    const news = await News.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title text createdAt');
    
    res.json({ news });
  } catch (e) {
    console.error('Get news error:', e);
    res.status(500).json({ error: 'Failed to get news' });
  }
});

export default router;
