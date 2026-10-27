import config from './config.js';
import { connectDB, disconnectDB } from './db/connect.js';
import bot from './bot/bot.js';
import { startServer } from './web/app.js';
import { cleanupPendingAccounts } from './services/cleanupService.js';
import './bot/router.js';

let server;

async function start() {
  try {
    await connectDB();
    try {
      await bot.telegram.setMyCommands([
        { command: 'start', description: 'Начать и зарегистрироваться' },
        { command: 'menu', description: 'Главное меню' },
        { command: 'today', description: 'ДЗ на сегодня' },
        { command: 'tomorrow', description: 'ДЗ на завтра' },
        { command: 'week', description: 'ДЗ на неделю' },
        { command: 'schedule', description: 'Расписание класса' },
        { command: 'profile', description: 'Мой профиль' },
        { command: 'web', description: 'Веб-версия' },
        { command: 'help', description: 'Помощь' },
      ]);
    } catch (error) {
      // Telegram может быть временно недоступен — сервис всё равно должен подняться
      console.warn('Не удалось обновить команды бота:', error.message);
    }

    server = await startServer();

    // Pending-аккаунты, брошенные при регистрации на сайте, убираем раз в час.
    // Автоудаление старых ДЗ живёт в отдельной cron-задаче Render (см. render.yaml).
    await cleanupPendingAccounts().catch((error) => {
      console.error('Ошибка очистки pending-аккаунтов:', error.message);
    });
    setInterval(() => {
      cleanupPendingAccounts().catch((error) => {
        console.error('Ошибка очистки pending-аккаунтов:', error.message);
      });
    }, 60 * 60 * 1000).unref();

    console.log(`Сервис запущен на порту ${config.port}`);
  } catch (error) {
    console.error('Запуск не удался:', error.message);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`Получен ${signal}, останавливаюсь`);
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await bot.stop(signal);
    await disconnectDB();
  } finally {
    process.exit(0);
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

start();
