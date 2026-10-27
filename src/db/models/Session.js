import { Schema, model } from 'mongoose';

const sessionSchema = new Schema({
  // tgId в строковом виде
  userId: { type: String, required: true },
  platform: { type: String, enum: ['telegram', 'web', 'max'], required: true },
  step: { type: String, default: null },
  data: { type: Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
});

sessionSchema.index({ userId: 1, platform: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model('Session', sessionSchema);
