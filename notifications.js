import cron from 'node-cron';
import { User } from './models/User.js';
import { Homework } from './models/Homework.js';
import { appConfig } from './config.js';
import { toDateKey, addDaysToKey, getSubjectIcon, EMOJI } from './ui.js';

let bot;

export const initNotifications = (telegramBot) => {
  bot = telegramBot;

  console.log('🔔 Система уведомлений инициализирована');

  // 18:00 — пользователи со слотом 18
  cron.schedule(
    '0 18 * * *',
    () => sendRemindersForSlot('18'),
    { timezone: appConfig.timezone }
  );

  // 20:00 — пользователи со слотом 20
  cron.schedule(
    '0 20 * * *',
    () => sendRemindersForSlot('20'),
    { timezone: appConfig.timezone }
  );

  console.log('📅 Планировщик уведомлений запущен');
};

const sendRemindersForSlot = async (slot) => {
  try {
    console.log(`⏰ Напоминания для слота ${slot}:00...`);

    const users = await User.find({
      notification_slot: slot,
      notifications_enabled: true,
      role: { $ne: 'admin' },
    });

    if (users.length === 0) {
      console.log('👥 Нет пользователей для этого слота');
      return;
    }

    const usersByClass = {};
    for (const user of users) {
      if (!usersByClass[user.class]) usersByClass[user.class] = [];
      usersByClass[user.class].push(user);
    }

    const tomorrowKey = addDaysToKey(toDateKey(), 1);

    for (const [classKey, classUsers] of Object.entries(usersByClass)) {
      try {
        const homework = await Homework.findOne({ classKey });
        if (!homework?.data) continue;

        const tomorrowHomework = homework.data[tomorrowKey];
        if (!tomorrowHomework || Object.keys(tomorrowHomework).length === 0) continue;

        const message = createTomorrowReminder(classKey, tomorrowKey, tomorrowHomework);

        for (const user of classUsers) {
          try {
            await bot.telegram.sendMessage(user.chat_id, message, { parse_mode: 'Markdown' });
          } catch (error) {
            console.error(`❌ Ошибка отправки ${user.id}:`, error.message);
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      } catch (error) {
        console.error(`❌ Класс ${classKey}:`, error);
      }
    }

    console.log('✅ Напоминания отправлены');
  } catch (error) {
    console.error('❌ Ошибка системы уведомлений:', error);
  }
};

const createTomorrowReminder = (classKey, dateKey, homework) => {
  let message = `${EMOJI.bell} *ДЗ на завтра*\n\n`;
  message += `${EMOJI.school} ${classKey}\n`;
  message += `${EMOJI.day} ${dateKey}\n\n`;

  for (const [subject, task] of Object.entries(homework)) {
    const icon = getSubjectIcon(subject);
    const text = typeof task === 'object' && task.text ? task.text : task;
    message += `${icon} *${subject}*\n${text}\n\n`;
  }

  message += `Открой /day или кнопку «Завтра» в меню.`;
  return message;
};

export const sendPersonalNotification = async (userId, message) => {
  try {
    if (!bot) return false;
    const user = await User.findOne({ id: userId.toString() });
    if (!user || !user.notifications_enabled) return false;
    await bot.telegram.sendMessage(user.chat_id, message);
    return true;
  } catch (error) {
    console.error(`❌ Персональное уведомление ${userId}:`, error);
    return false;
  }
};

export const sendClassNotification = async (classKey, message, excludeAdmins = true) => {
  try {
    if (!bot) return 0;
    const filter = { class: classKey, notifications_enabled: true };
    if (excludeAdmins) filter.role = { $ne: 'admin' };
    const users = await User.find(filter);
    let sentCount = 0;
    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.chat_id, message);
        sentCount++;
        await new Promise((r) => setTimeout(r, 100));
      } catch (error) {
        console.error(`❌ ${user.id}:`, error.message);
      }
    }
    return sentCount;
  } catch (error) {
    console.error('❌ Классовое уведомление:', error);
    return 0;
  }
};

export {
  sendRemindersForSlot,
  createTomorrowReminder,
};
