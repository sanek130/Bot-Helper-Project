import express from 'express';
import { requireAuth, requireRole, verifyToken, COOKIE_NAME } from '../auth.js';
import { User } from '../../db/models/User.js';
import { News } from '../../db/models/News.js';

const router = express.Router();
const creatorOnly = requireRole(['creator']);
const AUDIENCES = ['all', 'city', 'school', 'class'];
const MAX_TITLE = 200;
const MAX_BODY = 5000;

async function optionalUser(req) {
  const payload = await verifyToken(req.cookies?.[COOKIE_NAME]);
  if (!payload?.sub) return null;
  return User.findOne({ specId: payload.sub });
}

function toPublic(news) {
  return {
    id: String(news._id),
    title: news.title,
    body: news.body,
    audience: news.audience,
    audienceValue: news.audienceValue || null,
    pinned: Boolean(news.pinned),
    publishedAt: news.publishedAt,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const user = await optionalUser(req);
    const list = await News.find().sort({ pinned: -1, publishedAt: -1 }).limit(50);

    const visible = list.filter((item) => {
      if (item.audience === 'all') return true;
      if (!user) return false;
      if (item.audience === 'city') return item.audienceValue === user.city;
      if (item.audience === 'school') return item.audienceValue === user.school;
      if (item.audience === 'class') {
        return item.audienceValue === `${user.school}::${user.class}` || item.audienceValue === user.class;
      }
      return false;
    });

    res.json({ news: visible.map(toPublic) });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, creatorOnly, async (req, res, next) => {
  try {
    const { title, body, audience = 'all', audienceValue = null, pinned = false } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'missing_fields' });
    if (!AUDIENCES.includes(audience)) return res.status(400).json({ error: 'bad_audience' });
    if (audience !== 'all' && !audienceValue) return res.status(400).json({ error: 'missing_audience_value' });

    const news = await News.create({
      title: String(title).slice(0, MAX_TITLE),
      body: String(body).slice(0, MAX_BODY),
      audience,
      audienceValue: audience === 'all' ? null : String(audienceValue),
      pinned: Boolean(pinned),
      authorId: req.user.specId,
    });

    return res.json({ news: toPublic(news) });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', requireAuth, creatorOnly, async (req, res, next) => {
  try {
    const { title, body, audience, audienceValue, pinned } = req.body || {};
    const news = await News.findById(req.params.id);
    if (!news) return res.status(404).json({ error: 'not_found' });

    if (title !== undefined) news.title = String(title).slice(0, MAX_TITLE);
    if (body !== undefined) news.body = String(body).slice(0, MAX_BODY);
    if (audience !== undefined) {
      if (!AUDIENCES.includes(audience)) return res.status(400).json({ error: 'bad_audience' });
      news.audience = audience;
    }
    if (audienceValue !== undefined) news.audienceValue = audienceValue ? String(audienceValue) : null;
    if (pinned !== undefined) news.pinned = Boolean(pinned);
    await news.save();

    return res.json({ news: toPublic(news) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', requireAuth, creatorOnly, async (req, res, next) => {
  try {
    const result = await News.deleteOne({ _id: req.params.id });
    return res.json({ ok: result.deletedCount === 1 });
  } catch (error) {
    return next(error);
  }
});

export default router;
