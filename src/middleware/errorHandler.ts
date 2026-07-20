import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Global error handler middleware.
 * Catches all unhandled errors and returns structured JSON responses.
 */
export function errorHandler(
    err: Error & { statusCode?: number; code?: string },
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    // Multer-specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
            error: 'File too large',
            message: 'The uploaded file exceeds the maximum allowed size.',
        });
        return;
    }

    if (err.message?.startsWith('Invalid file type')) {
        res.status(400).json({
            error: 'Invalid file type',
            message: err.message,
        });
        return;
    }

    const statusCode = err.statusCode ?? 500;
    const message = statusCode === 500 ? 'Internal server error' : err.message;

    logger.error(
        { err, statusCode },
        `Request error: ${err.message}`
    );

    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
}

/**
 * 404 handler for undefined routes.
 */
export function notFoundHandler(_req: Request, res: Response): void {
    res.status(404).json({ error: 'Not found' });
}
