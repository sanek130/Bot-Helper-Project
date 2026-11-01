import https from 'node:https';
import { Router } from 'express';
import { streamTelegramFile } from '../../services/fileService.js';

export const filesRouter = Router();

const FILE_ID_RE = /^[\w-]{10,200}$/;
const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
};

function mimeFor(filePath) {
  const ext = String(filePath).split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

filesRouter.get('/:fileId', async (req, res) => {
  const { fileId } = req.params;
  if (!FILE_ID_RE.test(fileId)) return res.status(404).json({ error: 'file_not_found' });
  let file;
  try {
    file = await streamTelegramFile(fileId);
  } catch {
    return res.status(404).json({ error: 'file_not_found' });
  }
  // URL с токеном бота используется только здесь, внутри сервера; клиент получает лишь байты файла.
  const upstream = https.get(file.fileUrl, (tgRes) => {
    if (tgRes.statusCode !== 200) {
      tgRes.resume();
      if (!res.headersSent) res.status(404).json({ error: 'file_not_found' });
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Type', mimeFor(file.filePath));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (tgRes.headers['content-length']) res.setHeader('Content-Length', tgRes.headers['content-length']);
    tgRes.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: 'file_unavailable' });
    else res.end();
  });
  req.on('close', () => upstream.destroy());
  return null;
});
