import { Readable } from 'node:stream';

// Файлы Telegram отдаются только через сервер: токен и прямые ссылки
// никогда не попадают в ответы API и логи.
export async function streamTelegramFile(bot, fileId, res) {
  try {
    const file = await bot.telegram.getFile(fileId);
    if (!file?.file_path) {
      return res.status(404).json({ error: 'file_not_found' });
    }

    const url = `https://api.telegram.org/file/bot${bot.telegram.token}/${file.file_path}`;
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      return res.status(502).json({ error: 'telegram_unavailable' });
    }

    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    Readable.fromWeb(response.body).pipe(res);
    return undefined;
  } catch (error) {
    console.error('Не удалось отдать файл:', error.message);
    if (!res.headersSent) res.status(500).json({ error: 'file_error' });
    return undefined;
  }
}

// Скачать фото в память (например, чтобы переслать его дальше)
export async function downloadTelegramFile(bot, fileId) {
  const file = await bot.telegram.getFile(fileId);
  if (!file?.file_path) return null;

  const url = `https://api.telegram.org/file/bot${bot.telegram.token}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}
