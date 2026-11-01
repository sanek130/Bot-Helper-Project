import { Router } from 'express';
import mongoose from 'mongoose';
import { News } from '../../db/models/News.js';
import { requireAuth, requireRole } from '../auth.js';
import { asyncRoute, parseLimit } from '../helpers.js';

export const newsRouter = Router();

const AUDIENCES = ['all', 'city', 'school', 'class'];

function serialize(item) {
  return {
    _id: String(item._id),
    title: item.title,
    body: item.body,
    audience: item.audience,
    audienceValue: item.audienceValue || '',
    pinned: Boolean(item.pinned),
    authorId: item.authorId,
    publishedAt: item.publishedAt,
  };
}

function validate(body, partial) {
  const update = {};
  if (body.title !== undefined || !partial) {
    const title = String(body.title ?? '').trim();
    if (title.length < 1 || title.length > 200) return { error: 'invalid_title' };
    update.title = title;
  }
  if (body.body !== undefined || !partial) {
    const text = String(body.body ?? '').trim();
    if (text.length < 1 || text.length > 5000) return { error: 'invalid_body' };
    update.body = text;
  }
  if (body.audience !== undefined || !partial) {
    const audience = body.audience === undefined ? 'all' : String(body.audience);
    if (!AUDIENCES.includes(audience)) return { error: 'invalid_audience' };
    update.audience = audience;
  }
  if (body.audienceValue !== undefined) update.audienceValue = String(body.audienceValue).trim().slice(0, 200);
  if (body.pinned !== undefined) update.pinned = Boolean(body.pinned);
  return { update };
}

newsRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const limit = parseLimit(req.query.limit, 50, 100);
    const offset = Math.max(0, Number.parseInt(req.query.offset ?? '0', 10) || 0);
    const items = await News.find({}).sort({ pinned: -1, publishedAt: -1 }).skip(offset).limit(limit).lean();
    return res.json({ news: items.map(serialize) });
  }),
);

newsRouter.post(
  '/',
  requireAuth,
  requireRole('creator'),
  asyncRoute(async (req, res) => {
    const { update, error } = validate(req.body || {}, false);
    if (error) return res.status(400).json({ error });
    const item = await News.create({ ...update, authorId: req.user.specId, publishedAt: new Date() });
    return res.status(201).json({ ok: true, newsId: String(item._id) });
  }),
);

newsRouter.put(
  '/:id',
  requireAuth,
  requireRole('creator'),
  asyncRoute(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
    const { update, error } = validate(req.body || {}, true);
    if (error) return res.status(400).json({ error });
    const item = await News.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!item) return res.status(404).json({ error: 'not_found' });
    return res.json({ ok: true });
  }),
);

newsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('creator'),
  asyncRoute(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'not_found' });
    const result = await News.deleteOne({ _id: req.params.id });
    if (!result.deletedCount) return res.status(404).json({ error: 'not_found' });
    return res.json({ ok: true });
  }),
);
