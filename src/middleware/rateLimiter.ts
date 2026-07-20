import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * Rate limiter for the upload endpoint.
 * Prevents abuse while allowing reasonable throughput.
 */
export const uploadRateLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(config.rateLimit.windowMs / 1000)} seconds.`,
    },
});
