import { Schema, model } from 'mongoose';

const UserSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  username: String,
  first_name: String,
  last_name: String,
  class: { type: String, required: true },
  role: { type: String, default: "user" },
  registered_at: { type: Date, default: Date.now },
  custom_keyboard: [String],
  chat_type: String,
  chat_id: Number,
  notifications_enabled: { type: Boolean, default: true },
  stats: {
    homework_views: { type: Number, default: 0 },
    last_active: { type: Date, default: Date.now }
  }
});

UserSchema.index({ class: 1 });

export const User = model('User', UserSchema);