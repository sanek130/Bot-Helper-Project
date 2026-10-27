import { Schema, model } from 'mongoose';

const newsSchema = new Schema({
  title: { type: String, required: true, maxlength: 200 },
  body: { type: String, required: true, maxlength: 5000 },
  audience: { type: String, enum: ['all', 'city', 'school', 'class'], default: 'all' },
  audienceValue: String,
  pinned: { type: Boolean, default: false },
  authorId: { type: String, required: true },
  publishedAt: { type: Date, default: Date.now },
});

newsSchema.index({ pinned: -1, publishedAt: -1 });

export const News = model('News', newsSchema);
