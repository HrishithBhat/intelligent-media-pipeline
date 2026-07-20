import { Worker, Job } from 'bullmq';
import { prisma } from '../db/prisma';
import { createChildLogger } from '../utils/logger';
import { redisOptions, IMAGE_ANALYSIS_QUEUE } from '../queue';
import { config } from '../config';
import { AnalysisCheckResult } from '../types';
import {
    analyzeBlur,
    analyzeBrightness,
    analyzeDuplicate,
    analyzeOCR,
    validateNumberPlate,
    analyzeDimensions,
    analyzeScreenshot,
    analyzePhotoOfPhoto,
    analyzeExif,
    analyzeTampering,
} from '../analysis';

const log = createChildLogger({ service: 'analysisWorker' });

/**
 * Run all 10 analysis checks on an image and persist results.
 * 
 * The pipeline runs sequentially to keep resource usage predictable,
 * but you could parallelize non-dependent checks (blur, brightness, dimensions)
 * for better throughput. OCR must run before number plate validation since
 * the latter depends on extracted text.
 */
async function processImage(job: Job<{ imageId: string }>): Promise<void> {
    const { imageId } = job.data;
    const jobLog = log.child({ imageId, jobId: job.id });

    jobLog.info('Starting image analysis');

    // Count existing attempts for retry tracking
    const attemptCount = await prisma.processingAttempt.count({
        where: { imageId },
    });

    // Record this attempt
    const attempt = await prisma.processingAttempt.create({
        data: {
            imageId,
            attemptNumber: attemptCount + 1,
            status: 'started',
        },
    });

    // Update image status to processing
    const image = await prisma.image.update({
        where: { id: imageId },
        data: {
            status: 'processing',
            processingStartedAt: new Date(),
        },
    });

    const imagePath = image.storagePath;
    const results: AnalysisCheckResult[] = [];

    try {
        // 1. Blur detection
        jobLog.info('Running blur detection');
        results.push(await analyzeBlur(imagePath));

        // 2. Brightness analysis
        jobLog.info('Running brightness analysis');
        results.push(await analyzeBrightness(imagePath));

        // 3. Dimension validation
        jobLog.info('Running dimension validation');
        results.push(await analyzeDimensions(imagePath));

        // 4. OCR extraction (needed by number plate validation)
        jobLog.info('Running OCR extraction');
        const ocrResult = await analyzeOCR(imagePath);
        results.push(ocrResult);

        // 5. Number plate validation (depends on OCR text)
        jobLog.info('Running number plate validation');
        let ocrText = '';
        try {
            const ocrDetails = JSON.parse(ocrResult.details);
            ocrText = ocrDetails.extractedText || '';
        } catch {
            ocrText = '';
        }
        results.push(await validateNumberPlate(imagePath, imageId, ocrText));

        // 6. Duplicate detection
        jobLog.info('Running duplicate detection');
        results.push(await analyzeDuplicate(imagePath, imageId));

        // 7. Screenshot detection
        jobLog.info('Running screenshot detection');
        results.push(await analyzeScreenshot(imagePath));

        // 8. Photo-of-photo detection
        jobLog.info('Running photo-of-photo detection');
        results.push(await analyzePhotoOfPhoto(imagePath));

        // 9. EXIF analysis
        jobLog.info('Running EXIF analysis');
        results.push(await analyzeExif(imagePath));

        // 10. Tampering detection
        jobLog.info('Running tampering detection');
        results.push(await analyzeTampering(imagePath));

        // Calculate composite score (weighted average of all check scores)
        const totalWeight = results.length;
        const compositeScore = results.reduce((sum, r) => sum + r.score, 0) / totalWeight;
        const compositeConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / totalWeight;

        // Persist all results in a transaction
        await prisma.$transaction([
            // Save each analysis result
            ...results.map((r) =>
                prisma.analysisResult.create({
                    data: {
                        imageId,
                        checkName: r.check,
                        passed: r.passed,
                        score: r.score,
                        confidence: r.confidence,
                        details: r.details,
                    },
                })
            ),
            // Update image status
            prisma.image.update({
                where: { id: imageId },
                data: {
                    status: 'completed',
                    compositeScore: parseFloat(compositeScore.toFixed(4)),
                    compositeConfidence: parseFloat(compositeConfidence.toFixed(4)),
                    processingCompletedAt: new Date(),
                },
            }),
            // Update attempt status
            prisma.processingAttempt.update({
                where: { id: attempt.id },
                data: {
                    status: 'completed',
                    completedAt: new Date(),
                },
            }),
        ]);

        jobLog.info(
            { compositeScore: compositeScore.toFixed(4), checksCompleted: results.length },
            'Image analysis completed successfully'
        );
    } catch (error) {
        const errorMessage = (error as Error).message;
        jobLog.error({ err: error }, 'Image analysis failed');

        // Update attempt as failed
        await prisma.processingAttempt.update({
            where: { id: attempt.id },
            data: {
                status: 'failed',
                errorMessage,
                completedAt: new Date(),
            },
        });

        // If this is the last retry, mark the image as failed
        if ((job.attemptsMade + 1) >= config.worker.maxRetries) {
            await prisma.image.update({
                where: { id: imageId },
                data: {
                    status: 'failed',
                    failureReason: `Failed after ${job.attemptsMade + 1} attempts. Last error: ${errorMessage}`,
                },
            });
        }

        // Re-throw so BullMQ handles retry logic
        throw error;
    }
}

/**
 * Create and start the BullMQ worker.
 * Concurrency is configurable via WORKER_CONCURRENCY env var.
 */
export function createAnalysisWorker(): Worker {
    const worker = new Worker(
        IMAGE_ANALYSIS_QUEUE,
        processImage,
        {
            connection: redisOptions,
            concurrency: config.worker.concurrency,
            lockDuration: config.worker.jobTimeoutMs,
        }
    );

    worker.on('completed', (job) => {
        log.info({ jobId: job?.id, imageId: job?.data?.imageId }, 'Job completed');
    });

    worker.on('failed', (job, err) => {
        log.error(
            { jobId: job?.id, imageId: job?.data?.imageId, err: err.message, attempt: job?.attemptsMade },
            'Job failed'
        );
    });

    worker.on('error', (err) => {
        log.error({ err }, 'Worker error');
    });

    log.info(
        { concurrency: config.worker.concurrency, queue: IMAGE_ANALYSIS_QUEUE },
        'Analysis worker started'
    );

    return worker;
}
