import { Schema, model } from 'mongoose';

const HomeworkSchema = new Schema({
    classKey: { type: String, required: true, unique: true, index: true },
  data: { type: Schema.Types.Mixed, default: {} },
  schedule_photo_id: String,
  updated_at: { type: Date, default: Date.now }
});


export const Homework = model('Homework', HomeworkSchema);