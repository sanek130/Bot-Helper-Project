import mongoose from 'mongoose';

const { Schema } = mongoose;

const loginRequestSchema = new Schema(
  {
    // specId пользователя, в чей аккаунт выполняется вход. Для kind='tg-code' — строка «tg:<Telegram ID>».
    userId: { type: String, required: true },
    kind: { type: String, enum: ['site-code', 'bot', 'link', 'tg-code'], required: true },
    // Для kind='bot' подтверждение идёт кнопкой в Telegram, поэтому хэш служебный.
    codeHash: { type: String, required: true },
    newTgId: { type: Number },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

loginRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
loginRequestSchema.index({ userId: 1, kind: 1, status: 1 });
loginRequestSchema.index({ codeHash: 1 });

export const LoginRequest = mongoose.models.LoginRequest || mongoose.model('LoginRequest', loginRequestSchema);
export default LoginRequest;
