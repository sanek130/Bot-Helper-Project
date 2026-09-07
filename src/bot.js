import { Telegraf, Scenes } from 'telegraf';
import express from 'express';
import mongoose from 'mongoose';
import { config } from './config/index.js';
import { connectDB, closeDBConnection } from './config/database.js';
import { getRedisClient, closeRedisConnection } from './config/redis.js';
import { createRedisSession } from './config/session.js';
import { botLogger } from './config/logger.js';
import { setupGlobalErrorHandler, setupProcessErrorHandlers, rateLimit, errorHandler, isRegistered } from './middlewares/index.js';
import { buildMainMenu } from './keyboards/mainMenu.js';
import { initScenes } from './scenes/index.js';
import { initJobs } from './jobs/index.js';
import { 
  handleStart, 
  handleMainDayAction, 
  handleProfile, 
  handleSettings, 
  handleAdminPanel, 
  handleBackToMain,
  handleAllHomework,
  handleHomeworkByDay
} from './handlers/index.js';

// Импорт моделей для регистрации в mongoose
import './models/index.js';

/**
 * Основная точка входа бота
 */
async function main() {
  // Настройка обработчиков ошибок процесса
  setupProcessErrorHandlers();

  try {
    // Подключение к БД
    await connectDB();
    botLogger.info('Database connected');

    // Подключение к Redis
    await getRedisClient();
    botLogger.info('Redis connected');

    // Создание Telegraf бота
    const bot = new Telegraf(config.bot.token);

    // Глобальная обработка ошибок
    setupGlobalErrorHandler(bot);

    // Middleware обработки ошибок в хендлерах
    bot.use(errorHandler());

    // Rate limiting middleware
    bot.use(rateLimit());

    // Логирование действий (в development режиме)
    if (!config.app.isProduction) {
      bot.use((ctx, next) => {
        botLogger.debug(`Update from user ${ctx.from?.id}: ${ctx.updateType}`);
        return next();
      });
    }

    // Инициализация сцен (Stage)
    const stage = initScenes(bot);
    bot.use(stage.middleware());

    // Инициализация фоновых задач (cron jobs)
    const jobs = initJobs(bot);
    botLogger.info(`${jobs.length} background jobs initialized`);

    // === ОБРАБОТЧИКИ КОМАНД И КНОПОК ===

    // Обработчик /start
    bot.start(handleStart);

    // Обработчик главной кнопки дня
    bot.action('main_day_action', handleMainDayAction);

    // Обработчик профиля
    bot.action('profile_main', handleProfile);

    // Обработчик настроек
    bot.action('settings_main', handleSettings);

    // Обработчик админ-панели
    bot.action('admin_panel', handleAdminPanel);

    // Обработчик кнопки "Назад"
    bot.action('back_to_main', handleBackToMain);

    // Обработчик всех ДЗ
    bot.action('homework_all', handleAllHomework);

    // Обработчики выбора дня для просмотра ДЗ
    bot.action(/schedule_day_(\d+)/, async (ctx) => {
      const dayIndex = parseInt(ctx.match[1]);
      await handleHomeworkByDay(ctx, dayIndex);
    });

    // Обработчик добавления ДЗ (для админов)
    bot.action('admin_edit_homework', async (ctx) => {
      const User = mongoose.model('User');
      const user = await User.findOne({ telegramId: ctx.from.id });
      
      if (!user || (user.role !== 'admin' && user.role !== 'class_admin')) {
        return ctx.answerCbQuery('❌ Недостаточно прав.', { show_alert: true });
      }
      
      return ctx.scene.enter('add_homework');
    });

    // Обработчик рассылки (для админов)
    bot.action('admin_broadcast', async (ctx) => {
      const User = mongoose.model('User');
      const user = await User.findOne({ telegramId: ctx.from.id });
      
      if (!user || (user.role !== 'admin' && user.role !== 'class_admin')) {
        return ctx.answerCbQuery('❌ Недостаточно прав.', { show_alert: true });
      }
      
      return ctx.scene.enter('admin_broadcast');
    });

    // Обработчик расписания на неделю
    bot.action('schedule_week', async (ctx) => {
      await ctx.reply('🗓 Расписание на неделю (в разработке)');
      await ctx.answerCbQuery();
    });

    // Обработчик выбора дня расписания
    bot.action('schedule_select_day', async (ctx) => {
      const User = mongoose.model('User');
      const user = await User.findOne({ telegramId: ctx.from.id });
      
      if (!user) {
        return ctx.answerCbQuery('❌ Пользователь не найден.', { show_alert: true });
      }

      const keyboard = require('./keyboards').getDaySelectMenu(ctx.i18n.t.bind(ctx.i18n));
      await ctx.editMessageText('📅 Выберите день:', { reply_markup: keyboard.reply_markup });
    });

    // Health check endpoints для Express
    const app = express();
    app.use(express.json());

    // Webhook callback для Telegram (если используется webhook)
    if (config.app.isProduction && config.bot.webhookPath) {
      app.use(config.bot.webhookPath, async (req, res) => {
        // Проверка secret_token если указан
        if (config.bot.webhookSecret) {
          const secretToken = req.headers['x-telegram-bot-api-secret-token'];
          if (secretToken !== config.bot.webhookSecret) {
            return res.status(403).send('Forbidden');
          }
        }
        
        // Обработка апдейта от Telegram
        try {
          await bot.handleUpdate(req.body);
          res.send('OK');
        } catch (error) {
          botLogger.error('Webhook handler error:', error);
          res.status(500).send('Error');
        }
      });
    }

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Root endpoint
    app.get('/', (req, res) => {
      res.send('🤖 School Bot is running');
    });

    // Запуск сервера
    const server = app.listen(config.bot.port, () => {
      botLogger.info(`Server listening on port ${config.bot.port}`);
    });

    // Запуск бота в режиме long polling (для разработки)
    // В продакшене используется webhook через Express
    if (!config.app.isProduction) {
      await bot.launch({
        dropPendingUpdates: true
      });
      botLogger.info('Bot launched in long polling mode');
    } else {
      // В продакшене устанавливаем webhook при старте
      const webhookUrl = `${process.env.WEBHOOK_BASE_URL}${config.bot.webhookPath}`;
      
      try {
        await bot.telegram.setWebhook(webhookUrl, {
          secret_token: config.bot.webhookSecret || undefined
        });
        botLogger.info(`Webhook set to: ${webhookUrl}`);
      } catch (error) {
        botLogger.error('Failed to set webhook:', error);
        // Не прерываем запуск, webhook можно установить вручную
      }
    }

    // Graceful shutdown
    const shutdown = async (signal) => {
      botLogger.info(`${signal} received. Starting graceful shutdown...`);

      // Останавливаем бота
      bot.stop(signal);

      // Закрываем HTTP сервер
      server.close(async () => {
        botLogger.info('HTTP server closed');

        // Останавливаем cron jobs
        jobs.forEach(job => job.stop());
        botLogger.info('Background jobs stopped');

        // Закрываем соединения
        await closeRedisConnection();
        await closeDBConnection();

        botLogger.info('All connections closed. Exiting.');
        process.exit(0);
      });

      // Принудительное завершение через 10 секунд
      setTimeout(() => {
        botLogger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Обработка ошибок запуска
    bot.catch((err, ctx) => {
      botLogger.error(`Error while handling update for ${ctx.from?.id}:`, err);
    });

  } catch (error) {
    botLogger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Запуск
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export default main;
