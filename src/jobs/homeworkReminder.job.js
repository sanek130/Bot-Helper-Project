const cron = require('node-cron');
const Homework = require('../models').Homework;
const User = require('../models').User;
const logger = require('../config/logger').child({ module: 'homeworkReminder' });

/**
 * Cron-задача для ежедневных напоминаний о ДЗ
 * Запускается в заданное пользователем время (по умолчанию 20:00)
 */
function initHomeworkReminder(bot) {
  // Запускаем проверку каждые 15 минут
  const job = cron.schedule('*/15 * * * *', async () => {
    try {
      await checkAndSendReminders(bot);
    } catch (error) {
      logger.error({ error }, 'Ошибка в задаче напоминаний о ДЗ');
    }
  });

  logger.info('Задача напоминаний о ДЗ инициализирована');
  
  return job;
}

/**
 * Проверка и отправка напоминаний пользователям
 */
async function checkAndSendReminders(bot) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // Находим пользователей, у которых сейчас время напоминания
  // Для простоты проверяем всех с notifications_enabled = true
  const usersToNotify = await User.find({ 
    notifications_enabled: true,
    role: 'student'
  }).lean();
  
  for (const user of usersToNotify) {
    // Парсим время уведомления пользователя (формат "HH:MM")
    const [notifyHour, notifyMinute] = (user.notifyHwTime || '20:00').split(':').map(Number);
    
    // Проверяем, совпадает ли текущее время с временем уведомления пользователя
    // Учитываем часовой пояс пользователя
    const userTime = getUserTime(now, user.timezone);
    
    if (userTime.getHours() === notifyHour && userTime.getMinutes() >= notifyMinute && userTime.getMinutes() < notifyMinute + 15) {
      try {
        await sendHomeworkReminder(bot, user);
      } catch (error) {
        logger.warn({ userId: user.telegramId, error }, 'Не удалось отправить напоминание');
      }
      
      // Небольшая задержка между отправками
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Отправка напоминания конкретному пользователю
 */
async function sendHomeworkReminder(bot, user) {
  // Получаем ДЗ на завтра для класса пользователя
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  
  const homeworks = await Homework.find({
    classGrade: user.classGrade,
    dueDate: {
      $gte: tomorrow,
      $lt: dayAfterTomorrow
    }
  }).sort({ subject: 1 }).lean();
  
  if (homeworks.length === 0) {
    // Нет ДЗ на завтра - можно отправить уведомление об этом
    await bot.telegram.sendMessage(
      user.telegramId,
      `🌙 Добрый вечер, ${user.fullName.split(' ')[0]}!\n\n` +
      `✅ На завтра домашних заданий нет.\n` +
      `Можете отдыхать! 😊`
    );
    return;
  }
  
  // Формируем сообщение со списком ДЗ
  let message = `🌙 Добрый вечер, ${user.fullName.split(' ')[0]}!\n\n` +
    `📚 Домашнее задание на завтра:\n\n`;
  
  for (const hw of homeworks) {
    const icon = getSubjectIcon(hw.subject);
    message += `${icon} *${hw.subject}*\n`;
    message += `${hw.task}\n\n`;
  }
  
  message += `Удачи в выполнении! 💪`;
  
  await bot.telegram.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
  
  logger.info({ userId: user.telegramId, homeworkCount: homeworks.length }, 'Напоминание о ДЗ отправлено');
}

/**
 * Получить время в часовом поясе пользователя
 * Упрощённая реализация без внешних библиотек
 */
function getUserTime(utcDate, timezone) {
  // Создаём копию даты
  const date = new Date(utcDate.getTime());
  
  // Простая маппинг основных часовых поясов СНГ
  const tzOffsets = {
    'Europe/Moscow': 3,
    'Europe/Minsk': 3,
    'Europe/Kiev': 2,
    'Asia/Yekaterinburg': 5,
    'Asia/Omsk': 6,
    'Asia/Novosibirsk': 7,
    'Asia/Krasnoyarsk': 7,
    'Asia/Irkutsk': 8,
    'Asia/Yakutsk': 9,
    'Asia/Vladivostok': 10,
    'Asia/Magadan': 11,
    'Asia/Kamchatka': 12,
    'Asia/Almaty': 5,
    'Asia/Tashkent': 5
  };
  
  const offset = tzOffsets[timezone] || 3; // По умолчанию Москва
  
  // Добавляем смещение к UTC времени
  date.setUTCHours(date.getUTCHours() + offset);
  
  return date;
}

/**
 * Получить иконку предмета
 */
function getSubjectIcon(subject) {
  const icons = {
    'математика': '📐',
    'алгебра': '📐',
    'геометрия': '📐',
    'физика': '⚡',
    'химия': '🧪',
    'биология': '🧬',
    'история': '📜',
    'география': '🌍',
    'русский': '📝',
    'литература': '📚',
    'english': '🇬🇧',
    'информатика': '💻',
    'физкультура': '⚽',
    'музыка': '🎵',
    'рисование': '🎨'
  };
  
  const lowerSubject = subject.toLowerCase();
  for (const [key, icon] of Object.entries(icons)) {
    if (lowerSubject.includes(key)) {
      return icon;
    }
  }
  
  return '📖';
}

module.exports = {
  initHomeworkReminder
};
