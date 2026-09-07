import mongoose from 'mongoose';

const HomeworkSchema = new mongoose.Schema({
    classGrade: { type: String, required: true },
    school: { type: String, required: true },
    subject: { type: String, required: true },
    task: { type: String, required: true },
    dateFor: { type: String, required: true }, // Формат YYYY-MM-DD
    addedBy: { type: Number }, // Telegram ID учителя
    createdAt: { type: Date, default: Date.now, expires: 1209600 } // Автоудаление через 14 дней (в секундах)
});

// Индекс для быстрого поиска
HomeworkSchema.index({ classGrade: 1, school: 1, dateFor: 1 });

export default mongoose.model('Homework', HomeworkSchema);
