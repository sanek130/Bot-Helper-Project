import { middlewareLogger } from '../config/logger.js';
import { config } from '../config/index.js';

/**
 * Middleware для проверки роли пользователя
 * @param {string[]} allowedRoles - список разрешённых ролей
 * @returns {Function} Telegraf middleware
 */
export function roleGuard(allowedRoles) {
  return async (ctx, next) => {
    try {
      const userId = ctx.from?.id || ctx.callbackQuery?.from?.id;
      
      if (!userId) {
        middlewareLogger.warn('No user ID found in context');
        return ctx.answerCbQuery('❌ Ошибка авторизации', { show_alert: true });
      }

      const User = (await import('../models/index.js')).User;
      const user = await User.findOne({ telegramId: userId });

      if (!user) {
        middlewareLogger.warn(`User ${userId} not found in database`);
        return ctx.answerCbQuery('❌ Вы ещё не зарегистрированы. Используйте /start', { show_alert: true });
      }

      if (!allowedRoles.includes(user.role)) {
        middlewareLogger.warn(`User ${userId} has role "${user.role}", required: ${allowedRoles.join(', ')}`);
        return ctx.answerCbQuery('🚫 Доступ запрещен', { show_alert: true });
      }

      return next();
    } catch (error) {
      middlewareLogger.error('roleGuard error:', error);
      return ctx.answerCbQuery('❌ Произошла ошибка', { show_alert: true });
    }
  };
}

/**
 * Middleware для проверки регистрации пользователя
 * @returns {Function} Telegraf middleware
 */
export function isRegistered() {
  return async (ctx, next) => {
    try {
      const userId = ctx.from?.id || ctx.callbackQuery?.from?.id;
      
      if (!userId) {
        return next(); // Пропускаем, если нет ID (системные сообщения)
      }

      const User = (await import('../models/index.js')).User;
      const user = await User.findOne({ telegramId: userId });

      if (!user) {
        if (ctx.callbackQuery) {
          return ctx.answerCbQuery('❌ Вы ещё не зарегистрированы. Используйте /start', { show_alert: true });
        } else {
          return ctx.reply('❌ Вы ещё не зарегистрированы. Нажмите /start для начала работы.');
        }
      }

      // Сохраняем пользователя в контекст для дальнейшего использования
      ctx.state.user = user;
      return next();
    } catch (error) {
      middlewareLogger.error('isRegistered error:', error);
      return ctx.reply('❌ Произошла ошибка при проверке регистрации');
    }
  };
}

/**
 * Middleware для проверки, является ли пользователь админом бота
 * @returns {Function} Telegraf middleware
 */
export function isBotAdmin() {
  return async (ctx, next) => {
    const userId = ctx.from?.id || ctx.callbackQuery?.from?.id;
    
    if (!userId) {
      return ctx.answerCbQuery('❌ Ошибка авторизации', { show_alert: true });
    }

    if (!config.adminChatIds.includes(userId)) {
      middlewareLogger.warn(`Non-admin user ${userId} tried to access admin panel`);
      return ctx.answerCbQuery('🚫 Доступ запрещен', { show_alert: true });
    }

    return next();
  };
}

/**
 * Middleware для логирования действий пользователей
 * @returns {Function} Telegraf middleware
 */
export function logActions() {
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const actionType = ctx.updateType;
    const actionData = ctx.callbackQuery?.data || ctx.message?.text || 'unknown';

    middlewareLogger.debug(`User ${userId} in chat ${chatId}: ${actionType} - ${actionData}`);
    
    return next();
  };
}

export default {
  roleGuard,
  isRegistered,
  isBotAdmin,
  logActions
};
