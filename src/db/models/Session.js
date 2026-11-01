import mongoose from 'mongoose';

const { Schema } = mongoose;

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const sessionSchema = new Schema(
  {
    userId: { type: String, required: true },
    platform: { type: String, enum: ['telegram'], default: 'telegram' },
    step: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + SESSION_TTL_MS) },
  },
  { timestamps: true, minimize: false },
);

sessionSchema.index({ userId: 1, platform: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
export default Session;
