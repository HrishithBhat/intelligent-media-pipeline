import Tesseract from 'tesseract.js';
import { AnalysisCheckResult } from '../types';

/**
 * OCR Extraction Module
 * 
 * Uses Tesseract.js to extract text from the image.
 * Primarily aimed at reading vehicle number plates, but extracts all visible text.
 * Confidence is derived from Tesseract's own word-level confidence scores.
 */
export async function analyzeOCR(imagePath: string): Promise<AnalysisCheckResult> {
    try {
        const result = await Tesseract.recognize(imagePath, 'eng', {
            logger: () => { }, // suppress progress logs
        });

        const text = result.data.text.trim();
        const wordConfidences = result.data.words?.map((w) => w.confidence) ?? [];
        const avgConfidence = wordConfidences.length > 0
            ? wordConfidences.reduce((a, b) => a + b, 0) / wordConfidences.length
            : 0;

        const hasText = text.length > 0;

        // Score: normalized OCR confidence (Tesseract gives 0-100)
        const score = avgConfidence / 100;

        // Our confidence in this result
        const confidence = hasText
            ? Math.min(0.99, 0.5 + (avgConfidence / 100) * 0.4)
            : 0.3; // low confidence if no text extracted at all

        return {
            check: 'ocr_extraction',
            passed: hasText,
            score: parseFloat(score.toFixed(4)),
            confidence: parseFloat(confidence.toFixed(4)),
            details: JSON.stringify({
                extractedText: text,
                wordCount: result.data.words?.length ?? 0,
                avgWordConfidence: parseFloat(avgConfidence.toFixed(2)),
                message: hasText
                    ? `Extracted ${result.data.words?.length ?? 0} words with average confidence ${avgConfidence.toFixed(1)}%.`
                    : 'No text could be extracted from the image.',
            }),
        };
    } catch (error) {
        return {
            check: 'ocr_extraction',
            passed: false,
            score: 0,
            confidence: 0.1,
            details: JSON.stringify({
                extractedText: '',
                wordCount: 0,
                avgWordConfidence: 0,
                message: `OCR extraction failed: ${(error as Error).message}`,
            }),
        };
    }
}
