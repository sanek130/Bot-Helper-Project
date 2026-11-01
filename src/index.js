import 'dotenv/config';
import { config } from './config.js';
import { connectDB, disconnectDB } from './db/connect.js';
import { bot } from './bot/bot.js';
import { startServer } from './web/app.js';
import { cleanupPendingAccounts } from './services/cleanupService.js';

async function main() {
  await connectDB();

  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Начать и зарегистрироваться' },
    { command: 'menu', description: 'Главное меню' },
    { command: 'today', description: 'ДЗ на сегодня' },
    { command: 'tomorrow', description: 'ДЗ на завтра' },
    { command: 'after_tomorrow', description: 'ДЗ на послезавтра' },
    { command: 'week', description: 'ДЗ на неделю' },
    { command: 'schedule', description: 'Расписание класса' },
    { command: 'profile', description: 'Мой профиль' },
    { command: 'web_app', description: 'Веб-версия в Telegram' },
    { command: 'web_site', description: 'Сайт проекта' },
    { command: 'help', description: 'Помощь' },
    { command: 'support', description: 'Поддержка' },
  ]);

  const httpServer = await startServer(bot);
  console.log(`HW-Helper запущен (${config.env})`);

  setInterval(() => cleanupPendingAccounts().catch(console.error), 60 * 60 * 1000).unref();

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`Получен сигнал ${signal}. Завершаю работу...`);
    httpServer.close();
    try {
      await bot.stop(signal);
    } catch {
      // В режиме вебхука бот не запускался через launch(), и stop() бросает ошибку — это нормально.
    }
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Критическая ошибка:', err);
  process.exit(1);
});
