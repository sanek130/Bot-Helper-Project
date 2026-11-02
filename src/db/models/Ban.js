import mongoose from 'mongoose';

const { Schema } = mongoose;

// Бан человека, а не отдельного аккаунта: по Telegram ID, а если его нет — по юзернейму.
// Так бан не обходится выходом из аккаунта и повторной регистрацией.
const banSchema = new Schema(
  {
    tgId: { type: Number },
    username: { type: String, lowercase: true, trim: true },
    reason: { type: String, default: '' },
    bannedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

banSchema.index({ tgId: 1 }, { unique: true, partialFilterExpression: { tgId: { $type: 'number' } } });
banSchema.index({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: 'string' } } });

export const Ban = mongoose.models.Ban || mongoose.model('Ban', banSchema);
export default Ban;
