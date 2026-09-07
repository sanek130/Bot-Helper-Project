import { config } from './index.js';

// Redis connection manager
let redisClient = null;

export async function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  const { createClient } = await import('redis');
  
  redisClient = createClient({
    url: config.redis.url
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Connected to Redis');
  });

  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  return redisClient;
}

export async function closeRedisConnection() {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis connection closed');
  }
}

export default getRedisClient;
