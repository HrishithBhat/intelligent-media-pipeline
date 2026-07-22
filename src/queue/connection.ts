import IORedis from 'ioredis';
import { config } from '../config';

/**
 * Shared Redis connection used by both the API server and workers.
 * Supports both REDIS_URL (cloud) and REDIS_HOST+REDIS_PORT (local).
 */
export const redisConnection = config.redis.url
    ? new IORedis(config.redis.url, { maxRetriesPerRequest: null })
    : new IORedis({
        host: config.redis.host,
        port: config.redis.port,
        maxRetriesPerRequest: null,
    });

export const redisOptions = config.redis.url
    ? { connection: new IORedis(config.redis.url, { maxRetriesPerRequest: null }) }
    : { host: config.redis.host, port: config.redis.port };
