import { Schema, model } from 'mongoose';
import crypto from 'crypto';

const userSchema = new Schema(
  {
    // Спец-ID не меняется при смене класса и связывает аккаунты на всех платформах
    specId: {
      type: String,
      unique: true,
      required: true,
      default: () => crypto.randomUUID(),
    },
    // Пусто, если аккаунт ещё не привязан к Telegram (например, pending с сайта)
    tgId: { type: Number, unique: true, sparse: true },
    username: String,
    firstName: String,
    city: String,
    school: String,
    class: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin', 'creator'], default: 'user' },
    adminBanned: { type: Boolean, default: false },
    warns: { type: Number, default: 0, min: 0, max: 3 },
    status: { type: String, enum: ['pending', 'active'], default: 'active' },
    pendingExpiresAt: Date,
    platforms: [{ type: String, enum: ['telegram', 'web', 'max'] }],
    maxId: Number,
    completedHomework: { type: Schema.Types.Mixed, default: {} },
    customKeyboard: { type: [String], default: ['Сегодня', 'Завтра', 'Меню'] },
    stats: {
      homeworkViews: { type: Number, default: 0 },
      homeworkAdded: { type: Number, default: 0 },
      lastActive: { type: Date, default: Date.now },
    },
    pendingAdminRequest: { type: Boolean, default: false },
    registeredAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

userSchema.index({ school: 1, class: 1 });
userSchema.index({ city: 1, school: 1 });
// Pending-аккаунты удаляются, если за сутки так и не привязали Telegram
userSchema.index(
  { pendingExpiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { status: 'pending' } }
);

export const User = model('User', userSchema);
