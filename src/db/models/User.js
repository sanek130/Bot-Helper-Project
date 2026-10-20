import { Schema, model } from 'mongoose';
import crypto from 'crypto';

const UserSchema = new Schema({
  // Спец-ID для синхронизации аккаунтов (UUID v4)
  specId: {
    type: String,
    unique: true,
    required: true,
    default: () => crypto.randomUUID()
  },
  // Telegram ID (sparse - может быть пустым для аккаунтов только с сайта)
  tgId: {
    type: Number,
    sparse: true,
    unique: true,
    index: true
  },
  username: String,
  firstName: String,
  city: String,
  school: String,
  class: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'creator'],
    default: 'user'
  },
  // Заблокирован для роли админа (3 варна)
  adminBanned: {
    type: Boolean,
    default: false
  },
  // Предупреждения (0-3)
  warns: {
    type: Number,
    default: 0,
    min: 0,
    max: 3
  },
  // Статус аккаунта
  status: {
    type: String,
    enum: ['pending', 'active'],
    default: 'active'
  },
  // Для pending: дата удаления
  pendingExpiresAt: Date,
  // Платформы, на которых зарегистрирован аккаунт
  platforms: [{
    type: String,
    enum: ['telegram', 'web', 'max']
  }],
  // Зарезервировано для Макс-бота
  maxId: Number,
  // Выполненное ДЗ: { "YYYY-MM-DD": ["Алгебра", ...] }
  completedHomework: {
    type: Schema.Types.Mixed,
    default: {}
  },
  // Кастомная нижняя клавиатура
  customKeyboard: [String],
  // Заявка на роль админа
  pendingAdminRequest: {
    type: Boolean,
    default: false
  },
  // Статистика
  stats: {
    homeworkViews: {
      type: Number,
      default: 0
    },
    homeworkAdded: {
      type: Number,
      default: 0
    },
    lastActive: {
      type: Date,
      default: Date.now
    }
  },
  // Дата регистрации
  registeredAt: {
    type: Date,
    default: Date.now
  }
});

// Индексы
UserSchema.index({ tgId: 1 }, { sparse: true });
UserSchema.index({ specId: 1 }, { unique: true });
UserSchema.index({ class: 1, school: 1 });
// TTL для pending-аккаунтов
UserSchema.index({ status: 1, pendingExpiresAt: 1 }, {
  expireAfterSeconds: 0,
  partialFilterExpression: { status: 'pending' }
});

export const User = model('User', UserSchema);
