import { Homework } from '../db/models/Homework.js';
import { User } from '../db/models/User.js';
import { toDateKey } from './dateService.js';
import config from '../config.js';

/**
 * Удалить старые ДЗ (скользящее правило: дата < сегодня - CLEANUP_DAYS)
 */
export async function cleanupOldHomework() {
  const cutoffDateKey = toDateKey(new Date(Date.now() - config.cleanup.days * 24 * 60 * 60 * 1000));
  
  let processedClasses = 0;
  let deletedDays = 0;
  let deletedEntries = 0;
  
  try {
    const allHomework = await Homework.find({});
    
    for (const hw of allHomework) {
      try {
        let classDeletedDays = 0;
        let classDeletedEntries = 0;
        
        for (const dateKey of Object.keys(hw.data)) {
          if (dateKey < cutoffDateKey) {
            const entryCount = Object.keys(hw.data[dateKey]).length;
            delete hw.data[dateKey];
            classDeletedDays++;
            classDeletedEntries += entryCount;
          }
        }
        
        if (classDeletedDays > 0) {
          hw.updatedAt = new Date();
          await hw.save();
          processedClasses++;
          deletedDays += classDeletedDays;
          deletedEntries += classDeletedEntries;
        }
      } catch (e) {
        console.error(`Ошибка обработки класса ${hw.classKey}:`, e);
      }
    }
    
    // Удалить старые записи из completedHomework пользователей
    const updateResult = await User.updateMany(
      {},
      {
        $pull: {
          'completedHomework': {
            $exists: true
          }
        }
      }
    );
    
    // Фильтруем completedHomework вручную (MongoDB $pull с условием даты сложнее)
    const users = await User.find({});
    for (const user of users) {
      if (user.completedHomework) {
        let updated = false;
        for (const dateKey of Object.keys(user.completedHomework)) {
          if (dateKey < cutoffDateKey) {
            delete user.completedHomework[dateKey];
            updated = true;
          }
        }
        if (updated) {
          await user.save();
        }
      }
    }
    
    console.log(`✅ Очистка завершена:`);
    console.log(`   Классов обработано: ${processedClasses}`);
    console.log(`   Дней удалено: ${deletedDays}`);
    console.log(`   Записей удалено: ${deletedEntries}`);
    
    return {
      processedClasses,
      deletedDays,
      deletedEntries
    };
  } catch (e) {
    console.error('❌ Ошибка очистки старых ДЗ:', e);
    throw e;
  }
}

/**
 * Удалить pending-аккаунты старше 24 часов
 * (Это делает автоматически TTL-индекс, но можно вызвать вручную)
 */
export async function cleanupPendingAccounts() {
  try {
    const result = await User.deleteMany({
      status: 'pending',
      pendingExpiresAt: { $lt: new Date() }
    });
    
    if (result.deletedCount > 0) {
      console.log(`✅ Удалено pending-аккаунтов: ${result.deletedCount}`);
    }
    
    return result.deletedCount;
  } catch (e) {
    console.error('❌ Ошибка очистки pending-аккаунтов:', e);
    throw e;
  }
}
