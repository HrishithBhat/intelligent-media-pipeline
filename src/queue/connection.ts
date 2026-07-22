import IORedis, { RedisOptions } from 'ioredis';
import { config } from '../config';

/**
 * Shared Redis connection used by both the API server and workers.
 * Includes lazyConnect to prevent Railway boots from crashing if Redis isn't fully ready.
 */
function createRedisConnection(): IORedis {
    const conn = config.redis.url
        ? new IORedis(config.redis.url, { maxRetriesPerRequest: null, lazyConnect: true, family: 0 })
        : new IORedis({
            host: config.redis.host,
            port: config.redis.port,
            maxRetriesPerRequest: null,
            lazyConnect: true,
            family: 0,
        });

    conn.on('error', (err) => {
        console.error('Redis connection error (non-fatal):', err.message);
    });

    conn.connect().catch(() => { });

    return conn;
}

export const redisConnection = createRedisConnection();

export const redisOptions = config.redis.url
    ? { connection: new IORedis(config.redis.url, { maxRetriesPerRequest: null, family: 0 }) }
    : { host: config.redis.host, port: config.redis.port, family: 0 };
