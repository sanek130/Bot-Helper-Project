import { Schema, model } from 'mongoose';

const userSchema = new Schema({
  // Универсальный ID пользователя (UUID) — один на все платформы
  specId: { type: String, required: true, unique: true, index: true },

  // Способы входа: Telegram, телефон, Google — все опциональны, но хотя бы один есть
  tgId: { type: Number, sparse: true, index: true },
  phone: { type: String, sparse: true, index: true },
  googleId: { type: String, sparse: true, index: true },
  email: { type: String, lowercase: true, trim: true, default: '' },

  // Профиль
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  username: { type: String, default: '' },
  city: { type: String, default: '' },
  school: { type: String, default: '' },
  class: { type: String, default: '' },

  // Статус аккаунта: pending — ждёт привязки Telegram, active — полноценный
  status: { type: String, enum: ['pending', 'active'], default: 'active', index: true },
  registeredAt: { type: Date, default: Date.now, index: true },
  telegramLinkedAt: { type: Date },
  googleLinkedAt: { type: Date },

  // Платформы, с которых пользователь заходил: telegram / web / tma / max
  platforms: { type: [String], default: [] },

  // Роль: user < admin < creator; support — помощник поддержки
  role: {
    type: String,
    enum: ['user', 'admin', 'creator', 'support'],
    default: 'user',
    index: true,
  },

  // Бан и предупреждения
  banned: { type: Boolean, default: false },
  banReason: { type: String, default: '' },
  bannedAt: { type: Date },
  bannedBy: { type: String },
  warns: { type: Number, default: 0 },
  maxWarns: { type: Number, default: 3 },
  warnedAt: { type: Date },
  // true — создатель запретил назначать этого пользователя админом после варнов
  adminBanned: { type: Boolean, default: false },

  // Настройки и статистика
  customKeyboard: { type: [String], default: ['Сегодня', 'Завтра', 'Меню'] },
  completedHomework: { type: Schema.Types.Mixed, default: {} },
  stats: {
    lastActive: { type: Date },
    homeworkViews: { type: Number, default: 0 },
    homeworkAdded: { type: Number, default: 0 },
  },

  // Имя для отправки уведомлений
  notificationName: { type: String },
}, { timestamps: true });

const User = model('User', userSchema);

// UserModel — алиас для обратной совместимости
export { User, User as UserModel };
