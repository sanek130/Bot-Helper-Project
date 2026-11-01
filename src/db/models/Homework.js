import mongoose from 'mongoose';

const { Schema } = mongoose;

const homeworkSchema = new Schema(
  {
    // Формат «Школа::Класс», например «гимназия 25::10А».
    classKey: { type: String, required: true, trim: true },
    // Структура: { "YYYY-MM-DD": { "subjectHash": { subject, text, photoIds, addedBy, addedAt } } }.
    // minimize: false нужен, чтобы Mongoose не выкидывал пустые объекты дат при сохранении:
    // иначе день, из которого только что удалили последний предмет, «исчезает» до явной очистки,
    // а markModified('data') начинает работать непредсказуемо.
    data: { type: Schema.Types.Mixed, default: {} },
    schedulePhotoId: { type: String, default: null },
  },
  { timestamps: true, minimize: false },
);

homeworkSchema.index({ classKey: 1 }, { unique: true });

export const Homework = mongoose.models.Homework || mongoose.model('Homework', homeworkSchema);
export default Homework;
