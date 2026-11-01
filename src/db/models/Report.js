import mongoose from 'mongoose';

const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    // specId подавшего жалобу.
    fromUserId: { type: String, required: true },
    // specId админа, на которого жалуются.
    onAdminId: { type: String, required: true },
    classKey: { type: String, required: true },
    text: { type: String, required: true, minlength: 10, maxlength: 1000 },
    status: { type: String, enum: ['open', 'resolved', 'rejected'], default: 'open' },
    escalatedToCreator: { type: Boolean, default: false },
    resolvedBy: { type: String },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ onAdminId: 1, fromUserId: 1, createdAt: -1 });

export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
export default Report;
