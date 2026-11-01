import mongoose from 'mongoose';

const { Schema } = mongoose;

const tokenSchema = new Schema(
  {
    // Хранится только SHA-256 от JWT: сам токен живёт только в cookie пользователя.
    tokenHash: { type: String, required: true },
    userId: { type: String, required: true },
    platform: { type: String, enum: ['web'], default: 'web' },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

tokenSchema.index({ tokenHash: 1 }, { unique: true });
tokenSchema.index({ userId: 1 });
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Token = mongoose.models.Token || mongoose.model('Token', tokenSchema);
export default Token;
