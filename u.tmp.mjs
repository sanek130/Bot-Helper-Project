import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGO_URI);
const u = await mongoose.connection.db.collection('users').findOne({ tgId: 555 });
console.log(JSON.stringify({ completedHomework: u.completedHomework, stats: u.stats }, null, 1));
await mongoose.disconnect();
