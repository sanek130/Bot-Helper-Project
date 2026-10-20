import { Schema, model } from 'mongoose';

const ReportSchema = new Schema({
  // ID жалобщика
  fromUserId: {
    type: String,
    required: true
  },
  // ID админа, на которого жалоба
  onAdminId: {
    type: String,
    required: true
  },
  // Ключ класса
  classKey: {
    type: String,
    required: true
  },
  // Текст жалобы
  text: {
    type: String,
    required: true
  },
  // Статус
  status: {
    type: String,
    enum: ['open', 'resolved', 'rejected'],
    default: 'open'
  },
  // Дата создания
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Кто решил
  resolvedBy: String,
  // Дата решения
  resolvedAt: Date
});

export const Report = model('Report', ReportSchema);
