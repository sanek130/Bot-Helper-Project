const { Schema, model } = require('mongoose');

const HomeworkSchema = new Schema({
  classGrade: {
    type: String,
    required: true,
    index: true
  },
  school: {
    type: String,
    required: true,
    index: true
  },
  subject: {
    type: String,
    required: true
  },
  task: {
    type: String,
    required: true
  },
  dateFor: {
    type: Date,
    required: true,
    index: true
  },
  lessonOrder: {
    type: Number,
    default: 1
  },
  attachment: {
    type: String
  },
  deadline: {
    type: Date
  },
  authorId: {
    type: Number
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: { expires: '14d' } // Авто-удаление через 14 дней после создания
  }
});

// Индекс для уникальности (класс + школа + предмет + дата)
HomeworkSchema.index({ classGrade: 1, school: 1, subject: 1, dateFor: 1 }, { unique: true });

// Метод для очистки старых записей (старше 14 дней) - ручная очистка если нужно
HomeworkSchema.statics.cleanupOldHomework = async function() {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  
  const result = await this.deleteMany({
    createdAt: { $lt: fourteenDaysAgo }
  });
  
  return result;
};

module.exports = model('Homework', HomeworkSchema);