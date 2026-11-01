import mongoose from 'mongoose';
import { config } from '../config.js';

export async function connectDB(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB подключена');
    return mongoose.connection;
  } catch (err) {
    console.error(`Не удалось подключиться к MongoDB: ${err.message}. Проверь MONGO_URI и Network Access в Atlas.`);
    process.exit(1);
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

// 0 = отключено, 1 = подключено, 2 = подключается, 3 = отключается
export function dbState() {
  return mongoose.connection.readyState;
}
