import { Schema, model } from 'mongoose';

const userSchema = new Schema({
  specId: { type: String, required: true, index: true }, // Универсальный ID пользователя (UUID)
  
  // Telegram полей — sparse для частичного поиска, БЕЗ unique чтобы избежать E11000
  tgId: { type: Number, sparse: true }, 
  phone: { type: String, sparse: true }, 
  googleId: { type: String, sparse: true }, 
  
  // Специальные ID для кросс-платформенного входа
  siteId: { type: String, sparse: true },
  
  // Бан и предупреждения
  banned: { type: Boolean, default: false },
  banReason: { type: String },
  warns: { type: Number, default: 0 },
  maxWarns: { type: Number, default: 3 },
  warnedAt: { type: Date },
  
  // Роль пользователя
  role: { 
    type: String, 
    enum: ['user', 'admin', 'creator', 'support'], 
    default: 'user' 
  },
  
  // Статус регистрации и привязки Telegram
  registeredAt: { type: Date, index: true },
  telegramLinkedAt: { type: Date },
  googleLinkedAt: { type: Date },
  
  // Имя для отправки уведомлений
  notificationName: { type: String },
}, { timestamps: true });

// Компонд индексы для предотвращения дубликатов через разные поля:
// Один tgId не может быть у разных specId — один пользователь Telegram не может иметь несколько аккаунтов
userSchema.index({ specId: 1, tgId: 1 }); 
userSchema.index({ specId: 1, phone: 1 });
userSchema.index({ specId: 1, googleId: 1 });

const UserModel = model('User', userSchema);

export { UserModel };