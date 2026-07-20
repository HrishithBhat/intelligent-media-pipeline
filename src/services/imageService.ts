import { prisma } from '../db/prisma';
import { storage } from '../storage';
import { enqueueImageAnalysis } from '../queue';
import { generateFilename } from '../middleware/upload';
import { createChildLogger } from '../utils/logger';
import { ImageUploadResponse, ImageStatusResponse, ImageResultsResponse, ImageFailureResponse, AnalyticsResponse } from '../types';

const log = createChildLogger({ service: 'imageService' });

/**
 * Handle a new image upload:
 * 1. Save to storage
 * 2. Persist metadata to DB (status = pending)
 * 3. Enqueue analysis job
 * 4. Return processing ID immediately
 */
export async function uploadImage(
    file: Express.Multer.File
): Promise<ImageUploadResponse> {
    const filename = generateFilename(file.originalname);
    const storagePath = await storage.save(filename, file.buffer);

    const image = await prisma.image.create({
        data: {
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            storagePath,
            status: 'pending',
        },
    });

    log.info({ imageId: image.id, filename: image.originalFilename }, 'Image uploaded and saved');

    // Enqueue for async processing — this returns immediately
    await enqueueImageAnalysis(image.id);

    log.info({ imageId: image.id }, 'Analysis job enqueued');

    return {
        id: image.id,
        status: image.status,
        message: 'Image uploaded successfully. Processing will begin shortly.',
    };
}

/**
 * Get the current processing status of an image.
 */
export async function getImageStatus(id: string): Promise<ImageStatusResponse | null> {
    const image = await prisma.image.findUnique({
        where: { id },
        select: {
            id: true,
            originalFilename: true,
            status: true,
            uploadedAt: true,
            processingStartedAt: true,
            processingCompletedAt: true,
        },
    });

    if (!image) return null;

    return {
        id: image.id,
        originalFilename: image.originalFilename,
        status: image.status,
        uploadedAt: image.uploadedAt.toISOString(),
        processingStartedAt: image.processingStartedAt?.toISOString() ?? null,
        processingCompletedAt: image.processingCompletedAt?.toISOString() ?? null,
    };
}

/**
 * Get the full analysis results for a completed image.
 */
export async function getImageResults(id: string): Promise<ImageResultsResponse | null> {
    const image = await prisma.image.findUnique({
        where: { id },
        include: {
            analysisResults: {
                orderBy: { createdAt: 'asc' },
            },
        },
    });

    if (!image) return null;

    return {
        id: image.id,
        originalFilename: image.originalFilename,
        status: image.status,
        compositeScore: image.compositeScore,
        compositeConfidence: image.compositeConfidence,
        results: image.analysisResults.map((r) => ({
            check: r.checkName,
            passed: r.passed,
            score: r.score,
            confidence: r.confidence,
            details: typeof r.details === 'string' ? r.details : JSON.stringify(r.details),
        })),
    };
}

/**
 * Get failure information for a failed image.
 */
export async function getImageFailure(id: string): Promise<ImageFailureResponse | null> {
    const image = await prisma.image.findUnique({
        where: { id },
        include: {
            processingAttempts: {
                orderBy: { attemptNumber: 'asc' },
            },
        },
    });

    if (!image) return null;

    return {
        id: image.id,
        status: image.status,
        failureReason: image.failureReason,
        attempts: image.processingAttempts.map((a) => ({
            attemptNumber: a.attemptNumber,
            status: a.status,
            errorMessage: a.errorMessage,
            startedAt: a.startedAt.toISOString(),
            completedAt: a.completedAt?.toISOString() ?? null,
        })),
    };
}

/**
 * Retry a failed image analysis job.
 */
export async function retryImageAnalysis(id: string): Promise<{ success: boolean; message: string }> {
    const image = await prisma.image.findUnique({ where: { id } });

    if (!image) {
        return { success: false, message: 'Image not found' };
    }

    if (image.status !== 'failed') {
        return { success: false, message: `Cannot retry: image status is "${image.status}", not "failed"` };
    }

    // Reset status to pending and clear old results
    await prisma.$transaction([
        prisma.analysisResult.deleteMany({ where: { imageId: id } }),
        prisma.image.update({
            where: { id },
            data: {
                status: 'pending',
                failureReason: null,
                compositeScore: null,
                compositeConfidence: null,
                processingStartedAt: null,
                processingCompletedAt: null,
            },
        }),
    ]);

    await enqueueImageAnalysis(id);

    log.info({ imageId: id }, 'Manual retry enqueued');

    return { success: true, message: 'Retry enqueued. Image will be re-processed.' };
}

/**
 * Aggregate analytics across all processed images.
 */
export async function getAnalytics(): Promise<AnalyticsResponse> {
    const [totalImages, statusCounts, completedImages, failedChecks] = await Promise.all([
        // Total images
        prisma.image.count(),

        // Status breakdown
        prisma.image.groupBy({
            by: ['status'],
            _count: { _all: true },
        }),

        // Completed images with processing times
        prisma.image.findMany({
            where: {
                status: 'completed',
                processingStartedAt: { not: null },
                processingCompletedAt: { not: null },
            },
            select: {
                compositeScore: true,
                processingStartedAt: true,
                processingCompletedAt: true,
            },
        }),

        // Issue frequency (failed checks)
        prisma.analysisResult.groupBy({
            by: ['checkName'],
            where: { passed: false },
            _count: { _all: true },
        }),
    ]);

    const statusBreakdown: Record<string, number> = {};
    for (const s of statusCounts) {
        statusBreakdown[s.status] = s._count._all;
    }

    // Average processing time
    let avgProcessingTimeMs: number | null = null;
    const processingTimes = completedImages
        .filter((img) => img.processingStartedAt && img.processingCompletedAt)
        .map((img) => img.processingCompletedAt!.getTime() - img.processingStartedAt!.getTime());

    if (processingTimes.length > 0) {
        avgProcessingTimeMs = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
    }

    // Issue frequency
    const issueFrequency: Record<string, number> = {};
    for (const f of failedChecks) {
        issueFrequency[f.checkName] = f._count._all;
    }

    // Average composite score
    const scores = completedImages
        .filter((img) => img.compositeScore !== null)
        .map((img) => img.compositeScore!);

    const averageCompositeScore = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : null;

    return {
        totalImages,
        statusBreakdown,
        averageProcessingTimeMs: avgProcessingTimeMs ? parseFloat(avgProcessingTimeMs.toFixed(2)) : null,
        issueFrequency,
        averageCompositeScore: averageCompositeScore ? parseFloat(averageCompositeScore.toFixed(4)) : null,
    };
}
