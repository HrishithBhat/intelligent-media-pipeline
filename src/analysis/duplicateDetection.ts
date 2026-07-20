import sharp from 'sharp';
import { AnalysisCheckResult } from '../types';
import { config } from '../config';
import { prisma } from '../db/prisma';

/**
 * Duplicate Detection Module
 * 
 * Uses perceptual hashing (block hash) to detect visually similar images.
 * We compute a hash of each image and compare against all previously stored hashes.
 * Hamming distance below a threshold indicates a duplicate.
 * 
 * Implementation: Since blockhash-core can be tricky to set up, we implement
 * a simplified perceptual hash using sharp:
 * 1. Resize to 16x16
 * 2. Convert to greyscale
 * 3. Create binary hash from mean comparison
 * 4. Compare hamming distance against stored hashes
 */

function computePerceptualHash(pixels: Uint8Array): string {
    const n = pixels.length;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += pixels[i];
    const mean = sum / n;

    let hash = '';
    for (let i = 0; i < n; i++) {
        hash += pixels[i] >= mean ? '1' : '0';
    }
    return hash;
}

function hammingDistance(a: string, b: string): number {
    let distance = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) distance++;
    }
    return distance + Math.abs(a.length - b.length);
}

export async function analyzeDuplicate(
    imagePath: string,
    imageId: string
): Promise<AnalysisCheckResult> {
    try {
        // Compute perceptual hash: resize to 16x16 greyscale, then threshold
        const resized = await sharp(imagePath)
            .greyscale()
            .resize(16, 16, { fit: 'fill' })
            .raw()
            .toBuffer();

        const currentHash = computePerceptualHash(new Uint8Array(resized));

        // Look up existing hashes from analysis results of other completed images
        const existingResults = await prisma.analysisResult.findMany({
            where: {
                checkName: 'duplicate_detection',
                image: {
                    id: { not: imageId },
                    status: 'completed',
                },
            },
            select: {
                imageId: true,
                details: true,
            },
        });

        let isDuplicate = false;
        let closestDistance = Infinity;
        let duplicateOfId: string | null = null;
        const threshold = config.analysis.duplicateHashThreshold;

        for (const result of existingResults) {
            const details = result.details as Record<string, unknown>;
            const storedHash = details?.pHash as string;
            if (!storedHash) continue;

            const dist = hammingDistance(currentHash, storedHash);
            if (dist < closestDistance) {
                closestDistance = dist;
                if (dist <= threshold) {
                    isDuplicate = true;
                    duplicateOfId = result.imageId;
                }
            }
        }

        // Score: 1 = completely unique, 0 = exact duplicate
        const score = closestDistance === Infinity
            ? 1
            : Math.min(1, closestDistance / (threshold * 3));

        const confidence = closestDistance === Infinity
            ? 0.5 // no images to compare against
            : Math.min(0.99, 0.6 + Math.abs(closestDistance - threshold) / (threshold * 2) * 0.4);

        let details = isDuplicate
            ? `Potential duplicate detected of image ${duplicateOfId}. Hamming distance: ${closestDistance} (threshold: ${threshold}).`
            : `No duplicates found. Closest distance: ${closestDistance === Infinity ? 'N/A (no images to compare)' : closestDistance} (threshold: ${threshold}).`;

        return {
            check: 'duplicate_detection',
            passed: !isDuplicate,
            score: parseFloat(score.toFixed(4)),
            confidence: parseFloat(confidence.toFixed(4)),
            details: JSON.stringify({
                message: details,
                pHash: currentHash,
                closestDistance: closestDistance === Infinity ? null : closestDistance,
                duplicateOfId,
            }),
        };
    } catch (error) {
        return {
            check: 'duplicate_detection',
            passed: true,
            score: 0.5,
            confidence: 0.1,
            details: JSON.stringify({
                message: `Duplicate detection failed: ${(error as Error).message}`,
                pHash: null,
                closestDistance: null,
                duplicateOfId: null,
            }),
        };
    }
}
