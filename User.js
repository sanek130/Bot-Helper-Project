import { Schema, model } from 'mongoose';

const UserSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  username: String,
  first_name: String,
  last_name: String,
  class: { type: String, required: true },
  role: { type: String, default: 'user' },
  registered_at: { type: Date, default: Date.now },
  custom_keyboard: [String],
  chat_type: String,
  chat_id: Number,
  notifications_enabled: { type: Boolean, default: true },
  /** 'off' | '18' | '20' — when to send evening reminders */
  notification_slot: { type: String, default: '20', enum: ['off', '18', '20'] },
  /** Completed homework: { "YYYY-MM-DD": ["Алгебра", ...] } */
  completed_homework: {
    type: Schema.Types.Mixed,
    default: {},
  },
  pending_admin_request: Boolean,
  stats: {
    homework_views: { type: Number, default: 0 },
    last_active: { type: Date, default: Date.now },
  },
});

UserSchema.index({ class: 1 });

export const User = model('User', UserSchema);
