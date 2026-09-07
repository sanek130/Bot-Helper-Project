import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    fullName: { type: String, required: true },
    city: { type: String, required: true },
    school: { type: String, required: true },
    classGrade: { type: String, required: true }, // Например "9А"
    role: { 
        type: String, 
        enum: ['student', 'teacher', 'admin'], 
        default: 'student' 
    },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', UserSchema);
