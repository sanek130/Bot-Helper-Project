const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  telegramId: { type: Number, required: true, unique: true, index: true },
  username: String,
  fullName: String, // ФИО пользователя (обновленное поле)
  city: { type: String, required: true }, // Город
  school: { type: String, required: true }, // Школа
  classGrade: { type: String, required: true }, // Класс (например, "9А")
  role: { type: String, default: 'Ученик', enum: ['Ученик', 'Учитель', 'Админ'] },
  registered_at: { type: Date, default: Date.now },
  schedule: {
    type: Map,
    of: [{
      start: String,
      end: String
    }],
    default: {}
  }, // Расписание звонков по дням: monday, tuesday...
  notifications_enabled: { type: Boolean, default: true },
  stats: {
    homework_views: { type: Number, default: 0 },
    last_active: { type: Date, default: Date.now }
  }
});

// Индексы для быстрого поиска
UserSchema.index({ classGrade: 1, school: 1 });
UserSchema.index({ city: 1 });

module.exports = model('User', UserSchema);
