import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function envInt(key: string, fallback: number): number {
    const v = process.env[key];
    return v ? parseInt(v, 10) : fallback;
}

function envStr(key: string, fallback: string): string {
    return process.env[key] ?? fallback;
}

export const config = {
    port: envInt('PORT', 3000),
    nodeEnv: envStr('NODE_ENV', 'development'),
    isProduction: process.env.NODE_ENV === 'production',

    database: {
        url: envStr('DATABASE_URL', 'postgresql://pipeline:pipeline123@localhost:5432/media_pipeline?schema=public'),
    },

    redis: {
        url: process.env.REDIS_URL || '',
        host: envStr('REDIS_HOST', 'localhost'),
        port: envInt('REDIS_PORT', 6379),
    },

    storage: {
        uploadDir: path.resolve(envStr('UPLOAD_DIR', './uploads')),
        maxFileSizeMB: envInt('MAX_FILE_SIZE_MB', 10),
        get maxFileSizeBytes() {
            return this.maxFileSizeMB * 1024 * 1024;
        },
    },

    worker: {
        concurrency: envInt('WORKER_CONCURRENCY', 3),
        jobTimeoutMs: envInt('JOB_TIMEOUT_MS', 120000),
        maxRetries: envInt('JOB_MAX_RETRIES', 3),
    },

    analysis: {
        blurThreshold: envInt('BLUR_THRESHOLD', 100),
        minBrightness: envInt('MIN_BRIGHTNESS', 40),
        maxBrightness: envInt('MAX_BRIGHTNESS', 240),
        minImageWidth: envInt('MIN_IMAGE_WIDTH', 640),
        minImageHeight: envInt('MIN_IMAGE_HEIGHT', 480),
        duplicateHashThreshold: envInt('DUPLICATE_HASH_THRESHOLD', 10),
    },

    rateLimit: {
        windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60000),
        maxRequests: envInt('RATE_LIMIT_MAX_REQUESTS', 30),
    },

    logging: {
        level: envStr('LOG_LEVEL', 'info'),
    },
} as const;
