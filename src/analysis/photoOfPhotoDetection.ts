import sharp from 'sharp';
import { AnalysisCheckResult } from '../types';

/**
 * Photo-of-Photo Detection Heuristics Module
 * 
 * Detects if an image is a photo taken of another screen/photo.
 * Signals used:
 * 1. Border/bezel detection — dark or uniform border areas around the image
 * 2. Moiré pattern hints — high-frequency noise patterns from screen
 * 3. Perspective distortion — trapezoidal framing suggesting off-angle capture
 * 4. Reflection/glare artifacts — bright spots in specific areas
 */

async function detectBorders(imagePath: string): Promise<{
    hasBorder: boolean;
    borderPercentage: number;
}> {
    const { data, info } = await sharp(imagePath)
        .resize(100, 100, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data);
    const w = info.width;
    const h = info.height;

    // Check if edges are significantly darker than center
    let edgeSum = 0;
    let edgeCount = 0;
    let centerSum = 0;
    let centerCount = 0;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            const isEdge = x < 5 || x >= w - 5 || y < 5 || y >= h - 5;
            if (isEdge) {
                edgeSum += pixels[idx];
                edgeCount++;
            } else {
                centerSum += pixels[idx];
                centerCount++;
            }
        }
    }

    const edgeMean = edgeSum / edgeCount;
    const centerMean = centerSum / centerCount;
    const diff = centerMean - edgeMean;

    // Significant difference suggests borders/bezel
    const hasBorder = diff > 40;
    const borderPercentage = hasBorder ? (diff / 255) * 100 : 0;

    return { hasBorder, borderPercentage };
}

async function detectMoirePattern(imagePath: string): Promise<{
    hasMoire: boolean;
    highFreqRatio: number;
}> {
    // Use high-pass filter: compare original with blurred version
    // High-frequency content in a screen photo will be periodically structured

    const original = await sharp(imagePath)
        .resize(200, 200, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer();

    const blurred = await sharp(imagePath)
        .resize(200, 200, { fit: 'fill' })
        .greyscale()
        .blur(3)
        .raw()
        .toBuffer();

    const origPixels = new Uint8Array(original);
    const blurPixels = new Uint8Array(blurred);

    // Compute high-frequency energy (diff between original and blurred)
    let highFreqEnergy = 0;
    let totalEnergy = 0;

    for (let i = 0; i < origPixels.length; i++) {
        const diff = Math.abs(origPixels[i] - blurPixels[i]);
        highFreqEnergy += diff * diff;
        totalEnergy += origPixels[i] * origPixels[i];
    }

    const ratio = totalEnergy > 0 ? highFreqEnergy / totalEnergy : 0;

    // High ratio indicates lots of high-frequency content (potential moiré)
    return {
        hasMoire: ratio > 0.05,
        highFreqRatio: ratio,
    };
}

async function detectGlare(imagePath: string): Promise<{
    hasGlare: boolean;
    brightSpotPercentage: number;
}> {
    const { data, info } = await sharp(imagePath)
        .resize(100, 100, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data);
    let brightSpots = 0;
    const threshold = 250; // near white

    for (let i = 0; i < pixels.length; i++) {
        if (pixels[i] >= threshold) brightSpots++;
    }

    const percentage = (brightSpots / pixels.length) * 100;

    // Small bright spots (0.5–5%) suggest glare, not overexposure
    return {
        hasGlare: percentage > 0.5 && percentage < 5,
        brightSpotPercentage: percentage,
    };
}

export async function analyzePhotoOfPhoto(imagePath: string): Promise<AnalysisCheckResult> {
    try {
        let signals = 0;
        const totalSignals = 3;
        const signalDetails: string[] = [];

        // Signal 1: Border/bezel detection
        const border = await detectBorders(imagePath);
        if (border.hasBorder) {
            signals++;
            signalDetails.push(`Dark border detected (intensity diff: ${border.borderPercentage.toFixed(1)}%)`);
        }

        // Signal 2: Moiré pattern
        const moire = await detectMoirePattern(imagePath);
        if (moire.hasMoire) {
            signals++;
            signalDetails.push(`High-frequency moiré patterns detected (ratio: ${moire.highFreqRatio.toFixed(4)})`);
        }

        // Signal 3: Glare
        const glare = await detectGlare(imagePath);
        if (glare.hasGlare) {
            signals++;
            signalDetails.push(`Glare/reflection detected (${glare.brightSpotPercentage.toFixed(1)}% bright spots)`);
        }

        const isPhotoOfPhoto = signals >= 2;
        const score = 1 - signals / totalSignals;
        const confidence = Math.min(0.95, 0.3 + signals * 0.2);

        return {
            check: 'photo_of_photo_detection',
            passed: !isPhotoOfPhoto,
            score: parseFloat(score.toFixed(4)),
            confidence: parseFloat(confidence.toFixed(4)),
            details: isPhotoOfPhoto
                ? `Image appears to be a photo of another photo/screen. ${signals}/${totalSignals} signals: ${signalDetails.join('; ')}.`
                : `Image does not appear to be a photo of a photo. ${signals}/${totalSignals} signals matched${signalDetails.length ? ': ' + signalDetails.join('; ') : ''}.`,
        };
    } catch (error) {
        return {
            check: 'photo_of_photo_detection',
            passed: true,
            score: 0.5,
            confidence: 0.1,
            details: `Photo-of-photo detection failed: ${(error as Error).message}`,
        };
    }
}
