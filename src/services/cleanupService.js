import { config } from '../config.js';
import { Homework } from '../db/models/Homework.js';
import { User } from '../db/models/User.js';
import { Session } from '../db/models/Session.js';
import { LoginRequest } from '../db/models/LoginRequest.js';
import { Token } from '../db/models/Token.js';
import { toDateKey, addDays } from '../utils/dateService.js';
import { parseClassKey, removeHomeworkByAdmin } from './homeworkService.js';
import { escapeRegex } from '../utils/normalize.js';

export { removeHomeworkByAdmin };

function exact(value) {
  return new RegExp(`^${escapeRegex(String(value ?? '').trim())}$`, 'i');
}

export async function cleanupOldHomework(days = config.cleanupDays) {
  const safeDays = Math.max(0, Number(days) || 0);
  const cutoff = toDateKey(addDays(new Date(), -safeDays));
  let classesProcessed = 0;
  let daysRemoved = 0;
  let recordsRemoved = 0;
  const documents = await Homework.find({});
  for (const homework of documents) {
    try {
      const removedDates = [];
      for (const dateKey of Object.keys(homework.data || {})) {
        if (dateKey < cutoff) {
          recordsRemoved += Object.keys(homework.data[dateKey] || {}).length;
          delete homework.data[dateKey];
          removedDates.push(dateKey);
        }
      }
      if (removedDates.length > 0) {
        homework.markModified('data');
        await homework.save();
        const { school, class: className } = parseClassKey(homework.classKey);
        const unset = {};
        for (const dateKey of removedDates) unset[`completedHomework.${dateKey}`] = '';
        await User.updateMany({ school: exact(school), class: exact(className) }, { $unset: unset });
        daysRemoved += removedDates.length;
      }
      classesProcessed += 1;
    } catch (err) {
      // Ошибка одного класса не должна останавливать очистку остальных.
      console.error(`cleanup: класс ${homework.classKey} пропущен: ${err.message}`);
    }
  }
  return { classesProcessed, daysRemoved, recordsRemoved };
}

export async function cleanupPendingAccounts() {
  const expired = await User.find({ status: 'pending', pendingExpiresAt: { $lt: new Date() } }, { specId: 1, tgId: 1 });
  let removedCount = 0;
  for (const user of expired) {
    await Promise.all([
      Token.deleteMany({ userId: user.specId }),
      LoginRequest.deleteMany({ userId: user.specId }),
      Session.deleteMany({ userId: { $in: [user.specId, String(user.tgId ?? '')] } }),
    ]);
    const result = await User.deleteOne({ _id: user._id, status: 'pending' });
    removedCount += result.deletedCount || 0;
  }
  return { removedCount };
}
