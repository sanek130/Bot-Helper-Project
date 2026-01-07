import cron from 'node-cron';
import { User } from './models/User.js';
import { Homework } from './models/Homework.js';
import config from './config.js';

let bot; // Будет установлен при инициализации

// Инициализация системы уведомлений
export const initNotifications = (telegramBot) => {
  bot = telegramBot;
  
  console.log('🔔 Система уведомлений инициализирована');
  
  // Уведомления о новом ДЗ (каждый день в 18:00)
  cron.schedule('0 18 * * *', () => {
    sendHomeworkNotifications();
  }, {
    timezone: config.appConfig.timezone
  });
  
  // Напоминание о ДЗ на завтра (каждый день в 20:00)
  cron.schedule('0 20 * * *', () => {
    sendTomorrowReminder();
  }, {
    timezone: config.appConfig.timezone
  });
  
  console.log('📅 Планировщик уведомлений запущен');
};

// Получение завтрашней даты
const getTomorrowDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const options = { 
    timeZone: config.appConfig.timezone,
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  };
  return tomorrow.toLocaleDateString('ru-RU', options);
};

// Отправка уведомлений о новом ДЗ
const sendHomeworkNotifications = async () => {
  try {
    console.log('🔔 Проверка новых ДЗ для уведомлений...');
    
    // Получаем всех пользователей с включенными уведомлениями
    const users = await User.find({ 
      notifications_enabled: true,
      role: { $ne: 'admin' } // Админам не отправляем
    });
    
    if (users.length === 0) {
      console.log('👥 Пользователей с уведомлениями не найдено');
      return;
    }
    
    // Группируем пользователей по классам
    const usersByClass = {};
    users.forEach(user => {
      if (!usersByClass[user.class]) {
        usersByClass[user.class] = [];
      }
      usersByClass[user.class].push(user);
    });
    
    // Проверяем ДЗ для каждого класса
    for (const [classKey, classUsers] of Object.entries(usersByClass)) {
      try {
        const homework = await Homework.findOne({ classKey });
        
        if (!homework || !homework.data) {
          continue;
        }
        
        const today = new Date().toLocaleDateString('ru-RU', { 
          timeZone: config.appConfig.timezone,
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        });
        
        const todayHomework = homework.data[today];
        
        if (todayHomework && Object.keys(todayHomework).length > 0) {
          const message = createHomeworkNotification(classKey, today, todayHomework);
          
          // Отправляем уведомление всем пользователям класса
          for (const user of classUsers) {
            try {
              await bot.telegram.sendMessage(user.chat_id, message);
              console.log(`✅ Уведомление отправлено пользователю ${user.id} (${user.first_name})`);
            } catch (error) {
              console.error(`❌ Ошибка отправки пользователю ${user.id}:`, error.message);
            }
            
            // Небольшая задержка между отправками
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
      } catch (error) {
        console.error(`❌ Ошибка обработки класса ${classKey}:`, error);
      }
    }
    
    console.log('✅ Проверка уведомлений завершена');
    
  } catch (error) {
    console.error('❌ Ошибка системы уведомлений:', error);
  }
};

// Отправка напоминаний о завтрашнем ДЗ
const sendTomorrowReminder = async () => {
  try {
    console.log('⏰ Отправка напоминаний о завтрашнем ДЗ...');
    
    const users = await User.find({ 
      notifications_enabled: true,
      role: { $ne: 'admin' }
    });
    
    if (users.length === 0) {
      console.log('👥 Пользователей с уведомлениями не найдено');
      return;
    }
    
    const usersByClass = {};
    users.forEach(user => {
      if (!usersByClass[user.class]) {
        usersByClass[user.class] = [];
      }
      usersByClass[user.class].push(user);
    });
    
    const tomorrowDate = getTomorrowDate();
    
    for (const [classKey, classUsers] of Object.entries(usersByClass)) {
      try {
        const homework = await Homework.findOne({ classKey });
        
        if (!homework || !homework.data) {
          continue;
        }
        
        const tomorrowHomework = homework.data[tomorrowDate];
        
        if (tomorrowHomework && Object.keys(tomorrowHomework).length > 0) {
          const message = createTomorrowReminder(classKey, tomorrowDate, tomorrowHomework);
          
          for (const user of classUsers) {
            try {
              await bot.telegram.sendMessage(user.chat_id, message);
              console.log(`📢 Напоминание отправлено пользователю ${user.id}`);
            } catch (error) {
              console.error(`❌ Ошибка отправки напоминания пользователю ${user.id}:`, error.message);
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
      } catch (error) {
        console.error(`❌ Ошибка обработки напоминаний для класса ${classKey}:`, error);
      }
    }
    
    console.log('✅ Отправка напоминаний завершена');
    
  } catch (error) {
    console.error('❌ Ошибка отправки напоминаний:', error);
  }
};

// Создание текста уведомления о ДЗ
const createHomeworkNotification = (classKey, date, homework) => {
  let message = `🔔 **Новое домашнее задание!**\n\n`;
  message += `🎓 Класс: ${classKey}\n`;
  message += `📅 Дата: ${date}\n\n`;
  
  for (const [subject, task] of Object.entries(homework)) {
    message += `📖 **${subject}**\n`;
    if (typeof task === 'object' && task.text) {
      message += `${task.text}\n`;
      if (task.photos && task.photos.length > 0) {
        message += `📷 Есть фотография\n`;
      }
    } else {
      message += `${task}\n`;
    }
    message += '\n';
  }
  
  message += `💡 Используй команду /start для просмотра всех заданий`;
  
  return message;
};

// Создание текста напоминания о завтрашнем ДЗ
const createTomorrowReminder = (classKey, date, homework) => {
  let message = `⏰ **Напоминание о домашнем задании на завтра!**\n\n`;
  message += `🎓 Класс: ${classKey}\n`;
  message += `📅 Завтра (${date}):\n\n`;
  
  for (const [subject, task] of Object.entries(homework)) {
    message += `📖 **${subject}**\n`;
    if (typeof task === 'object' && task.text) {
      message += `${task.text}\n`;
    } else {
      message += `${task}\n`;
    }
    message += '\n';
  }
  
  message += `📚 Не забудь подготовиться! Удачи! 🍀`;
  
  return message;
};

// Отправка персонального уведомления
export const sendPersonalNotification = async (userId, message) => {
  try {
    if (!bot) {
      console.error('❌ Бот не инициализирован для уведомлений');
      return false;
    }
    
    const user = await User.findOne({ id: userId.toString() });
    if (!user || !user.notifications_enabled) {
      return false;
    }
    
    await bot.telegram.sendMessage(user.chat_id, message);
    console.log(`✅ Персональное уведомление отправлено пользователю ${userId}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Ошибка отправки персонального уведомления пользователю ${userId}:`, error);
    return false;
  }
};

// Отправка уведомления всему классу
export const sendClassNotification = async (classKey, message, excludeAdmins = true) => {
  try {
    if (!bot) {
      console.error('❌ Бот не инициализирован для уведомлений');
      return 0;
    }
    
    const filter = { 
      class: classKey, 
      notifications_enabled: true 
    };
    
    if (excludeAdmins) {
      filter.role = { $ne: 'admin' };
    }
    
    const users = await User.find(filter);
    let sentCount = 0;
    
    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.chat_id, message);
        sentCount++;
        console.log(`✅ Классовое уведомление отправлено пользователю ${user.id}`);
        
        // Задержка между отправками
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Ошибка отправки пользователю ${user.id}:`, error.message);
      }
    }
    
    console.log(`📊 Классовое уведомление отправлено ${sentCount} из ${users.length} пользователей`);
    return sentCount;
    
  } catch (error) {
    console.error('❌ Ошибка отправки классового уведомления:', error);
    return 0;
  }
};

// Экспорт функций
export {
  sendHomeworkNotifications,
  sendTomorrowReminder,
  createHomeworkNotification,
  createTomorrowReminder
};
