import express from 'express';
import { requireAuth } from '../auth.js';
import bot from '../../bot/bot.js';
import { streamTelegramFile } from '../../services/fileService.js';

const router = express.Router();

router.get('/:fileId', requireAuth, async (req, res) => {
  const fileId = String(req.params.fileId || '');
  if (!fileId || fileId.length > 256) return res.status(400).json({ error: 'bad_file_id' });
  return streamTelegramFile(bot, fileId, res);
});

export default router;
