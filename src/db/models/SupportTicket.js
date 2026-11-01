import mongoose from 'mongoose';

const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    from: { type: String, enum: ['user', 'support'], required: true },
    authorSpecId: { type: String, default: '' },
    authorName: { type: String, default: '' },
    text: { type: String, required: true, maxlength: 2000 },
    source: { type: String, enum: ['telegram', 'web', 'max'], default: 'telegram' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const supportTicketSchema = new Schema(
  {
    userSpecId: { type: String, required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    messages: { type: [messageSchema], default: [] },
    closedBy: { type: String },
    closedAt: { type: Date },
  },
  { timestamps: true },
);

supportTicketSchema.index({ status: 1, updatedAt: -1 });
supportTicketSchema.index({ userSpecId: 1, status: 1 });

export const SupportTicket = mongoose.models.SupportTicket || mongoose.model('SupportTicket', supportTicketSchema);
export default SupportTicket;
