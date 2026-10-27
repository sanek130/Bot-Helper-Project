import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
await db.collection('users').updateOne({ tgId: 555 }, { $set: { completedHomework: { '2026-09-01': ['Алгебра'], '2026-10-20': ['Русский'] }, stats: { homeworkViews: 7, homeworkAdded: 2 } } });
console.log('prepared');
await mongoose.disconnect();
