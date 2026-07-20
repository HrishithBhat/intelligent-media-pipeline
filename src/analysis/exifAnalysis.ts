import exifr from 'exifr';
import { AnalysisCheckResult } from '../types';

/**
 * Metadata (EXIF) Analysis Module
 * 
 * Checks for presence, absence, and consistency of camera EXIF metadata.
 * - Presence of camera Make/Model suggests a genuine camera photo
 * - Timestamp consistency
 * - GPS data presence (useful but not required)
 * - Software tag (may indicate editing)
 */

interface ExifData {
    Make?: string;
    Model?: string;
    DateTimeOriginal?: Date | string;
    CreateDate?: Date | string;
    ModifyDate?: Date | string;
    GPSLatitude?: number;
    GPSLongitude?: number;
    Software?: string;
    ExifImageWidth?: number;
    ExifImageHeight?: number;
    ImageWidth?: number;
    ImageHeight?: number;
    FocalLength?: number;
    ISO?: number;
    ExposureTime?: number;
    FNumber?: number;
    Orientation?: number;
}

export async function analyzeExif(imagePath: string): Promise<AnalysisCheckResult> {
    try {
        let exif: ExifData | null = null;

        try {
            exif = await exifr.parse(imagePath, {
                pick: [
                    'Make', 'Model', 'DateTimeOriginal', 'CreateDate', 'ModifyDate',
                    'GPSLatitude', 'GPSLongitude', 'Software', 'ExifImageWidth',
                    'ExifImageHeight', 'ImageWidth', 'ImageHeight', 'FocalLength',
                    'ISO', 'ExposureTime', 'FNumber', 'Orientation',
                ],
            });
        } catch {
            exif = null;
        }

        if (!exif || Object.keys(exif).length === 0) {
            return {
                check: 'exif_analysis',
                passed: false,
                score: 0.2,
                confidence: 0.7,
                details: JSON.stringify({
                    message: 'No EXIF metadata found. This may indicate a screenshot, processed image, or photo stripped of metadata.',
                    hasCamera: false,
                    hasTimestamp: false,
                    hasGPS: false,
                    hasSoftware: false,
                }),
            };
        }

        const hasCamera = !!(exif.Make || exif.Model);
        const hasTimestamp = !!(exif.DateTimeOriginal || exif.CreateDate);
        const hasGPS = !!(exif.GPSLatitude && exif.GPSLongitude);
        const hasSoftware = !!exif.Software;
        const hasCameraSettings = !!(exif.FocalLength || exif.ISO || exif.ExposureTime || exif.FNumber);

        // Check timestamp consistency
        let timestampConsistent = true;
        if (exif.DateTimeOriginal && exif.ModifyDate) {
            const origDate = new Date(exif.DateTimeOriginal);
            const modDate = new Date(exif.ModifyDate);
            // If modify date is significantly different (>1 hour), flag it
            timestampConsistent = Math.abs(origDate.getTime() - modDate.getTime()) < 3600000;
        }

        // Scoring: more metadata fields = higher score
        let metadataPoints = 0;
        if (hasCamera) metadataPoints += 2;
        if (hasTimestamp) metadataPoints += 2;
        if (hasCameraSettings) metadataPoints += 1;
        if (hasGPS) metadataPoints += 1;
        if (timestampConsistent) metadataPoints += 1;
        if (!hasSoftware) metadataPoints += 1; // no editing software is better

        const maxPoints = 8;
        const score = metadataPoints / maxPoints;

        // Passed if camera info exists and timestamps are consistent
        const passed = hasCamera && timestampConsistent;

        const confidence = Math.min(0.99, 0.5 + metadataPoints * 0.06);

        const details: Record<string, unknown> = {
            message: passed
                ? `EXIF metadata looks consistent. Camera: ${exif.Make || 'unknown'} ${exif.Model || 'unknown'}.`
                : `EXIF metadata is ${!hasCamera ? 'missing camera info' : 'inconsistent'}.`,
            hasCamera,
            cameraInfo: hasCamera ? `${exif.Make ?? ''} ${exif.Model ?? ''}`.trim() : null,
            hasTimestamp,
            timestampConsistent,
            hasGPS,
            gpsCoordinates: hasGPS ? { lat: exif.GPSLatitude, lon: exif.GPSLongitude } : null,
            hasSoftware,
            softwareName: exif.Software ?? null,
            hasCameraSettings,
            cameraSettings: hasCameraSettings ? {
                focalLength: exif.FocalLength ?? null,
                iso: exif.ISO ?? null,
                exposureTime: exif.ExposureTime ?? null,
                fNumber: exif.FNumber ?? null,
            } : null,
        };

        return {
            check: 'exif_analysis',
            passed,
            score: parseFloat(score.toFixed(4)),
            confidence: parseFloat(confidence.toFixed(4)),
            details: JSON.stringify(details),
        };
    } catch (error) {
        return {
            check: 'exif_analysis',
            passed: false,
            score: 0,
            confidence: 0.1,
            details: JSON.stringify({
                message: `EXIF analysis failed: ${(error as Error).message}`,
                hasCamera: false,
                hasTimestamp: false,
                hasGPS: false,
                hasSoftware: false,
            }),
        };
    }
}
