/**
 * Shared type definitions for the media processing pipeline
 */

export interface AnalysisCheckResult {
    check: string;
    passed: boolean;
    score: number;
    confidence: number;
    details: string;
}

export interface ImageUploadResponse {
    id: string;
    status: string;
    message: string;
}

export interface ImageStatusResponse {
    id: string;
    originalFilename: string;
    status: string;
    uploadedAt: string;
    processingStartedAt: string | null;
    processingCompletedAt: string | null;
}

export interface ImageResultsResponse {
    id: string;
    originalFilename: string;
    status: string;
    compositeScore: number | null;
    compositeConfidence: number | null;
    results: AnalysisCheckResult[];
}

export interface ImageFailureResponse {
    id: string;
    status: string;
    failureReason: string | null;
    attempts: {
        attemptNumber: number;
        status: string;
        errorMessage: string | null;
        startedAt: string;
        completedAt: string | null;
    }[];
}

export interface AnalyticsResponse {
    totalImages: number;
    statusBreakdown: Record<string, number>;
    averageProcessingTimeMs: number | null;
    issueFrequency: Record<string, number>;
    averageCompositeScore: number | null;
}

export interface HealthResponse {
    status: 'ok' | 'degraded' | 'down';
    uptime: number;
    timestamp: string;
    services: {
        database: 'connected' | 'disconnected';
        redis: 'connected' | 'disconnected';
    };
}

export type AnalysisModule = {
    name: string;
    analyze: (imagePath: string, imageId: string) => Promise<AnalysisCheckResult>;
};
