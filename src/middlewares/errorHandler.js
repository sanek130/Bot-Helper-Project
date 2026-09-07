import { botLogger } from '../config/logger.js';

/**
 * Глобальный обработчик ошибок для Telegraf бота
 * Перехватывает все необработанные исключения и предотвращает падение процесса
 */

/**
 * Middleware для обработки ошибок в хендлерах
 * @returns {Function} Telegraf middleware
 */
export function errorHandler() {
  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      botLogger.error('Handler error:', {
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
        updateType: ctx.updateType,
        callbackData: ctx.callbackQuery?.data,
        message: ctx.message?.text,
        error: error.message,
        stack: error.stack
      });

      // Отправляем пользователю сообщение об ошибке только если это уместно
      if (ctx.callbackQuery) {
        try {
          await ctx.answerCbQuery('❌ Произошла ошибка. Попробуйте позже.', { show_alert: true });
        } catch (e) {
          // Игнорируем ошибки при отправке answerCbQuery (например, если запрос уже обработан)
        }
      } else if (ctx.message && !ctx.message.text?.startsWith('/')) {
        try {
          await ctx.reply('❌ Произошла ошибка. Попробуйте позже или используйте /start');
        } catch (e) {
          // Игнорируем ошибки отправки сообщения
        }
      }
    }
  };
}

/**
 * Установить глобальный обработчик ошибок на боте
 * @param {Telegraf} bot - экземпляр Telegraf
 */
export function setupGlobalErrorHandler(bot) {
  // Telegraf 4.x имеет встроенный bot.catch()
  bot.catch((error, ctx) => {
    botLogger.error('Global bot error:', {
      userId: ctx?.from?.id,
      chatId: ctx?.chat?.id,
      updateType: ctx?.updateType,
      callbackData: ctx?.callbackQuery?.data,
      message: ctx?.message?.text,
      error: error.message,
      stack: error.stack
    });

    // Пытаемся ответить пользователю, если возможно
    if (ctx?.callbackQuery) {
      ctx.answerCbQuery('❌ Произошла ошибка. Попробуйте позже.', { show_alert: true })
        .catch(() => {});
    } else if (ctx?.message && !ctx.message.text?.startsWith('/')) {
      ctx.reply('❌ Произошла ошибка. Попробуйте позже или используйте /start')
        .catch(() => {});
    }
  });
}

/**
 * Обработчик для process-level ошибок (необработанные исключения)
 */
export function setupProcessErrorHandlers() {
  // Необработанные Promise rejection
  process.on('unhandledRejection', (reason, promise) => {
    botLogger.error('Unhandled Rejection at:', {
      promise: String(promise),
      reason: reason?.message || reason
    });
    // Не завершаем процесс, позволяем боту работать
  });

  // Необработанные исключения
  process.on('uncaughtException', (error) => {
    botLogger.error('Uncaught Exception:', {
      message: error.message,
      stack: error.stack
    });
    // Graceful shutdown будет обработан в bot.js
  });

  // Предупреждения
  process.on('warning', (warning) => {
    botLogger.warn('Process warning:', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack
    });
  });
}

export default {
  errorHandler,
  setupGlobalErrorHandler,
  setupProcessErrorHandlers
};
