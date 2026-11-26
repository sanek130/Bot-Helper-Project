import mongoose from 'mongoose';

const { Schema } = mongoose;

// Локальный класс — это «папка» для пары school::class. Состав участников здесь не дублируется:
// он живёт в User.classStatus, чтобы права проверялись по уже загруженному пользователю
// (клавиатуры строятся синхронно и не могут ждать запрос к БД).
// Запись LocalClass означает: «такой класс существует, у него есть свои участники».
const localClassSchema = new Schema(
  {
    // Формат «Школа::Класс» — тот же ключ, что у Homework.classKey.
    classKey: { type: String, required: true },
    city: { type: String, default: '', trim: true },
    school: { type: String, required: true, trim: true },
    className: { type: String, required: true, trim: true },
    // Кто создал класс (первый зарегистрировавшийся): нужен только для истории и отладки.
    founderSpecId: { type: String, default: '' },
  },
  { timestamps: true, minimize: false },
);

localClassSchema.index({ classKey: 1 }, { unique: true });
localClassSchema.index({ city: 1, school: 1 });

export const LocalClass = mongoose.models.LocalClass || mongoose.model('LocalClass', localClassSchema);
export default LocalClass;
