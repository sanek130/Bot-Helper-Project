import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
await db.dropDatabase();
await db.collection('users').insertMany([
  { id: 555, chat_id: 555, first_name: 'Старый', username: 'old', city: 'Краснодар', school: 'школа 2', class: '10Б', role: 'admin', completed_homework: { '2026-10-20': ['Алгебра'] }, custom_keyboard: ['Сегодня'], pending_admin_request: true, notification_slot: '18:00', notifications_enabled: true, created_at: new Date('2026-01-01') },
  { id: 777, city: 'Краснодар', school: 'школа 2', class: '10Б', role: 'user' },
]);
await db.collection('homeworks').insertOne({ classKey: '10Б', data: { '2026-09-01': { Алгебра: { text: 'old' } }, '2026-10-20': { Русский: { text: 'new' } } }, schedulePhotoId: 'keep-me' });
console.log('seeded');
await mongoose.disconnect();
