import 'dotenv/config';
import { config } from './config.js';
import { connectDB, disconnectDB } from './db/connect.js';
import { bot } from './bot/bot.js';
import { startServer } from './web/app.js';
import { cleanupPendingAccounts } from './services/cleanupService.js';
import { backfillOwnerTgId } from './services/userService.js';
import { retry } from './utils/retry.js';

// Описания совпадают со списком в BotFather.
const COMMANDS = [
  { command: 'start', description: 'Вход, регистрация' },
  { command: 'menu', description: 'Главное меню' },
  { command: 'today', description: 'ДЗ на сегодня' },
  { command: 'tomorrow', description: 'ДЗ на завтра' },
  { command: 'after_tomorrow', description: 'ДЗ на послезавтра' },
  { command: 'week', description: 'ДЗ на всю неделю' },
  { command: 'schedule', description: 'Расписание класса' },
  { command: 'profile', description: 'Профиль: данные, спец-ID, настройки' },
  { command: 'id', description: 'Твой Telegram ID' },
  { command: 'style', description: 'Изменить стиль бота' },
  { command: 'web_app', description: 'Веб-приложение прямо внутри Telegram' },
  { command: 'web_site', description: 'Открыть сайт проекта в браузере' },
  { command: 'web', description: 'Все ссылки на веб-версию' },
  { command: 'help', description: 'Помощь' },
  { command: 'support', description: 'Написать в поддержку' },
  { command: 'contacts', description: 'Контакты создателя и чат бота' },
  { command: 'donate', description: 'Поддержать проект' },
];

// Telegram показывает самый узкий список: «личные чаты» или «русский язык» перекрывают общий.
// Поэтому сначала удаляем старые узкие списки (например, «инфо ....»), потом ставим общий.
const NARROW_SCOPES = [
  { scope: { type: 'all_private_chats' } },
  { scope: { type: 'all_group_chats' } },
  { scope: { type: 'all_chat_administrators' } },
];
const LANGUAGES = ['', 'ru', 'en', 'uk', 'be', 'kk'];

async function syncCommands() {
  for (const language of LANGUAGES) {
    const lang = language ? { language_code: language } : {};
    for (const extra of NARROW_SCOPES) await bot.telegram.deleteMyCommands({ ...extra, ...lang });
    if (language) await bot.telegram.deleteMyCommands(lang);
  }
  await bot.telegram.setMyCommands(COMMANDS);
}

async function main() {
  await connectDB();
  // Старые аккаунты получают постоянную привязку к Telegram ID (идемпотентно, обычно 0 изменений).
  const backfilled = await backfillOwnerTgId();
  if (backfilled > 0) console.log(`ownerTgId заполнен у ${backfilled} аккаунтов`);


  const httpServer = await startServer(bot);
  console.log(`HW-Helper запущен (${config.env})`);

  // Список команд — не критичен для работы: при сбое сети повторяем в фоне, не роняя сервер.
  retry(syncCommands, { label: 'Обновление списка команд' })
    .then(() => console.log('Список команд бота обновлён'))
    .catch((err) => console.error(`Список команд не обновлён: ${err.code || err.message}`));

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
