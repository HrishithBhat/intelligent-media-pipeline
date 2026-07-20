import sharp from 'sharp';
import { AnalysisCheckResult } from '../types';

/**
 * Suspicious Editing / Tampering Detection Module
 * 
 * Implements Error Level Analysis (ELA) and noise inconsistency detection.
 * 
 * ELA technique:
 * 1. Re-save the image at a known quality level (e.g. JPEG 75%)
 * 2. Compare original with re-saved: regions that were previously edited
 *    will have different error levels than original regions
 * 3. High variance in error levels suggests tampering
 * 
 * Also checks for:
 * - Noise inconsistency across image quadrants (edited regions often have different noise profiles)
 * - Uniform noise where there should be natural variation
 */

async function performELA(imagePath: string): Promise<{
    elaVariance: number;
    elaMean: number;
    maxDifference: number;
}> {
    // Load original as raw pixels
    const original = await sharp(imagePath)
        .resize(500, 500, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 100 })
        .raw()
        .toBuffer({ resolveWithObject: true });

    // Re-compress at lower quality
    const recompressed = await sharp(imagePath)
        .resize(500, 500, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 }) // intentional quality loss
        .toBuffer();

    // Convert back to raw for comparison
    const recompRaw = await sharp(recompressed)
        .raw()
        .toBuffer({ resolveWithObject: true });

    const origPixels = new Uint8Array(original.data);
    const recompPixels = new Uint8Array(recompRaw.data);

    const len = Math.min(origPixels.length, recompPixels.length);

    // Compute difference (ELA)
    const diffs: number[] = [];
    for (let i = 0; i < len; i++) {
        diffs.push(Math.abs(origPixels[i] - recompPixels[i]));
    }

    // Compute stats on the differences
    let sum = 0;
    let maxDiff = 0;
    for (const d of diffs) {
        sum += d;
        if (d > maxDiff) maxDiff = d;
    }
    const mean = sum / diffs.length;

    let varianceSum = 0;
    for (const d of diffs) {
        varianceSum += (d - mean) * (d - mean);
    }
    const variance = varianceSum / diffs.length;

    return {
        elaVariance: variance,
        elaMean: mean,
        maxDifference: maxDiff,
    };
}

async function analyzeNoiseConsistency(imagePath: string): Promise<{
    isConsistent: boolean;
    quadrantStdDevs: number[];
    noiseVariation: number;
}> {
    const { data, info } = await sharp(imagePath)
        .resize(200, 200, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data);
    const w = info.width;
    const h = info.height;
    const halfW = Math.floor(w / 2);
    const halfH = Math.floor(h / 2);

    // Split into 4 quadrants and compute noise (local std dev)
    function quadrantStdDev(startX: number, startY: number, endX: number, endY: number): number {
        let sum = 0;
        let count = 0;

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                sum += pixels[y * w + x];
                count++;
            }
        }
        const mean = sum / count;

        let varSum = 0;
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const diff = pixels[y * w + x] - mean;
                varSum += diff * diff;
            }
        }

        return Math.sqrt(varSum / count);
    }

    const quadrants = [
        quadrantStdDev(0, 0, halfW, halfH),       // top-left
        quadrantStdDev(halfW, 0, w, halfH),        // top-right
        quadrantStdDev(0, halfH, halfW, h),        // bottom-left
        quadrantStdDev(halfW, halfH, w, h),        // bottom-right
    ];

    // Check how different the noise levels are across quadrants
    const avgStdDev = quadrants.reduce((a, b) => a + b, 0) / quadrants.length;
    let noiseVariation = 0;
    for (const q of quadrants) {
        noiseVariation += Math.abs(q - avgStdDev);
    }
    noiseVariation /= quadrants.length;

    // High noise variation suggests inconsistency (possible tampering)
    const isConsistent = noiseVariation < avgStdDev * 0.5;

    return {
        isConsistent,
        quadrantStdDevs: quadrants.map((q) => parseFloat(q.toFixed(2))),
        noiseVariation: parseFloat(noiseVariation.toFixed(2)),
    };
}

export async function analyzeTampering(imagePath: string): Promise<AnalysisCheckResult> {
    try {
        let signals = 0;
        const totalSignals = 2;
        const signalDetails: string[] = [];

        // Signal 1: ELA analysis
        const ela = await performELA(imagePath);
        // High ELA variance with high mean suggests edited regions
        const elaThreshold = 50;
        if (ela.elaVariance > elaThreshold && ela.elaMean > 10) {
            signals++;
            signalDetails.push(
                `ELA variance ${ela.elaVariance.toFixed(1)} exceeds threshold ${elaThreshold}. Mean error: ${ela.elaMean.toFixed(1)}, max diff: ${ela.maxDifference}`
            );
        }

        // Signal 2: Noise inconsistency
        const noise = await analyzeNoiseConsistency(imagePath);
        if (!noise.isConsistent) {
            signals++;
            signalDetails.push(
                `Noise inconsistency detected across quadrants. Variation: ${noise.noiseVariation}, StdDevs: [${noise.quadrantStdDevs.join(', ')}]`
            );
        }

        const isTampered = signals >= 1; // even 1 signal is worth flagging
        const score = 1 - signals / totalSignals;
        const confidence = Math.min(0.85, 0.3 + signals * 0.25);

        return {
            check: 'tampering_detection',
            passed: !isTampered,
            score: parseFloat(score.toFixed(4)),
            confidence: parseFloat(confidence.toFixed(4)),
            details: JSON.stringify({
                message: isTampered
                    ? `Potential tampering detected. ${signals}/${totalSignals} signals.`
                    : `No significant tampering indicators. ${signals}/${totalSignals} signals.`,
                signals: signalDetails,
                ela: {
                    variance: parseFloat(ela.elaVariance.toFixed(2)),
                    mean: parseFloat(ela.elaMean.toFixed(2)),
                    maxDifference: ela.maxDifference,
                },
                noiseConsistency: noise,
            }),
        };
    } catch (error) {
        return {
            check: 'tampering_detection',
            passed: true,
            score: 0.5,
            confidence: 0.1,
            details: JSON.stringify({
                message: `Tampering detection failed: ${(error as Error).message}`,
                signals: [],
                ela: null,
                noiseConsistency: null,
            }),
        };
    }
}
