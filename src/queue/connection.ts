import IORedis from 'ioredis';
import { config } from '../config';

/**
 * Shared Redis connection used by both the API server and workers.
 * BullMQ creates its own internal connections, but we expose this
 * for health checks and other direct Redis operations.
 */
export const redisConnection = new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: null, // required by BullMQ
});

export const redisOptions = {
    host: config.redis.host,
    port: config.redis.port,
};
