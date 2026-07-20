import sharp from 'sharp';
import { AnalysisCheckResult } from '../types';
import { config } from '../config';

/**
 * Image Dimension Validation Module
 * 
 * Checks whether the image meets minimum resolution requirements.
 * Flags images that are too small to be useful for vehicle inspection.
 */
export async function analyzeDimensions(imagePath: string): Promise<AnalysisCheckResult> {
    try {
        const metadata = await sharp(imagePath).metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;

        const minWidth = config.analysis.minImageWidth;
        const minHeight = config.analysis.minImageHeight;

        const widthOk = width >= minWidth;
        const heightOk = height >= minHeight;
        const passed = widthOk && heightOk;

        // Score: how much of the minimum requirement is met (1 = exactly at or above min)
        const widthRatio = Math.min(1, width / minWidth);
        const heightRatio = Math.min(1, height / minHeight);
        const score = (widthRatio + heightRatio) / 2;

        // High confidence — dimensions are a hard fact
        const confidence = 0.99;

        const details = `Image dimensions: ${width}×${height}px. Minimum required: ${minWidth}×${minHeight}px. ${passed
                ? 'Dimensions meet requirements.'
                : `Image is too small: ${!widthOk ? `width ${width} < ${minWidth}` : ''}${!widthOk && !heightOk ? ', ' : ''}${!heightOk ? `height ${height} < ${minHeight}` : ''}.`
            }`;

        return {
            check: 'dimension_validation',
            passed,
            score: parseFloat(score.toFixed(4)),
            confidence,
            details,
        };
    } catch (error) {
        return {
            check: 'dimension_validation',
            passed: false,
            score: 0,
            confidence: 0.1,
            details: `Dimension validation failed: ${(error as Error).message}`,
        };
    }
}
