import { config } from './index.js';

// Redis-based session storage for Telegraf
let redisSessionStore = null;

export async function createRedisSession() {
  if (redisSessionStore) {
    return redisSessionStore;
  }

  const { RedisSessionStore } = await import('@telegraf/session');
  const { getRedisClient } = await import('./redis.js');
  
  const client = await getRedisClient();
  
  redisSessionStore = new RedisSessionStore({
    client,
    prefix: config.redis.keyPrefix,
    ttl: config.redis.ttl
  });

  return redisSessionStore;
}

export default createRedisSession;
