import mongoose from 'mongoose';

// Заявка на роль администратора/учителя
const AdminRequestSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true },
  fullName: { type: String, required: true },
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  classGrade: { type: String },
  requestedRole: { 
    type: String, 
    enum: ['class_admin', 'admin'], 
    default: 'class_admin' 
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedBy: { type: Number }, // telegramId админа, рассмотревшего заявку
  reviewedAt: Date,
  comment: String,
  createdAt: { type: Date, default: Date.now }
});

// Индекс для TTL - заявки хранятся 30 дней
AdminRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
AdminRequestSchema.index({ telegramId: 1, status: 1 });

export const AdminRequest = mongoose.models.AdminRequest || 
  mongoose.model('AdminRequest', AdminRequestSchema);

// Город (справочник)
const CitySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  status: { 
    type: String, 
    enum: ['approved', 'pending_review', 'rejected'], 
    default: 'approved' 
  },
  createdBy: Number,
  createdAt: { type: Date, default: Date.now }
});

export const City = mongoose.models.City || 
  mongoose.model('City', CitySchema);

// Школа (справочник)
const SchoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  city: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
  status: { 
    type: String, 
    enum: ['approved', 'pending_review', 'rejected'], 
    default: 'approved' 
  },
  createdBy: Number,
  createdAt: { type: Date, default: Date.now }
});

SchoolSchema.index({ city: 1, name: 1 }, { unique: true });

export const School = mongoose.models.School || 
  mongoose.model('School', SchoolSchema);

// Календарь (праздники/каникулы)
const CalendarSchema = new mongoose.Schema({
  date: { type: Date, required: true, unique: true },
  type: { 
    type: String, 
    enum: ['holiday', 'vacation', 'weekend'], 
    required: true 
  },
  description: String,
  createdAt: { type: Date, default: Date.now }
});

export const Calendar = mongoose.models.Calendar || 
  mongoose.model('Calendar', CalendarSchema);

// Журнал аудита действий
const AuditLogSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  action: { 
    type: String, 
    enum: [
      'homework_create', 'homework_update', 'homework_delete',
      'schedule_update', 'bell_schedule_update',
      'user_role_change', 'broadcast_sent'
    ], 
    required: true 
  },
  payload: { type: mongoose.Schema.Types.Mixed },
  targetType: { type: String }, // 'homework', 'schedule', 'user'
  targetId: { type: mongoose.Schema.Types.ObjectId },
  createdAt: { type: Date, default: Date.now }
});

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });

export const AuditLog = mongoose.models.AuditLog || 
  mongoose.model('AuditLog', AuditLogSchema);

// Расписание звонков
const BellScheduleSchema = new mongoose.Schema({
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  classGrade: { type: String, required: true }, // "9А", "10Б" или "9" для параллели
  lessonNumber: { type: Number, required: true },
  startTime: { type: String, required: true }, // "08:00"
  endTime: { type: String, required: true },   // "08:45"
  dayOfWeek: { type: Number, min: 1, max: 7 } // 1=Пн, 7=Вс, если не указано - для всех дней
});

BellScheduleSchema.index({ school: 1, classGrade: 1, lessonNumber: 1, dayOfWeek: 1 }, { unique: true });

export const BellSchedule = mongoose.models.BellSchedule || 
  mongoose.model('BellSchedule', BellScheduleSchema);

// Пользователь (расширенная схема из ТЗ)
const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  fullName: { type: String, required: true },
  city: { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  classGrade: { type: String, required: true },
  role: {
    type: String,
    enum: ['student', 'class_admin', 'admin'],
    default: 'student'
  },
  timezone: { type: String, default: 'Europe/Moscow' },
  notifyHwTime: { type: String, default: '20:00' },
  notifications_enabled: { type: Boolean, default: true },
  stats: {
    homework_views: { type: Number, default: 0 },
    last_active: Date
  },
  createdAt: { type: Date, default: Date.now }
});

UserSchema.index({ telegramId: 1 });
UserSchema.index({ classGrade: 1, school: 1 });

export const User = mongoose.models.User ||
  mongoose.model('User', UserSchema);

// Домашнее задание (с поддержкой нескольких вложений)
const HomeworkSchema = new mongoose.Schema({
  classGrade: { type: String, required: true },
  subject: { type: String, required: true },
  task: { type: String, required: true },
  dueDate: { type: Date, required: true },
  attachments: [{
    fileId: String,
    fileType: { type: String, enum: ['photo', 'document', 'video', 'audio'] },
    fileName: String
  }],
  createdBy: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});

// TTL индекс - удаление старых ДЗ через 14 дней после даты выполнения
HomeworkSchema.index({ dueDate: 1 }, { expireAfterSeconds: 1209600 });
HomeworkSchema.index({ classGrade: 1, dueDate: 1 });
HomeworkSchema.index({ isActive: 1, dueDate: -1 });

HomeworkSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const Homework = mongoose.models.Homework ||
  mongoose.model('Homework', HomeworkSchema);
