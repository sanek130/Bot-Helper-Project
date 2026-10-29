import { Schema, model } from 'mongoose';

const messageSchema = new Schema(
  {
    from: { type: String, enum: ['user', 'support'], required: true },
    authorSpecId: String,
    authorName: String,
    text: { type: String, required: true, maxlength: 2000 },
    source: { type: String, enum: ['telegram', 'web', 'tma'], default: 'telegram' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const supportTicketSchema = new Schema(
  {
    userSpecId: { type: String, required: true, index: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    messages: { type: [messageSchema], default: [] },
    closedBy: String,
  },
  { timestamps: true }
);

supportTicketSchema.index({ status: 1, updatedAt: -1 });

export const SupportTicket = model('SupportTicket', supportTicketSchema);
