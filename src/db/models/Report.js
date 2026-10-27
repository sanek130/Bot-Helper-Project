import { Schema, model } from 'mongoose';

const reportSchema = new Schema({
  fromUserId: { type: String, required: true },
  onAdminId: { type: String, required: true },
  classKey: { type: String, required: true },
  text: { type: String, required: true },
  status: { type: String, enum: ['open', 'resolved', 'rejected'], default: 'open' },
  createdAt: { type: Date, default: Date.now },
  resolvedBy: String,
  resolvedAt: Date,
});

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ fromUserId: 1, onAdminId: 1, createdAt: -1 });

export const Report = model('Report', reportSchema);
