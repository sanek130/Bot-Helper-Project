import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { asyncRoute, resolveClassKey, sendClassError, errorCode } from '../helpers.js';
import { isDateKey, getWeekDates, getDayTitle, addDaysKey, getToday } from '../../utils/dateService.js';
import { sanitizeSubjectName } from '../../utils/normalize.js';
import { getSubjectIcon } from '../../utils/subjects.js';
import {
  ENTRY_LIMIT,
  PHOTO_LIMIT,
  getDayHomework,
  getHomeworkByClassKey,
  getDatesWithHomework,
  addHomework,
  replaceText,
  replacePhotos,
  removeSubject,
  moveSubject,
  duplicateDay,
  toggleCompletedHomework,
  isCompleted,
  taskSubjectName,
  searchHomework,
} from '../../services/homeworkService.js';
import { touchUserActivity } from '../../services/statsService.js';
import { uploadPhotoToTelegram, decodeBase64Image } from '../../services/photoService.js';

export const homeworkRouter = Router();

const STAFF = ['admin', 'creator', 'moderator'];
const SUBJECT_HASH_RE = /^[0-9a-f]{8}$/;
const MAX_DATE_RANGE_DAYS = 120;

homeworkRouter.use(requireAuth);

function authorKey(user) {
  return user.tgId ?? user.specId;
}

function validPhotoIds(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > PHOTO_LIMIT) return null;
  if (!value.every((id) => typeof id === 'string' && /^[\w-]{10,200}$/.test(id))) return null;
  return value;
}

function classFrom(req, res, source) {
  const resolved = resolveClassKey(req.user, source);
  if (resolved.error) {
    sendClassError(res, resolved.error);
    return null;
  }
  return resolved.classKey;
}

function mapSubjects(user, dateKey, subjects) {
  return Object.entries(subjects || {}).map(([subjectHash, task]) => {
    const subjectName = taskSubjectName(subjectHash, task);
    return {
      subjectHash,
      subjectName,
      icon: getSubjectIcon(subjectName),
      text: task?.text || '',
      photoIds: task?.photoIds || [],
      addedBy: task?.addedBy ?? null,
      addedAt: task?.addedAt || null,
      completed: isCompleted(user, dateKey, subjectHash),
    };
  });
}

homeworkRouter.get(
  '/day/:dateKey',
  asyncRoute(async (req, res) => {
    const { dateKey } = req.params;
    if (!isDateKey(dateKey)) return res.status(400).json({ error: 'invalid_date' });
    const classKey = classFrom(req, res, req.query);
    if (!classKey) return null;
    const day = await getDayHomework(classKey, dateKey);
    await touchUserActivity(req.user.specId, { incrementViews: true });
    return res.json({ dateKey, dayTitle: getDayTitle(dateKey), classKey, subjects: mapSubjects(req.user, dateKey, day.subjects) });
  }),
);

homeworkRouter.get(
  '/week',
  asyncRoute(async (req, res) => {
    const offset = Number.parseInt(req.query.offset ?? '0', 10);
    if (!Number.isInteger(offset) || offset < -52 || offset > 52) return res.status(400).json({ error: 'invalid_offset' });
    const classKey = classFrom(req, res, req.query);
    if (!classKey) return null;
    const days = getWeekDates(offset);
    // Один запрос к базе на всю неделю вместо семи.
    const withHomework = new Set(await getDatesWithHomework(classKey, days[0].dateKey, days[days.length - 1].dateKey));
    for (const day of days) day.hasHomework = withHomework.has(day.dateKey);
    return res.json({ offset, days });
  }),
);

// Сегодня, завтра и послезавтра одним ответом: Mini App в Telegram открывается за один запрос.
homeworkRouter.get(
  '/upcoming',
  asyncRoute(async (req, res) => {
    const classKey = classFrom(req, res, req.query);
    if (!classKey) return null;
    const homework = await getHomeworkByClassKey(classKey);
    const today = getToday();
    const days = [0, 1, 2].map((shift) => {
      const dateKey = addDaysKey(today, shift);
      const subjects = homework?.data?.[dateKey];
      return {
        dateKey,
        dayTitle: getDayTitle(dateKey),
        subjects: mapSubjects(req.user, dateKey, subjects && typeof subjects === 'object' ? subjects : {}),
      };
    });
    await touchUserActivity(req.user.specId, { incrementViews: true });
    return res.json({ classKey, days, schedulePhotoId: homework?.schedulePhotoId || null });
  }),
);

homeworkRouter.get(
  '/dates',
  asyncRoute(async (req, res) => {
    const from = String(req.query.from ?? '');
    const to = String(req.query.to ?? '');
    if (!isDateKey(from) || !isDateKey(to) || from > to) return res.status(400).json({ error: 'invalid_range' });
    if (addDaysKey(from, MAX_DATE_RANGE_DAYS) < to) return res.status(400).json({ error: 'range_too_large' });
    const classKey = classFrom(req, res, req.query);
    if (!classKey) return null;
    const dates = await getDatesWithHomework(classKey, from, to);
    return res.json({ dates });
  }),
);

homeworkRouter.get(
  '/search',
  asyncRoute(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2 || q.length > 100) return res.status(400).json({ error: 'invalid_query' });
    const classKey = classFrom(req, res, req.query);
    if (!classKey) return null;
    const results = await searchHomework(classKey, q, 50);
    return res.json({
      results: results.map((item) => ({ ...item, icon: getSubjectIcon(item.subjectName), dayTitle: getDayTitle(item.dateKey) })),
    });
  }),
);

homeworkRouter.post(
  '/toggle',
  asyncRoute(async (req, res) => {
    const dateKey = String(req.body?.dateKey ?? '');
    const subjectHash = String(req.body?.subjectHash ?? '');
    if (!isDateKey(dateKey) || !SUBJECT_HASH_RE.test(subjectHash)) return res.status(400).json({ error: 'invalid_input' });
    const result = await toggleCompletedHomework(req.user.specId, dateKey, subjectHash);
    return res.json({ completed: result.completed });
  }),
);

homeworkRouter.post(
  '/upload-photo',
  requireRole(...STAFF),
  asyncRoute(async (req, res) => {
    try {
      const { buffer, mimeType } = decodeBase64Image(req.body?.image);
      const photoId = await uploadPhotoToTelegram(buffer, req.user.tgId, mimeType);
      return res.json({ ok: true, photoId });
    } catch (err) {
      return res.status(400).json({ error: errorCode(err, 'upload_failed') });
    }
  }),
);

homeworkRouter.post(
  '/move',
  requireRole(...STAFF),
  asyncRoute(async (req, res) => {
    const { fromDateKey, toDateKey, subjectHash } = req.body || {};
    if (!isDateKey(fromDateKey) || !isDateKey(toDateKey) || !SUBJECT_HASH_RE.test(String(subjectHash))) {
      return res.status(400).json({ error: 'invalid_input' });
    }
    const classKey = classFrom(req, res, req.body);
    if (!classKey) return null;
    try {
      await moveSubject(classKey, fromDateKey, toDateKey, subjectHash);
    } catch (err) {
      return res.status(400).json({ error: errorCode(err, 'move_failed') });
    }
    return res.json({ ok: true });
  }),
);

homeworkRouter.post(
  '/duplicate',
  requireRole(...STAFF),
  asyncRoute(async (req, res) => {
    const { fromDateKey, toDateKey } = req.body || {};
    if (!isDateKey(fromDateKey) || !isDateKey(toDateKey)) return res.status(400).json({ error: 'invalid_input' });
    const classKey = classFrom(req, res, req.body);
    if (!classKey) return null;
    try {
      const { subjectsCount } = await duplicateDay(classKey, fromDateKey, toDateKey, authorKey(req.user));
      return res.json({ ok: true, subjectsCount });
    } catch (err) {
      return res.status(400).json({ error: errorCode(err, 'duplicate_failed') });
    }
  }),
);

homeworkRouter.post(
  '/',
  requireRole(...STAFF),
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const dateKey = String(body.dateKey ?? '');
    let subjectName = '';
    try {
      subjectName = sanitizeSubjectName(body.subjectName);
    } catch {
      return res.status(400).json({ error: 'invalid_subject' });
    }
    const text = String(body.text ?? '').trim();
    const photoIds = validPhotoIds(body.photoIds);
    if (!isDateKey(dateKey)) return res.status(400).json({ error: 'invalid_date' });
    if (text.length > ENTRY_LIMIT) return res.status(400).json({ error: 'text_too_long' });
    if (photoIds === null) return res.status(400).json({ error: 'invalid_photos' });
    if (!text && photoIds.length === 0) return res.status(400).json({ error: 'empty_task' });
    const classKey = classFrom(req, res, body);
    if (!classKey) return null;
    const result = await addHomework(classKey, dateKey, subjectName, text, photoIds, authorKey(req.user));
    await touchUserActivity(req.user.specId, { incrementAdded: true });
    return res.json({ ok: true, subjectHash: result.subjectHash, text: result.text, photoIds: result.photoIds });
  }),
);

function validTarget(req, res) {
  const { classKey, dateKey, subjectHash } = req.params;
  if (!isDateKey(dateKey) || !SUBJECT_HASH_RE.test(subjectHash)) {
    res.status(400).json({ error: 'invalid_input' });
    return null;
  }
  const resolved = classFrom(req, res, { classKey });
  if (!resolved) return null;
  return { classKey: resolved, dateKey, subjectHash };
}

homeworkRouter.put(
  '/:classKey/:dateKey/:subjectHash',
  requireRole(...STAFF),
  asyncRoute(async (req, res) => {
    const target = validTarget(req, res);
    if (!target) return null;
    const { text, photoIds } = req.body || {};
    if (text !== undefined && (typeof text !== 'string' || text.trim().length > ENTRY_LIMIT)) {
      return res.status(400).json({ error: 'text_too_long' });
    }
    const photos = photoIds === undefined ? undefined : validPhotoIds(photoIds);
    if (photos === null) return res.status(400).json({ error: 'invalid_photos' });
    try {
      if (text !== undefined) await replaceText(target.classKey, target.dateKey, target.subjectHash, text);
      if (photos !== undefined) await replacePhotos(target.classKey, target.dateKey, target.subjectHash, photos);
    } catch (err) {
      return res.status(404).json({ error: errorCode(err, 'subject_not_found') });
    }
    return res.json({ ok: true });
  }),
);

homeworkRouter.delete(
  '/:classKey/:dateKey/:subjectHash',
  requireRole(...STAFF),
  asyncRoute(async (req, res) => {
    const target = validTarget(req, res);
    if (!target) return null;
    const result = await removeSubject(target.classKey, target.dateKey, target.subjectHash);
    if (result?.success === false) return res.status(404).json({ error: 'subject_not_found' });
    return res.json({ ok: true });
  }),
);
