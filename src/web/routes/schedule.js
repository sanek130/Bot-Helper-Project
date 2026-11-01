import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { asyncRoute, resolveClassKey, sendClassError, errorCode } from '../helpers.js';
import { getSchedulePhoto, setSchedulePhoto } from '../../services/homeworkService.js';
import { uploadPhotoToTelegram, decodeBase64Image } from '../../services/photoService.js';

export const scheduleRouter = Router();

const STAFF = ['admin', 'creator', 'moderator'];
const PHOTO_ID_RE = /^[\w-]{10,200}$/;

scheduleRouter.use(requireAuth);

scheduleRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const resolved = resolveClassKey(req.user, req.query);
    if (resolved.error) return sendClassError(res, resolved.error);
    const photoId = await getSchedulePhoto(resolved.classKey);
    return res.json({ classKey: resolved.classKey, photoId: photoId || null });
  }),
);

scheduleRouter.post(
  '/',
  requireRole(...STAFF),
  asyncRoute(async (req, res) => {
    const photoId = String(req.body?.photoId ?? '');
    if (!PHOTO_ID_RE.test(photoId)) return res.status(400).json({ error: 'invalid_photo' });
    const resolved = resolveClassKey(req.user, req.body);
    if (resolved.error) return sendClassError(res, resolved.error);
    await setSchedulePhoto(resolved.classKey, photoId);
    return res.json({ ok: true });
  }),
);

// Без сторонних библиотек для multipart фото приходит JSON-полем image в формате data URL (base64).
scheduleRouter.post(
  '/upload',
  requireRole(...STAFF),
  asyncRoute(async (req, res) => {
    const resolved = resolveClassKey(req.user, req.body);
    if (resolved.error) return sendClassError(res, resolved.error);
    let photoId;
    try {
      const { buffer, mimeType } = decodeBase64Image(req.body?.image);
      photoId = await uploadPhotoToTelegram(buffer, req.user.tgId, mimeType);
    } catch (err) {
      return res.status(400).json({ error: errorCode(err, 'upload_failed') });
    }
    await setSchedulePhoto(resolved.classKey, photoId);
    return res.json({ ok: true, photoId });
  }),
);
