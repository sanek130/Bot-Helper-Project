import { Input } from 'telegraf';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;

  const mime = match[1];
  if (!ALLOWED.has(mime)) return null;

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;

  return { buffer, mime, extension: mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1] };
}

// Загружаем фото в Telegram и получаем file_id — единственный способ
// хранить картинки без файловой системы сервера.
export async function uploadPhotoToTelegram(bot, tgId, image, caption) {
  const message = await bot.telegram.sendPhoto(
    tgId,
    Input.fromBuffer(image.buffer, `photo.${image.extension}`),
    caption ? { caption } : {}
  );

  const sizes = message.photo || [];
  return sizes[sizes.length - 1]?.file_id || null;
}
