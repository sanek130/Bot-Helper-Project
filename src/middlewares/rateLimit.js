import { middlewareLogger } from '../config/logger.js';
import { config } from '../config/index.js';

/**
 * Rate limiting middleware на основе Redis
 * Ограничивает количество запросов от пользователя в заданный промежуток времени
 */

// Хранилище для бакетов (в памяти как fallback)
const localBuckets = new Map();

/**
 * Получить ключ Redis для rate limit
 * @param {number} userId - ID пользователя
 * @returns {string} ключ
 */
function getRateLimitKey(userId) {
  return `${config.redis.keyPrefix}ratelimit:${userId}`;
}

/**
 * Middleware для rate limiting
 * @param {Object} options - опции
 * @param {number} options.windowMs - окно времени в мс
 * @param {number} options.maxRequests - макс. запросов в окно
 * @returns {Function} Telegraf middleware
 */
export function rateLimit(options = {}) {
  const windowMs = options.windowMs || config.rateLimit.windowMs;
  const maxRequests = options.maxRequests || config.rateLimit.maxRequests;

  return async (ctx, next) => {
    const userId = ctx.from?.id;
    
    if (!userId) {
      return next(); // Пропускаем системные сообщения
    }

    try {
      const now = Date.now();
      const key = getRateLimitKey(userId);
      
      // Пытаемся использовать Redis
      let redisClient = null;
      try {
        const { getRedisClient } = await import('../config/redis.js');
        redisClient = await getRedisClient();
      } catch (e) {
        middlewareLogger.debug('Redis not available, using in-memory rate limit');
      }

      if (redisClient && redisClient.isOpen) {
        // Redis-based rate limiting
        const bucketData = await redisClient.get(key);
        
        if (!bucketData) {
          // Новый бакет
          await redisClient.setEx(key, Math.ceil(windowMs / 1000), '1');
          return next();
        }

        const requestCount = parseInt(bucketData, 10);
        
        if (requestCount >= maxRequests) {
          middlewareLogger.warn(`Rate limit exceeded for user ${userId}`);
          return ctx.reply(
            '⏱️ Слишком много запросов. Пожалуйста, подождите немного.',
            { parse_mode: 'HTML' }
          );
        }

        // Инкремент счётчика
        await redisClient.incr(key);
        return next();
      } else {
        // Fallback to in-memory rate limiting
        let bucket = localBuckets.get(userId);

        if (!bucket || now > bucket.resetTime) {
          // Создаём новый бакет
          bucket = {
            count: 0,
            resetTime: now + windowMs
          };
          localBuckets.set(userId, bucket);
        }

        bucket.count++;

        if (bucket.count > maxRequests) {
          middlewareLogger.warn(`Rate limit exceeded for user ${userId} (in-memory)`);
          const waitSeconds = Math.ceil((bucket.resetTime - now) / 1000);
          return ctx.reply(
            `⏱️ Слишком много запросов. Подождите ${waitSeconds} сек.`,
            { parse_mode: 'HTML' }
          );
        }

        return next();
      }
    } catch (error) {
      middlewareLogger.error('rateLimit error:', error);
      // В случае ошибки пропускаем запрос, чтобы не блокировать пользователей
      return next();
    }
  };
}

/**
 * Очистить локальные бакеты (для тестов)
 */
export function clearLocalBuckets() {
  localBuckets.clear();
}

export default {
  rateLimit,
  clearLocalBuckets
};
