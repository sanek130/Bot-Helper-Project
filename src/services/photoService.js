import { bot } from '../bot/instance.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// Сайт не хранит файлы у себя: фото загружается в Telegram (сообщением самому пользователю),
// из ответа берётся file_id, а служебное сообщение сразу удаляется.
export async function uploadPhotoToTelegram(buffer, tgId, mimeType = 'image/jpeg') {
  if (!tgId) throw fail('telegram_required');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw fail('empty_file');
  if (buffer.length > MAX_UPLOAD_BYTES) throw fail('file_too_large');
  if (!ALLOWED.includes(mimeType)) throw fail('unsupported_type');
  const message = await bot.telegram.sendPhoto(tgId, { source: buffer }, { disable_notification: true });
  const sizes = message?.photo || [];
  const fileId = sizes.length > 0 ? sizes[sizes.length - 1].file_id : null;
  try {
    await bot.telegram.deleteMessage(tgId, message.message_id);
  } catch {
    // Удаление не критично: фото уже сохранено в Telegram.
  }
  if (!fileId) throw fail('upload_failed');
  return fileId;
}

export function decodeBase64Image(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw fail('invalid_image');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) throw fail('file_too_large');
  return { mimeType: match[1], buffer };
}
