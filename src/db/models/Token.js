import { Schema, model } from 'mongoose';

const TokenSchema = new Schema({
  // ID пользователя
  userId: {
    type: String,
    required: true
  },
  // Хэш токена (не сам токен!)
  tokenHash: {
    type: String,
    required: true
  },
  // Платформа
  platform: {
    type: String,
    enum: ['web'],
    required: true
  },
  // Дата создания
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Дата истечения
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 дней
  },
  // Дата отзыва
  revokedAt: Date
});

// TTL индекс для отозванных токенов
TokenSchema.index({ revokedAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { revokedAt: { $exists: true } } });

export const Token = model('Token', TokenSchema);
