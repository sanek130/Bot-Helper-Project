import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const users = await db.collection('users').find().toArray();
console.log(JSON.stringify(users, null, 1));
const hw = await db.collection('homeworks').find().toArray();
console.log(JSON.stringify(hw, null, 1));
await mongoose.disconnect();
