import { Schema, model } from 'mongoose';

const ticketSchema = new Schema({
  // Идентификатор пользователя и тикета
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Статус
  status: { 
    type: String, 
    enum: ['open', 'in-progress', 'resolved'], 
    default: 'open' 
  },
  
  // Категория проблемы
  category: {
    type: String,
    enum: ['homework', 'bug-report', 'feature-request', 'payment', 'other'],
    default: 'other'
  },
  
  // Тема тикета
  subject: { type: String, required: true },
  
  // Сообщение пользователя (задача)
  message: { type: String, required: true },
  
  // Ответы поддержки/админов
  replies: [{
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Когда открыт тикет
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Индексы для оптимизации запросов
ticketSchema.index({ userId: 1, status: 1 });
ticketSchema.index({ subject: 'text', 'message.text': 'text' });

const TicketModel = model('Ticket', ticketSchema);

export { TicketModel };