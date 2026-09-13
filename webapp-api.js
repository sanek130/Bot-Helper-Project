import crypto from 'crypto';
import express from 'express';
import { User } from './models/User.js';
import { Homework } from './models/Homework.js';
import { telegramToken } from './config.js';
import { toDateKey, addDaysToKey, getSubjectIcon } from './ui.js';
import { sendClassNotification } from './notifications.js';

const MAX_INIT_AGE_SEC = 86400;

/** Validate Telegram WebApp initData (HMAC-SHA256). */
export function validateInitData(initData, botToken = telegramToken) {
  if (!initData || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculated !== hash) return null;

    const authDate = Number(params.get('auth_date') || 0);
    if (!authDate || Math.abs(Date.now() / 1000 - authDate) > MAX_INIT_AGE_SEC) return null;

    const userRaw = params.get('user');
    if (!userRaw) return null;
    const tgUser = JSON.parse(userRaw);
    return { id: String(tgUser.id), tgUser, authDate };
  } catch {
    return null;
  }
}

async function resolveUser(req, res) {
  const initData = req.headers['x-telegram-init-data'] || req.query.initData || '';
  const auth = validateInitData(initData);
  if (!auth) {
    res.status(401).json({ error: 'invalid_init_data' });
    return null;
  }
  const user = await User.findOne({ id: auth.id });
  if (!user) {
    res.status(403).json({ error: 'not_registered', message: 'Сначала зарегистрируйся в боте: /start' });
    return null;
  }
  req.webUser = user;
  req.tgAuth = auth;
  return user;
}

function requireAdmin(user, res) {
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'admin_only' });
    return false;
  }
  return true;
}

function normalizeTask(task) {
  if (typeof task === 'object' && task) {
    return {
      type: task.type || (task.photo_id ? 'photo' : 'text'),
      text: task.text || '',
      photo_id: task.photo_id || null,
      icon: null,
    };
  }
  return { type: 'text', text: String(task || ''), photo_id: null, icon: null };
}

/**
 * @param {import('telegraf').Telegraf} bot
 */
export function createWebappRouter(bot) {
  const router = express.Router();

  router.use(express.json({ limit: '32kb' }));

  router.get('/me', async (req, res) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return;
      const slot = user.notification_slot || (user.notifications_enabled === false ? 'off' : '20');
      res.json({
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        class: user.class,
        role: user.role,
        notification_slot: slot,
        today: toDateKey(),
      });
    } catch (e) {
      console.error('GET /me', e);
      res.status(500).json({ error: 'server' });
    }
  });

  router.patch('/me/notifications', async (req, res) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return;
      const slot = req.body?.slot;
      if (!['off', '18', '20'].includes(slot)) {
        return res.status(400).json({ error: 'bad_slot' });
      }
      user.notification_slot = slot;
      user.notifications_enabled = slot !== 'off';
      await user.save();
      res.json({ ok: true, notification_slot: slot });
    } catch (e) {
      console.error('PATCH /me/notifications', e);
      res.status(500).json({ error: 'server' });
    }
  });

  router.get('/homework', async (req, res) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return;
      const from = req.query.from || toDateKey();
      const to = req.query.to || addDaysToKey(from, 6);
      const hw = await Homework.findOne({ classKey: user.class });
      const data = hw?.data || {};
      const completed = user.completed_homework || {};
      const days = {};
      let cursor = from;
      // include range even if empty
      while (cursor <= to) {
        const dayData = data[cursor] || {};
        const subjects = {};
        for (const [subject, task] of Object.entries(dayData)) {
          const n = normalizeTask(task);
          n.icon = getSubjectIcon(subject);
          n.done = Array.isArray(completed[cursor]) && completed[cursor].includes(subject);
          subjects[subject] = n;
        }
        days[cursor] = subjects;
        cursor = addDaysToKey(cursor, 1);
        if (Object.keys(days).length > 60) break;
      }
      res.json({
        class: user.class,
        from,
        to,
        days,
        schedule_photo_id: hw?.schedule_photo_id || null,
      });
    } catch (e) {
      console.error('GET /homework', e);
      res.status(500).json({ error: 'server' });
    }
  });

  router.post('/homework/done', async (req, res) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return;
      const { date, subject } = req.body || {};
      if (!date || !subject) return res.status(400).json({ error: 'bad_body' });

      const completed = { ...(user.completed_homework || {}) };
      const list = Array.isArray(completed[date]) ? [...completed[date]] : [];
      const idx = list.indexOf(subject);
      let done;
      if (idx === -1) {
        list.push(subject);
        done = true;
      } else {
        list.splice(idx, 1);
        done = false;
      }
      completed[date] = list;
      await User.updateOne({ id: user.id }, { completed_homework: completed });
      res.json({ ok: true, done });
    } catch (e) {
      console.error('POST /homework/done', e);
      res.status(500).json({ error: 'server' });
    }
  });

  router.get('/subjects', async (req, res) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return;
      const hw = await Homework.findOne({ classKey: user.class });
      const data = hw?.data || {};
      const set = new Set();
      for (const day of Object.values(data)) {
        if (day && typeof day === 'object') {
          for (const s of Object.keys(day)) set.add(s);
        }
      }
      const subjects = [...set].sort().map((name) => ({ name, icon: getSubjectIcon(name) }));
      res.json({ subjects });
    } catch (e) {
      console.error('GET /subjects', e);
      res.status(500).json({ error: 'server' });
    }
  });

  router.get('/homework/by-subject', async (req, res) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return;
      const name = (req.query.name || '').trim();
      if (!name) return res.status(400).json({ error: 'no_name' });
      const hw = await Homework.findOne({ classKey: user.class });
      const data = hw?.data || {};
      const today = toDateKey();
      const matches = [];
      for (const [date, day] of Object.entries(data)) {
        if (date < today) continue;
        if (day?.[name] !== undefined) {
          const n = normalizeTask(day[name]);
          n.icon = getSubjectIcon(name);
          matches.push({ date, subject: name, ...n });
        }
      }
      matches.sort((a, b) => a.date.localeCompare(b.date));
      res.json({ subject: name, items: matches.slice(0, 10) });
    } catch (e) {
      console.error('GET /homework/by-subject', e);
      res.status(500).json({ error: 'server' });
    }
  });

  router.get('/schedule', async (req, res) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return;
      const hw = await Homework.findOne({ classKey: user.class });
      const photoId = hw?.schedule_photo_id;
      if (!photoId || !bot) {
        return res.json({ url: null, photo_id: null });
      }
      try {
        const file = await bot.telegram.getFile(photoId);
        const url = `https://api.telegram.org/file/bot${telegramToken}/${file.file_path}`;
        res.json({ url, photo_id: photoId });
      } catch {
        res.json({ url: null, photo_id: photoId, stale: true });
      }
    } catch (e) {
      console.error('GET /schedule', e);
      res.status(500).json({ error: 'server' });
    }
  });

  router.post('/homework', async (req, res) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return;
      if (!requireAdmin(user, res)) return;
      const { date, subject, text } = req.body || {};
      if (!date || !subject || !text) return res.status(400).json({ error: 'bad_body' });
      if (String(text).length > 1000) return res.status(400).json({ error: 'too_long' });

      const hw = await Homework.findOne({ classKey: user.class });
      const data = { ...(hw?.data || {}) };
      if (!data[date]) data[date] = {};
      data[date][subject.trim()] = { type: 'text', text: String(text).trim() };
      await Homework.findOneAndUpdate(
        { classKey: user.class },
        { classKey: user.class, data, updated_at: new Date() },
        { upsert: true }
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('POST /homework', e);
      res.status(500).json({ error: 'server' });
    }
  });

  router.post('/homework/duplicate', async (req, res) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return;
      if (!requireAdmin(user, res)) return;
      const { from, to } = req.body || {};
      if (!from || !to) return res.status(400).json({ error: 'bad_body' });

      const hw = await Homework.findOne({ classKey: user.class });
      const data = { ...(hw?.data || {}) };
      const source = data[from];
      if (!source || Object.keys(source).length === 0) {
        return res.status(404).json({ error: 'source_empty' });
      }
      data[to] = JSON.parse(JSON.stringify(source));
      await Homework.findOneAndUpdate(
        { classKey: user.class },
        { classKey: user.class, data, updated_at: new Date() },
        { upsert: true }
      );
      res.json({ ok: true, count: Object.keys(source).length });
    } catch (e) {
      console.error('POST /homework/duplicate', e);
      res.status(500).json({ error: 'server' });
    }
  });

  router.post('/broadcast', async (req, res) => {
    try {
      const user = await resolveUser(req, res);
      if (!user) return;
      if (!requireAdmin(user, res)) return;
      const text = (req.body?.text || '').trim();
      if (!text || text.length > 1000) return res.status(400).json({ error: 'bad_body' });
      const message = `📢 Сообщение от админа (${user.class})\n\n${text}`;
      const sent = await sendClassNotification(user.class, message, true);
      res.json({ ok: true, sent });
    } catch (e) {
      console.error('POST /broadcast', e);
      res.status(500).json({ error: 'server' });
    }
  });

  return router;
}
