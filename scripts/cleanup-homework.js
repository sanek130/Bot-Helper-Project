/**
 * Скрипт автоудаления старых ДЗ
 * Запускается отдельно через Render Cron Job
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { cleanupOldHomework, cleanupPendingAccounts } from '../src/services/cleanupService.js';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI не задан в переменных окружения');
  process.exit(1);
}

async function main() {
  try {
    console.log('🚀 Запуск очистки старых ДЗ...\n');
    
    await mongoose.connect(MONGO_URI);
    console.log('✅ Подключено к MongoDB\n');
    
    // Очищаем старые ДЗ
    await cleanupOldHomework();
    console.log();
    
    // Очищаем pending-аккаунты
    await cleanupPendingAccounts();
    console.log();
    
    console.log('✅ Очистка завершена успешно!');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('❌ Ошибка очистки:', e);
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
