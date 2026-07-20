import sharp from 'sharp';
import { AnalysisCheckResult } from '../types';
import { config } from '../config';

/**
 * Blur Detection Module
 * 
 * Uses the Laplacian variance technique: convert to greyscale, apply a
 * Laplacian-like convolution kernel via sharp, then compute variance of
 * the output. Low variance = blurry image.
 * 
 * Since sharp doesn't have a direct Laplacian function, we approximate by:
 * 1. Converting to greyscale
 * 2. Applying a 3x3 Laplacian kernel via sharp.convolve()
 * 3. Computing the variance of pixel intensities in the convolved output
 */
export async function analyzeBlur(imagePath: string): Promise<AnalysisCheckResult> {
    try {
        // Laplacian kernel for edge detection
        const laplacianKernel = {
            width: 3,
            height: 3,
            kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
        };

        const convolved = await sharp(imagePath)
            .greyscale()
            .convolve(laplacianKernel)
            .raw()
            .toBuffer({ resolveWithObject: true });

        const pixels = new Uint8Array(convolved.data);
        const n = pixels.length;

        // Compute mean
        let sum = 0;
        for (let i = 0; i < n; i++) {
            sum += pixels[i];
        }
        const mean = sum / n;

        // Compute variance
        let varianceSum = 0;
        for (let i = 0; i < n; i++) {
            const diff = pixels[i] - mean;
            varianceSum += diff * diff;
        }
        const variance = varianceSum / n;

        const threshold = config.analysis.blurThreshold;
        const passed = variance >= threshold;

        // Confidence: how far we are from the threshold (mapped to 0-1)
        // Very high or very low variance → high confidence
        const distance = Math.abs(variance - threshold);
        const confidence = Math.min(0.99, 0.5 + (distance / (threshold * 2)) * 0.5);

        // Score: normalized sharpness score (0-1 range, 1 = perfectly sharp)
        const score = Math.min(1, variance / (threshold * 3));

        return {
            check: 'blur_detection',
            passed,
            score: parseFloat(score.toFixed(4)),
            confidence: parseFloat(confidence.toFixed(4)),
            details: `Laplacian variance: ${variance.toFixed(1)} (threshold: ${threshold}). ${passed ? 'Image is acceptably sharp.' : 'Image appears blurry.'}`,
        };
    } catch (error) {
        return {
            check: 'blur_detection',
            passed: false,
            score: 0,
            confidence: 0.1,
            details: `Blur detection failed: ${(error as Error).message}`,
        };
    }
}
