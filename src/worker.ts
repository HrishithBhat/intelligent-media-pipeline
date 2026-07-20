import { config } from './config';
import { logger } from './utils/logger';
import { createAnalysisWorker } from './workers/analysisWorker';

const worker = createAnalysisWorker();

logger.info(
    { concurrency: config.worker.concurrency },
    '🔧 Worker process started'
);

// Graceful shutdown
const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker received shutdown signal');
    await worker.close();
    logger.info('Worker shut down gracefully');
    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
