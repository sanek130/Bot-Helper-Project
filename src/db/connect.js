import mongoose from 'mongoose';
import config from '../config.js';

export async function connectDB() {
  try {
    await mongoose.connect(config.mongo.uri);
    console.log('✅ MongoDB подключена успешно!');
  } catch (error) {
    console.error('❌ Ошибка подключения к MongoDB:', error);
    process.exit(1);
  }
}

mongoose.connection.on('error', (err) => {
  console.error('❌ Ошибка MongoDB:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB отключена');
});
