import { Schema, model } from 'mongoose';

const loginRequestSchema = new Schema({
  userId: { type: String, required: true },
  kind: { type: String, enum: ['bot', 'site-code', 'link'], required: true },
  // sha256 кода сайта или одноразового токена
  codeHash: String,
  // Новый tgId при входе по спец-ID из другого Telegram
  newTgId: Number,
  attempts: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

loginRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
loginRequestSchema.index({ userId: 1, kind: 1, status: 1 });

export const LoginRequest = model('LoginRequest', loginRequestSchema);
