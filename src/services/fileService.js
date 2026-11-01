import { bot } from '../bot/instance.js';
import { config } from '../config.js';

export async function streamTelegramFile(fileId) {
  try {
    const file = await bot.telegram.getFile(fileId);
    if (!file?.file_path) throw new Error('no_path');
    // URL содержит BOT_TOKEN, поэтому используется только на сервере для проксирования
    // в /api/files/:fileId и никогда не попадает в ответ клиенту.
    const fileUrl = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
    return { filePath: file.file_path, fileUrl, fileSize: file.file_size || null };
  } catch {
    const error = new Error('file_not_found');
    error.code = 'file_not_found';
    throw error;
  }
}

export async function sendPhotoToUser(tgId, fileId, caption = '') {
  return bot.telegram.sendPhoto(tgId, fileId, { caption, parse_mode: 'HTML' });
}
