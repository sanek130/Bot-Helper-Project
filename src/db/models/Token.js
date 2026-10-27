import { Schema, model } from 'mongoose';

const tokenSchema = new Schema({
  userId: { type: String, required: true },
  // В базе лежит только хэш, сам токен не хранится
  tokenHash: { type: String, required: true, unique: true },
  platform: { type: String, enum: ['web'], required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  revokedAt: Date,
});

tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
tokenSchema.index({ userId: 1 });

export const Token = model('Token', tokenSchema);
