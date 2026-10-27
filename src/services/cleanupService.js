import { Homework } from '../db/models/Homework.js';
import { User } from '../db/models/User.js';
import { toDateKey, addDaysToKey } from './dateService.js';

// Чистая очистка одного дня: удаляет даты раньше cutoff, возвращает копию
export function cleanupHomeworkData(data, cutoffKey) {
  const next = {};
  let deletedDays = 0;
  let deletedEntries = 0;

  for (const [dateKey, day] of Object.entries(data || {})) {
    if (dateKey < cutoffKey) {
      deletedDays += 1;
      deletedEntries += Object.keys(day || {}).length;
    } else {
      next[dateKey] = day;
    }
  }

  return { data: next, deletedDays, deletedEntries };
}

export function cleanupCompletedHomework(completed, cutoffKey) {
  const next = {};
  let deleted = 0;

  for (const [dateKey, subjects] of Object.entries(completed || {})) {
    if (dateKey < cutoffKey) deleted += 1;
    else next[dateKey] = subjects;
  }

  return { completed: next, deleted };
}

export function getCutoffKey(days) {
  return addDaysToKey(toDateKey(), -days);
}

export async function cleanupOldHomework({ days } = {}) {
  const cleanupDays = Number(days) || 14;
  const cutoffKey = getCutoffKey(cleanupDays);

  let processedClasses = 0;
  let deletedDays = 0;
  let deletedEntries = 0;

  const classes = await Homework.find({});
  for (const doc of classes) {
    processedClasses += 1;
    try {
      const result = cleanupHomeworkData(doc.data, cutoffKey);
      if (result.deletedDays > 0) {
        doc.data = result.data;
        doc.markModified('data');
        doc.updatedAt = new Date();
        await doc.save();
        deletedDays += result.deletedDays;
        deletedEntries += result.deletedEntries;
      }
    } catch (error) {
      // Ошибка одного класса не останавливает остальные
      console.error(`Очистка: класс ${doc.classKey} пропущен`, error.message);
    }
  }

  const users = await User.find({ completedHomework: { $ne: null } });
  for (const user of users) {
    const result = cleanupCompletedHomework(user.completedHomework, cutoffKey);
    if (result.deleted > 0) {
      user.completedHomework = result.completed;
      user.markModified('completedHomework');
      await user.save();
    }
  }

  console.log(`Очистка ДЗ: классов ${processedClasses}, дней ${deletedDays}, записей ${deletedEntries}`);
  return { processedClasses, deletedDays, deletedEntries, cutoffKey };
}

export async function cleanupPendingAccounts() {
  const result = await User.deleteMany({
    status: 'pending',
    pendingExpiresAt: { $lt: new Date() },
  });
  return result.deletedCount || 0;
}
