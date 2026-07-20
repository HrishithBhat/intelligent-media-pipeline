import sharp from 'sharp';
import { AnalysisCheckResult } from '../types';
import { config } from '../config';

/**
 * Brightness / Low-Light Analysis Module
 * 
 * Computes average luminance from the image histogram.
 * Uses the greyscale channel's mean for a simple but effective brightness estimate.
 * Also checks the histogram distribution to detect over/under-exposure.
 */
export async function analyzeBrightness(imagePath: string): Promise<AnalysisCheckResult> {
    try {
        const { channels } = await sharp(imagePath)
            .greyscale()
            .stats();

        const grey = channels[0];
        const mean = grey.mean;       // 0–255 average luminance
        const stdev = grey.stdev;     // standard deviation

        const minBrightness = config.analysis.minBrightness;
        const maxBrightness = config.analysis.maxBrightness;

        const isTooDark = mean < minBrightness;
        const isTooBright = mean > maxBrightness;
        const passed = !isTooDark && !isTooBright;

        // Score: normalized to 0-1 where 0.5 is ideal (128 luminance)
        const score = 1 - Math.abs(mean - 128) / 128;

        // Confidence: higher stdev (good contrast) + far from thresholds = higher confidence
        let confidence: number;
        if (passed) {
            confidence = Math.min(0.99, 0.7 + (stdev / 255) * 0.3);
        } else {
            const distFromSafe = isTooDark
                ? (minBrightness - mean) / minBrightness
                : (mean - maxBrightness) / (255 - maxBrightness);
            confidence = Math.min(0.99, 0.6 + distFromSafe * 0.3);
        }

        let details = `Average luminance: ${mean.toFixed(1)}/255, StdDev: ${stdev.toFixed(1)}.`;
        if (isTooDark) {
            details += ` Image appears too dark (below threshold ${minBrightness}).`;
        } else if (isTooBright) {
            details += ` Image appears overexposed (above threshold ${maxBrightness}).`;
        } else {
            details += ` Brightness is acceptable.`;
        }

        return {
            check: 'brightness_analysis',
            passed,
            score: parseFloat(score.toFixed(4)),
            confidence: parseFloat(confidence.toFixed(4)),
            details,
        };
    } catch (error) {
        return {
            check: 'brightness_analysis',
            passed: false,
            score: 0,
            confidence: 0.1,
            details: `Brightness analysis failed: ${(error as Error).message}`,
        };
    }
}
