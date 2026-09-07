import { Schema, model } from 'mongoose';

const HomeworkSchema = new Schema({
  classKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  data: {
    type: Schema.Types.Mixed,
    default: {}
  },
  schedule_photo_id: {
    type: String
  },
  schedule_times: {
    type: Map,
    of: {
      lessons: [{
        start_time: String,
        end_time: String
      }],
      breaks: [{
        start_time: String,
        end_time: String
      }]
    },
    default: {}
  }, // Расписание времени уроков по дням недели (Пн, Вт, Ср...)
  updated_at: {
    type: Date,
    default: Date.now
  },
  expires_at: {
    type: Date,
    index: { expireAfterSeconds: 1209600 } // 14 дней в секундах (автоматическое удаление старых ДЗ)
  }
});

// Метод для очистки старых записей (старше 14 дней)
HomeworkSchema.statics.cleanupOldHomework = async function() {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  
  const result = await this.updateMany(
    { updated_at: { $lt: fourteenDaysAgo } },
    { $set: { data: {} } }
  );
  
  return result;
};

export const Homework = model('Homework', HomeworkSchema);