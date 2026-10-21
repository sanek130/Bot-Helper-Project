import 'dotenv/config';
import config from './config.js';
import { connectDB } from './db/connect.js';
import bot from './bot/bot.js';
import { startExpress } from './web/app.js';
import './bot/router.js';

async function start() {
  try {
    console.log('🚀 Запуск КлассныйБота...\n');
    
    // Подключение к MongoDB
    await connectDB();
    
    // Установка команд бота
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Начать и зарегистрироваться' },
      { command: 'menu', description: 'Главное меню' },
      { command: 'today', description: 'ДЗ на сегодня' },
      { command: 'tomorrow', description: 'ДЗ на завтра' },
      { command: 'week', description: 'ДЗ на неделю' },
      { command: 'schedule', description: 'Расписание' },
      { command: 'profile', description: 'Мой профиль' },
      { command: 'web', description: 'Веб-версия' },
      { command: 'help', description: 'Помощь' },
    ]);
    
    console.log('✅ Команды бота установлены');
    
    // Запуск Express (вебхук)
    await startExpress();
    
    console.log('\n✅ Бот готов к работе!');
    
    // Для разработки запускаем long polling
    // В продакшене используется вебхук
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n📡 Запуск в режиме long polling (разработка)...');
      bot.launch();
    }
    
  } catch (e) {
    console.error('❌ Ошибка запуска:', e);
    process.exit(1);
  }
}

// Graceful shutdown
process.once('SIGINT', () => {
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
});

start();
