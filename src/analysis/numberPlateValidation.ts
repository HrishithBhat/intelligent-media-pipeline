import { AnalysisCheckResult } from '../types';

/**
 * Indian Vehicle Number Plate Validation Module
 * 
 * Validates OCR-extracted text against standard Indian vehicle plate formats.
 * Indian plates typically follow: XX 00 XX(X) 0000
 * Where: XX = state code (2 letters), 00 = district/RTO (1-2 digits), 
 *         XX(X) = series (1-3 letters), 0000 = number (4 digits)
 * 
 * Common formats:
 * - KA 01 AB 1234  (standard format)
 * - MH 12 DE 1234
 * - DL 1C AB 1234  (Delhi style with alphanumeric district)
 * 
 * We apply multiple regex patterns with tolerance for OCR noise
 * (common substitutions: 0↔O, 1↔I, 5↔S, 8↔B, etc.)
 */

const INDIAN_PLATE_PATTERNS = [
    // Standard format: XX 00 XX 0000 (with optional spaces/hyphens)
    /^[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{4}$/,
    // BH (Bharat) series: 00 BH 0000 XX
    /^\d{2}\s*BH\s*\d{4}\s*[A-Z]{1,2}$/,
    // Diplomatic plates
    /^\d{2,3}\s*CD\s*\d{1,4}$/,
    // Military: arrow prefix patterns (we just check the text portion)
    /^[A-Z]{2}\s*\d{2,3}\s*[A-Z]?\s*\d{4}$/,
];

// Clean OCR text: fix common OCR misreads
function cleanOCRText(text: string): string {
    return text
        .toUpperCase()
        .replace(/[^A-Z0-9\s\-]/g, '') // remove special chars
        .replace(/\s+/g, ' ')           // normalize whitespace
        .trim();
}

// Apply common OCR error corrections
function applyOCRCorrections(text: string): string[] {
    const variants: string[] = [text];

    // Common substitutions
    const subs: [string, string][] = [
        ['O', '0'],
        ['0', 'O'],
        ['I', '1'],
        ['1', 'I'],
        ['S', '5'],
        ['5', 'S'],
        ['B', '8'],
        ['8', 'B'],
        ['Z', '2'],
        ['2', 'Z'],
        ['G', '6'],
        ['6', 'G'],
    ];

    // Generate single-character variants (not exhaustive but practical)
    for (const [from, to] of subs) {
        if (text.includes(from)) {
            variants.push(text.replace(new RegExp(from, 'g'), to));
        }
    }

    return [...new Set(variants)];
}

export async function validateNumberPlate(
    _imagePath: string,
    _imageId: string,
    ocrText?: string
): Promise<AnalysisCheckResult> {
    try {
        if (!ocrText || ocrText.trim().length === 0) {
            return {
                check: 'number_plate_validation',
                passed: false,
                score: 0,
                confidence: 0.3,
                details: 'No OCR text available for number plate validation. The image may not contain a visible plate.',
            };
        }

        // Split on newlines first, then clean each line individually
        const rawLines = ocrText.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
        const lines: string[] = [];
        for (const raw of rawLines) {
            const cleaned = cleanOCRText(raw);
            if (cleaned.length > 0) lines.push(cleaned);
        }

        let bestMatch: { line: string; pattern: number; corrected: boolean } | null = null;

        for (const line of lines) {
            // Try the full line first (without spaces/hyphens)
            const nospaces = line.replace(/[\s\-]/g, '');
            for (let pi = 0; pi < INDIAN_PLATE_PATTERNS.length; pi++) {
                if (INDIAN_PLATE_PATTERNS[pi].test(nospaces) || INDIAN_PLATE_PATTERNS[pi].test(line)) {
                    bestMatch = { line, pattern: pi, corrected: false };
                    break;
                }
            }
            if (bestMatch) break;

            // Try sliding window of word groups within the line
            const words = line.split(/\s+/);
            for (let start = 0; start < words.length && !bestMatch; start++) {
                for (let end = start + 1; end <= Math.min(start + 5, words.length) && !bestMatch; end++) {
                    const segment = words.slice(start, end).join('');
                    for (let pi = 0; pi < INDIAN_PLATE_PATTERNS.length; pi++) {
                        if (INDIAN_PLATE_PATTERNS[pi].test(segment)) {
                            bestMatch = { line: words.slice(start, end).join(' '), pattern: pi, corrected: false };
                            break;
                        }
                    }
                }
            }
            if (bestMatch) break;

            // Try with OCR corrections on the full line
            const variants = applyOCRCorrections(nospaces);
            for (const variant of variants) {
                for (let pi = 0; pi < INDIAN_PLATE_PATTERNS.length; pi++) {
                    if (INDIAN_PLATE_PATTERNS[pi].test(variant)) {
                        bestMatch = { line: variant, pattern: pi, corrected: true };
                        break;
                    }
                }
                if (bestMatch) break;
            }
            if (bestMatch) break;
        }

        const passed = bestMatch !== null;
        const score = passed ? (bestMatch!.corrected ? 0.7 : 0.95) : 0.1;
        const confidence = passed
            ? (bestMatch!.corrected ? 0.65 : 0.85)
            : 0.6; // moderate confidence in "not found" since OCR could miss it

        return {
            check: 'number_plate_validation',
            passed,
            score: parseFloat(score.toFixed(4)),
            confidence: parseFloat(confidence.toFixed(4)),
            details: passed
                ? `Valid Indian plate format detected: "${bestMatch!.line}"${bestMatch!.corrected ? ' (after OCR correction)' : ''}. Pattern index: ${bestMatch!.pattern}.`
                : `No valid Indian plate format found in OCR text. Cleaned text: "${lines.join(' ').substring(0, 200)}".`,
        };
    } catch (error) {
        return {
            check: 'number_plate_validation',
            passed: false,
            score: 0,
            confidence: 0.1,
            details: `Number plate validation failed: ${(error as Error).message}`,
        };
    }
}
