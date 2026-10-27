import mongoose from 'mongoose';
import { cleanupOldHomework, cleanupPendingAccounts } from '../src/services/cleanupService.js';

const uri = process.env.MONGO_URI;
const days = Number(process.env.CLEANUP_DAYS || 14);

if (!uri) {
  console.error('Не задана переменная MONGO_URI');
  process.exit(1);
}

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  const result = await cleanupOldHomework({ days });
  const pending = await cleanupPendingAccounts();
  console.log(`Готово: классов ${result.processedClasses}, дней ${result.deletedDays}, записей ${result.deletedEntries}, удалено pending ${pending}`);
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('Очистка не удалась:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
