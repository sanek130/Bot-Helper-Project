import { User } from '../db/models/User.js';
import { getClassKey } from './homeworkService.js';
import { escapeHtml } from '../utils/normalize.js';

/**
 * Отправить рассылку
 */
export async function sendBroadcast(bot, target, value, message) {
  let recipients = [];
  let targetDescription = '';
  
  try {
    switch (target) {
      case 'all':
        recipients = await User.find({ tgId: { $exists: true } });
        targetDescription = 'всем пользователям';
        break;
      case 'city':
        recipients = await User.find({ city: value, tgId: { $exists: true } });
        targetDescription = `пользователям из города ${value}`;
        break;
      case 'school':
        recipients = await User.find({ school: value, tgId: { $exists: true } });
        targetDescription = `пользователям из школы ${value}`;
        break;
      case 'class':
        const sep = value.indexOf('::');
        if (sep !== -1) {
          const school = value.slice(0, sep);
          const className = value.slice(sep + 2);
          recipients = await User.find({ school, class: className, tgId: { $exists: true } });
        } else {
          recipients = await User.find({ class: value, tgId: { $exists: true } });
        }
        targetDescription = `ученикам класса ${value}`;
        break;
      default:
        return { success: false, error: 'Неизвестный тип цели' };
    }
    
    if (recipients.length === 0) {
      return { success: false, error: 'Нет получателей', count: 0 };
    }
    
    // Экранируем сообщение для HTML
    const escapedMessage = escapeHtml(message);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const recipient of recipients) {
      try {
        await bot.telegram.sendMessage(recipient.tgId, escapedMessage, {
          parse_mode: 'HTML'
        });
        successCount++;
        // Пауза 100 мс между сообщениями
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        if (e.description?.includes('bot was blocked')) {
          // Пользователь заблокировал бота - пропускаем
          failCount++;
        } else {
          console.error(`Ошибка отправки пользователю ${recipient.tgId}:`, e.message);
          failCount++;
        }
      }
    }
    
    return {
      success: true,
      delivered: successCount,
      failed: failCount,
      total: recipients.length,
      targetDescription
    };
  } catch (e) {
    console.error('Ошибка рассылки:', e);
    return { success: false, error: e.message };
  }
}
