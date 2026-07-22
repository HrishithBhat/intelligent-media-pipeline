import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { execSync } from 'child_process';

try {
    logger.info('Running database migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    logger.info('Database migrations applied successfully.');
} catch (err) {
    logger.error({ err }, 'Failed to run database migrations');
}

const server = app.listen(config.port, () => {
    logger.info(
        { port: config.port, env: config.nodeEnv },
        `🚀 Media Processing API server running on http://localhost:${config.port}`
    );
    logger.info(`📊 Dashboard available at http://localhost:${config.port}/dashboard`);
    logger.info(`❤️  Health check at http://localhost:${config.port}/health`);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });

    // Force close after 10s
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
