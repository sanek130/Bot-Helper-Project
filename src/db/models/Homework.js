import { Schema, model } from 'mongoose';

const HomeworkSchema = new Schema({
  // Ключ класса: "Школа::Класс"
  classKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Данные: { "YYYY-MM-DD": { "Предмет": { text, photoIds, addedBy, addedAt } } }
  data: {
    type: Schema.Types.Mixed,
    default: {}
  },
  // file_id фото расписания
  schedulePhotoId: {
    type: String
  },
  // Дата последнего обновления
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export const Homework = model('Homework', HomeworkSchema);
