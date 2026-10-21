import express from 'express';
import { authMiddleware } from '../auth.js';
import bot from '../../bot/bot.js';

const router = express.Router();

// GET /api/file/:fileId - получить файл через Telegram
router.get('/:fileId', authMiddleware, async (req, res) => {
  try {
    const fileId = req.params.fileId;
    
    // Получаем информацию о файле через Telegram
    const file = await bot.telegram.getFile(fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Формируем URL для скачивания
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    
    // Перенаправляем на файл Telegram
    res.redirect(fileUrl);
  } catch (e) {
    console.error('Get file error:', e);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

export default router;
