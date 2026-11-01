#!/usr/bin/env node
// db-only.js импортируется первым: config.js проверяет только MONGO_URI, поэтому Cron Job работает без BOT_TOKEN.
import './lib/db-only.js';
import 'dotenv/config';
import { config } from '../src/config.js';
import { connectDB, disconnectDB } from '../src/db/connect.js';
import { cleanupOldHomework, cleanupPendingAccounts } from '../src/services/cleanupService.js';

async function main() {
  console.log(`[${new Date().toISOString()}] Запуск очистки старых ДЗ...`);
  try {
    await connectDB();
    const hwResult = await cleanupOldHomework(config.cleanupDays);
    console.log(`Обработано классов: ${hwResult.classesProcessed}`);
    console.log(`Удалено дней: ${hwResult.daysRemoved}`);
    console.log(`Удалено записей: ${hwResult.recordsRemoved}`);
    const pendingResult = await cleanupPendingAccounts();
    console.log(`Удалено pending-аккаунтов: ${pendingResult.removedCount}`);
    await disconnectDB();
    console.log(`[${new Date().toISOString()}] Очистка завершена успешно.`);
    process.exit(0);
  } catch (err) {
    console.error('Критическая ошибка:', err.message);
    try {
      await disconnectDB();
    } catch {
      // Соединение могло так и не открыться — закрывать нечего.
    }
    process.exit(1);
  }
}

main();
