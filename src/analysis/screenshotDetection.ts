import sharp from 'sharp';
import exifr from 'exifr';
import { AnalysisCheckResult } from '../types';

/**
 * Screenshot Detection Heuristics Module
 * 
 * Detects if an image is likely a screenshot rather than a camera photo.
 * Signals used:
 * 1. Aspect ratio matching common device screens (16:9, 9:16, 18:9, etc.)
 * 2. Absence of camera EXIF data (screenshots rarely have camera metadata)
 * 3. Presence of large flat color regions (status bars, nav bars)
 * 4. Common screenshot dimensions (e.g. 1080×1920, 1170×2532, etc.)
 */

const COMMON_SCREENSHOT_RATIOS = [
    { name: '16:9', ratio: 16 / 9, tolerance: 0.05 },
    { name: '9:16', ratio: 9 / 16, tolerance: 0.05 },
    { name: '18:9 (2:1)', ratio: 2.0, tolerance: 0.1 },
    { name: '9:18 (1:2)', ratio: 0.5, tolerance: 0.1 },
    { name: '19.5:9', ratio: 19.5 / 9, tolerance: 0.1 },
    { name: '9:19.5', ratio: 9 / 19.5, tolerance: 0.1 },
    { name: '4:3', ratio: 4 / 3, tolerance: 0.05 },
    { name: '3:4', ratio: 3 / 4, tolerance: 0.05 },
];

const COMMON_SCREENSHOT_SIZES = [
    [1080, 1920], [1080, 2340], [1080, 2400], [1170, 2532],
    [1284, 2778], [1440, 2560], [1440, 3200], [750, 1334],
    [828, 1792], [1125, 2436], [1242, 2688], [1920, 1080],
    [2560, 1440], [1366, 768], [1536, 2048], [2048, 1536],
];

async function detectFlatColorRegions(imagePath: string): Promise<{
    hasFlatTop: boolean;
    hasFlatBottom: boolean;
    flatRegionPercentage: number;
}> {
    const { data, info } = await sharp(imagePath)
        .resize(100, 100, { fit: 'fill' }) // downscale for speed
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data);
    const width = info.width;
    const height = info.height;

    // Check top 8% and bottom 8% for uniform color
    const topRows = Math.ceil(height * 0.08);
    const bottomStartRow = height - Math.ceil(height * 0.08);

    function isRowUniform(row: number, threshold: number = 10): boolean {
        const start = row * width;
        const first = pixels[start];
        for (let x = 1; x < width; x++) {
            if (Math.abs(pixels[start + x] - first) > threshold) return false;
        }
        return true;
    }

    let flatTopRows = 0;
    for (let y = 0; y < topRows; y++) {
        if (isRowUniform(y)) flatTopRows++;
    }

    let flatBottomRows = 0;
    for (let y = bottomStartRow; y < height; y++) {
        if (isRowUniform(y)) flatBottomRows++;
    }

    const hasFlatTop = flatTopRows >= topRows * 0.6;
    const hasFlatBottom = flatBottomRows >= Math.ceil(height * 0.08) * 0.6;
    const totalFlatRows = flatTopRows + flatBottomRows;
    const flatRegionPercentage = (totalFlatRows / height) * 100;

    return { hasFlatTop, hasFlatBottom, flatRegionPercentage };
}

export async function analyzeScreenshot(imagePath: string): Promise<AnalysisCheckResult> {
    try {
        const metadata = await sharp(imagePath).metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;

        let screenshotSignals = 0;
        const totalSignals = 4;
        const signalDetails: string[] = [];

        // Signal 1: Aspect ratio matches common screens
        const ratio = width / height;
        let matchedRatio: string | null = null;
        for (const sr of COMMON_SCREENSHOT_RATIOS) {
            if (Math.abs(ratio - sr.ratio) <= sr.tolerance) {
                matchedRatio = sr.name;
                break;
            }
        }
        if (matchedRatio) {
            screenshotSignals++;
            signalDetails.push(`Aspect ratio ${ratio.toFixed(2)} matches screen ratio ${matchedRatio}`);
        }

        // Signal 2: Missing camera EXIF
        let hasExif = false;
        try {
            const exif = await exifr.parse(imagePath, { pick: ['Make', 'Model', 'FocalLength'] });
            hasExif = !!(exif?.Make || exif?.Model || exif?.FocalLength);
        } catch {
            // no EXIF at all
        }
        if (!hasExif) {
            screenshotSignals++;
            signalDetails.push('No camera EXIF metadata found (Make/Model/FocalLength)');
        }

        // Signal 3: Common screenshot dimensions
        const isCommonSize = COMMON_SCREENSHOT_SIZES.some(
            ([w, h]) => (width === w && height === h) || (width === h && height === w)
        );
        if (isCommonSize) {
            screenshotSignals++;
            signalDetails.push(`Dimensions ${width}×${height} match a common screenshot size`);
        }

        // Signal 4: Flat color regions (status bar / nav bar)
        const flatRegions = await detectFlatColorRegions(imagePath);
        if (flatRegions.hasFlatTop || flatRegions.hasFlatBottom) {
            screenshotSignals++;
            signalDetails.push(
                `Flat color regions detected: ${flatRegions.hasFlatTop ? 'top' : ''}${flatRegions.hasFlatTop && flatRegions.hasFlatBottom ? '+' : ''}${flatRegions.hasFlatBottom ? 'bottom' : ''} (${flatRegions.flatRegionPercentage.toFixed(1)}% of image)`
            );
        }

        const isScreenshot = screenshotSignals >= 2; // require at least 2 signals
        const score = 1 - screenshotSignals / totalSignals; // 1 = definitely not screenshot
        const confidence = Math.min(0.99, 0.4 + screenshotSignals * 0.15);

        return {
            check: 'screenshot_detection',
            passed: !isScreenshot,
            score: parseFloat(score.toFixed(4)),
            confidence: parseFloat(confidence.toFixed(4)),
            details: isScreenshot
                ? `Image appears to be a screenshot. ${screenshotSignals}/${totalSignals} signals matched: ${signalDetails.join('; ')}.`
                : `Image does not appear to be a screenshot. ${screenshotSignals}/${totalSignals} signals matched${signalDetails.length ? ': ' + signalDetails.join('; ') : ''}.`,
        };
    } catch (error) {
        return {
            check: 'screenshot_detection',
            passed: true, // default to pass on error
            score: 0.5,
            confidence: 0.1,
            details: `Screenshot detection failed: ${(error as Error).message}`,
        };
    }
}
