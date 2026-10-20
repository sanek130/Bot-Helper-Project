import { Schema, model } from 'mongoose';

const NewsSchema = new Schema({
  // Заголовок
  title: {
    type: String,
    required: true
  },
  // Текст новости
  body: {
    type: String,
    required: true
  },
  // Аудитория
  audience: {
    type: String,
    enum: ['all', 'city', 'school', 'class'],
    default: 'all'
  },
  // Значение аудитории (город, школа или класс)
  audienceValue: String,
  // Закреплено
  pinned: {
    type: Boolean,
    default: false
  },
  // ID автора
  authorId: {
    type: String,
    required: true
  },
  // Дата публикации
  publishedAt: {
    type: Date,
    default: Date.now
  }
});

export const News = model('News', NewsSchema);
