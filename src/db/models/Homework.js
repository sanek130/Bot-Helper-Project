import { Schema, model } from 'mongoose';

const homeworkSchema = new Schema(
  {
    // "Школа::Класс"
    classKey: { type: String, required: true, unique: true },
    // { "2026-10-05": { "Алгебра": { text, photoIds, addedBy, addedAt } } }
    data: { type: Schema.Types.Mixed, default: {} },
    schedulePhotoId: String,
    updatedAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);


export const Homework = model('Homework', homeworkSchema);
