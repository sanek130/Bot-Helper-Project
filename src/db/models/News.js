import mongoose from 'mongoose';

const { Schema } = mongoose;

const newsSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 200, trim: true },
    body: { type: String, required: true, maxlength: 5000 },
    audience: { type: String, enum: ['all', 'city', 'school', 'class'], default: 'all' },
    audienceValue: { type: String, default: '' },
    pinned: { type: Boolean, default: false },
    authorId: { type: String, required: true },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

newsSchema.index({ pinned: -1, publishedAt: -1 });

export const News = mongoose.models.News || mongoose.model('News', newsSchema);
export default News;
