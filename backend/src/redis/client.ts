import Redis from 'ioredis';
import { config } from '../config.js';

let redis: Redis | null = null;

if (config.redis.url) {
  redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });
}

export function getRedis(): Redis | null {
  return redis;
}

export async function redisCommand<T>(fn: (r: Redis) => Promise<T>): Promise<T> {
  if (!redis) throw new Error('REDIS_URL not set');
  return fn(redis);
}
