import { Queue } from 'bullmq';
import { redisOptions } from './connection';
import { config } from '../config';

export const IMAGE_ANALYSIS_QUEUE = 'image-analysis';

/**
 * BullMQ queue for image analysis jobs.
 * The API server enqueues jobs here; workers consume them.
 */
export const imageAnalysisQueue = new Queue(IMAGE_ANALYSIS_QUEUE, {
    connection: redisOptions,
    defaultJobOptions: {
        attempts: config.worker.maxRetries,
        backoff: {
            type: 'exponential',
            delay: 2000, // 2s → 4s → 8s
        },
        removeOnComplete: {
            age: 24 * 3600,  // keep completed jobs for 24h
            count: 1000,
        },
        removeOnFail: {
            age: 7 * 24 * 3600, // keep failed jobs for 7 days
        },
    },
});

/**
 * Add an image analysis job to the queue.
 */
export async function enqueueImageAnalysis(imageId: string): Promise<void> {
    await imageAnalysisQueue.add(
        'analyze',
        { imageId },
        { jobId: `analyze-${imageId}` }
    );
}
