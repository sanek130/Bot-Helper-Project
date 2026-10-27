import mongoose from 'mongoose';
import config from '../config.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 10_000 });
    console.log('MongoDB подключена');
  } catch (error) {
    console.error('Не удалось подключиться к MongoDB. Проверь MONGO_URI, пароль и доступ к кластеру.');
    throw error;
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

export function dbState() {
  return mongoose.connection.readyState === 1 ? 'ok' : 'down';
}
