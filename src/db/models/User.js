import crypto from 'node:crypto';
import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ROLES = ['user', 'admin', 'moderator', 'creator', 'support'];
export const PLATFORMS = ['telegram', 'web', 'max'];
export const DEFAULT_KEYBOARD = ['Сегодня', 'Завтра', 'Меню'];
// Кнопки с эмодзи (для совместимости со старыми сохранёнными списками без эмодзи).
// Хранятся базовые подписи (без эмодзи): эмодзи добавляются по стилю пользователя (/style).
export const EMOJI_KEYBOARD = ['Сегодня', 'Завтра', 'Меню'];

const regHistorySchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, required: true },
    step: { type: Number },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    specId: { type: String, default: () => crypto.randomUUID() },
    tgId: { type: Number },
    // Постоянная привязка к Telegram ID: tgId стирается при выходе из аккаунта, ownerTgId — нет.
    // По нему бот находит «висящие» аккаунты человека и показывает их при повторной регистрации.
    ownerTgId: { type: Number },
    username: { type: String, default: '', trim: true },
    firstName: { type: String, default: '', trim: true },
    lastName: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    school: { type: String, default: '', trim: true },
    class: { type: String, default: '', trim: true },
    // moderator добавлен в enum, потому что иерархия ролей (Модули 4–7) опирается на него.
    role: { type: String, enum: ROLES, default: 'user' },
    adminBanned: { type: Boolean, default: false },
    warns: { type: Number, default: 0, min: 0, max: 3 },
    // Полная блокировка аккаунта (используется banMiddleware и requireAuth).
    banned: { type: Boolean, default: false },
    banReason: { type: String, default: '' },
    bannedBy: { type: String, default: '' },
    bannedAt: { type: Date },
    status: { type: String, enum: ['unregistered', 'pending', 'active'], default: 'unregistered' },
    // minimize: false — пустой черновик {} должен сохраняться, иначе Mongoose удалит поле.
    draft: { type: Schema.Types.Mixed, default: {} },
    // Длина истории ограничивается в userService (не более 50 записей).
    regHistory: { type: [regHistorySchema], default: [] },
    platforms: { type: [{ type: String, enum: PLATFORMS }], default: [] },
    completedHomework: { type: Schema.Types.Mixed, default: {} },
    buttonStyle: { type: String, default: 'classic' },
    customKeyboard: { type: [String], default: () => [...EMOJI_KEYBOARD] },
    stats: {
      type: Schema.Types.Mixed,
      default: () => ({ homeworkViews: 0, homeworkAdded: 0, lastActive: null }),
    },
    // Класс, с которым работает создатель/модератор в админ-флоу (формат «Школа::Класс»).
    workClassKey: { type: String, default: '' },
    pendingAdminRequest: { type: Boolean, default: false },
    // TTL: pending-аккаунт с сайта удаляется MongoDB автоматически, если Telegram не привязан вовремя.
    pendingExpiresAt: { type: Date },
    registeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true, minimize: false },
);

userSchema.index({ tgId: 1 }, { unique: true, sparse: true });
userSchema.index({ specId: 1 }, { unique: true });
userSchema.index({ ownerTgId: 1, status: 1 });
userSchema.index({ pendingExpiresAt: 1 }, { expireAfterSeconds: 0 });
userSchema.index({ school: 1, class: 1, status: 1 });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
