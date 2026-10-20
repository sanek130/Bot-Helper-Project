import { Schema, model } from 'mongoose';

const LoginRequestSchema = new Schema({
  // ID пользователя
  userId: {
    type: String,
    required: true
  },
  // Тип запроса
  kind: {
    type: String,
    enum: ['bot', 'site-code', 'link'],
    required: true
  },
  // Хэш кода (для site-code) или токена (для link)
  codeHash: String,
  // Новый tgId (для входа по спец-ID из другого Telegram)
  newTgId: Number,
  // Статус
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'expired'],
    default: 'pending'
  },
  // Дата создания
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Дата истечения (TTL)
  expiresAt: {
    type: Date,
    required: true
  }
});

// TTL индекс - автоматическое удаление по expiresAt
LoginRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginRequest = model('LoginRequest', LoginRequestSchema);
