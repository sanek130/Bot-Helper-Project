import mongoose from 'mongoose';

const { Schema } = mongoose;

const voteSchema = new Schema(
  {
    voterSpecId: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Заявка на вступление в локальный класс.
// Нужное число голосов фиксируется в момент создания: состав класса может измениться,
// а правила голосования не должны меняться задним числом.
const classJoinRequestSchema = new Schema(
  {
    classKey: { type: String, required: true },
    applicantSpecId: { type: String, required: true },
    applicantTgId: { type: Number },
    applicantName: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' },
    votes: { type: [voteSchema], default: [] },
    requiredVotes: { type: Number, default: 1, min: 1 },
    resolvedBy: { type: String, default: '' },
    resolvedAt: { type: Date },
    // TTL: заявка живёт неделю. Одобренные тоже удаляются — история в ней не нужна.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, minimize: false },
);

classJoinRequestSchema.index({ status: 1, classKey: 1, createdAt: -1 });
classJoinRequestSchema.index({ applicantSpecId: 1, status: 1 });
classJoinRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Одна активная заявка на человека в классе: повторное нажатие «Попроситься» не плодит дубли.
classJoinRequestSchema.index(
  { classKey: 1, applicantSpecId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);

export const ClassJoinRequest =
  mongoose.models.ClassJoinRequest || mongoose.model('ClassJoinRequest', classJoinRequestSchema);
export default ClassJoinRequest;
