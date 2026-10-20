import { Schema, model } from 'mongoose';

const SessionSchema = new Schema({
  // ID пользователя
  userId: {
    type: String,
    required: true
  },
  // Платформа
  platform: {
    type: String,
    enum: ['telegram', 'web', 'max'],
    required: true
  },
  // Текущий шаг мастера
  step: String,
  // Данные сессии
  data: {
    type: Schema.Types.Mixed,
    default: {}
  },
  // Дата последнего обновления
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // Дата истечения (TTL)
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 часа
  }
});

// TTL индекс - автоматическое удаление по expiresAt
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model('Session', SessionSchema);
