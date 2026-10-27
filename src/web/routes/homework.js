import express from 'express';
import { requireAuth, requireRole } from '../auth.js';
import bot from '../../bot/bot.js';
import {
  getClassKey,
  getDayData,
  getClassHomework,
  addHomework,
  removeSubject,
  removePhotos,
  replaceText,
  changeSubject,
  moveSubject,
  duplicateDay,
  addPhotoToTask,
  touchUserActivity,
  collectPhotoIds,
} from '../../services/homeworkService.js';
import { toDateKey, addDaysToKey, getWeekDates, dayTitle, formatDateHuman, isDateKey } from '../../services/dateService.js';
import { uploadPhotoToTelegram, parseImageDataUrl } from '../../services/photoService.js';
import { getSubjectIcon } from '../../utils/subjects.js';
import { escapeHtml, sanitizeSubjectName } from '../../utils/normalize.js';

const router = express.Router();
const adminOnly = requireRole(['admin', 'creator']);

function dateOrNull(value) {
  return isDateKey(value) ? value : null;
}

function taskItem(subject, task, doneSet) {
  return {
    subject,
    text: task.text || '',
    photos: collectPhotoIds(task),
    photoCount: collectPhotoIds(task).length,
    icon: getSubjectIcon(subject),
    done: doneSet.has(subject),
    addedAt: task.addedAt || null,
  };
}

function classLabel(user) {
  return user.school ? `${user.school}, класс ${user.class}` : `класс ${user.class}`;
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const date = dateOrNull(req.query.date) || toDateKey();
    const classKey = getClassKey(req.user);
    const dayData = await getDayData(classKey, date);
    const doneSet = new Set(req.user.completedHomework?.[date] || []);
    const items = Object.keys(dayData).map((subject) => taskItem(subject, dayData[subject], doneSet));

    await touchUserActivity(req.user.tgId, { viewed: true });

    res.json({
      date,
      title: dayTitle(date),
      dateHuman: formatDateHuman(date),
      classKey,
      classLabel: classLabel(req.user),
      hasPhotos: items.some((item) => item.photoCount > 0),
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/week', requireAuth, async (req, res, next) => {
  try {
    const offset = Number(req.query.offset) || 0;
    const classKey = getClassKey(req.user);
    const homework = await getClassHomework(classKey);
    const dates = getWeekDates(offset);

    const days = dates
      .filter((date) => homework[date] && Object.keys(homework[date]).length)
      .map((date) => {
        const doneSet = new Set(req.user.completedHomework?.[date] || []);
        return {
          date,
          title: dayTitle(date),
          items: Object.keys(homework[date]).map((subject) => ({
            subject,
            text: homework[date][subject].text || '',
            icon: getSubjectIcon(subject),
            done: doneSet.has(subject),
          })),
        };
      });

    res.json({ offset, start: dates[0], end: dates[6], days });
  } catch (error) {
    next(error);
  }
});

router.get('/all', requireAuth, async (req, res, next) => {
  try {
    const homework = await getClassHomework(getClassKey(req.user));
    const today = toDateKey();
    const days = [];

    for (let i = 0; i < 14; i += 1) {
      const date = addDaysToKey(today, i);
      if (homework[date]) days.push({ date, count: Object.keys(homework[date]).length, title: dayTitle(date) });
    }

    res.json({ days });
  } catch (error) {
    next(error);
  }
});

router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim().toLowerCase();
    if (query.length < 2) return res.json({ results: [] });

    const homework = await getClassHomework(getClassKey(req.user));
    const today = toDateKey();
    const results = [];

    for (const [date, day] of Object.entries(homework)) {
      if (date < today) continue;
      for (const [subject, task] of Object.entries(day)) {
        if (subject.toLowerCase().includes(query) || (task.text || '').toLowerCase().includes(query)) {
          results.push({ date, title: dayTitle(date), subject, text: task.text || '', icon: getSubjectIcon(subject) });
        }
      }
    }

    results.sort((a, b) => a.date.localeCompare(b.date));
    res.json({ results: results.slice(0, 10) });
  } catch (error) {
    next(error);
  }
});

router.get('/copy', requireAuth, async (req, res, next) => {
  try {
    const date = dateOrNull(req.query.date) || toDateKey();
    const dayData = await getDayData(getClassKey(req.user), date);

    let text = `${formatDateHuman(date)} · ${classLabel(req.user)}\n\n`;
    if (!Object.keys(dayData).length) {
      text += 'ДЗ нет.';
    } else {
      for (const [subject, task] of Object.entries(dayData)) {
        text += `${subject}\n${task.text || 'Ничего не задано.'}\n\n`;
      }
    }

    res.json({ text: text.trimEnd() });
  } catch (error) {
    next(error);
  }
});

router.post('/check', requireAuth, async (req, res, next) => {
  try {
    const { date, subject, done } = req.body || {};
    if (!dateOrNull(date) || !subject) return res.status(400).json({ error: 'bad_request' });

    const dayData = await getDayData(getClassKey(req.user), date);
    const realSubject = Object.keys(dayData).find((item) => item === subject);
    if (!realSubject) return res.status(409).json({ error: 'stale' });

    const completed = { ...(req.user.completedHomework || {}) };
    const list = Array.isArray(completed[date]) ? [...completed[date]] : [];
    const index = list.indexOf(realSubject);

    if (done && index === -1) list.push(realSubject);
    if (!done && index !== -1) list.splice(index, 1);

    if (list.length) completed[date] = list;
    else delete completed[date];

    req.user.completedHomework = completed;
    req.user.markModified('completedHomework');
    await req.user.save();

    return res.json({ ok: true, done: list.includes(realSubject) });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { date, subject, text } = req.body || {};
    const cleanSubject = sanitizeSubjectName(subject);
    if (!dateOrNull(date) || !cleanSubject) return res.status(400).json({ error: 'bad_request' });

    const result = await addHomework({
      classKey: getClassKey(req.user),
      dateKey: date,
      subject: cleanSubject,
      text: String(text || '').slice(0, 2000),
      addedBy: req.user.tgId,
    });

    await touchUserActivity(req.user.tgId, { added: true });
    return res.json({ ok: true, merged: result.merged, subject: cleanSubject });
  } catch (error) {
    return next(error);
  }
});

router.put('/', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { date, subject, text, newSubject } = req.body || {};
    if (!dateOrNull(date) || !subject) return res.status(400).json({ error: 'bad_request' });

    const classKey = getClassKey(req.user);
    let finalSubject = subject;
    if (newSubject && newSubject !== subject) {
      const cleanSubject = sanitizeSubjectName(newSubject);
      if (!cleanSubject) return res.status(400).json({ error: 'bad_subject' });
      await changeSubject(classKey, date, subject, cleanSubject);
      finalSubject = cleanSubject;
    }
    if (typeof text === 'string') {
      await replaceText(classKey, date, finalSubject, text.slice(0, 2000));
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/move', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { date, subject, toDate } = req.body || {};
    if (!dateOrNull(date) || !dateOrNull(toDate) || !subject) return res.status(400).json({ error: 'bad_request' });

    const moved = await moveSubject(getClassKey(req.user), date, subject, toDate);
    return res.json({ ok: Boolean(moved) });
  } catch (error) {
    return next(error);
  }
});

router.post('/duplicate', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { from, to } = req.body || {};
    if (!dateOrNull(from) || !dateOrNull(to)) return res.status(400).json({ error: 'bad_request' });

    const copied = await duplicateDay(getClassKey(req.user), from, to);
    return res.json({ ok: true, copied });
  } catch (error) {
    return next(error);
  }
});

router.post('/photos', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { date, subject, photo } = req.body || {};
    if (!dateOrNull(date) || !subject) return res.status(400).json({ error: 'bad_request' });

    const image = parseImageDataUrl(photo);
    if (!image) return res.status(400).json({ error: 'bad_photo' });
    if (!req.user.tgId) return res.status(400).json({ error: 'no_telegram' });

    const fileId = await uploadPhotoToTelegram(bot, req.user.tgId, image, `${subject} · фото с сайта`);
    if (!fileId) return res.status(502).json({ error: 'telegram_unavailable' });

    await addPhotoToTask(getClassKey(req.user), date, subject, fileId);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/photos/remove', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { date, subject } = req.body || {};
    if (!dateOrNull(date) || !subject) return res.status(400).json({ error: 'bad_request' });
    await removePhotos(getClassKey(req.user), date, subject);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.delete('/', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { date, subject } = req.body || {};
    if (!dateOrNull(date) || !subject) return res.status(400).json({ error: 'bad_request' });
    await removeSubject(getClassKey(req.user), date, subject);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export { escapeHtml };
export default router;
