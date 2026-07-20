import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { analyzeBlur } from '../../src/analysis/blurDetection';
import { analyzeBrightness } from '../../src/analysis/brightnessAnalysis';
import { analyzeDimensions } from '../../src/analysis/dimensionValidation';
import { analyzeScreenshot } from '../../src/analysis/screenshotDetection';
import { analyzePhotoOfPhoto } from '../../src/analysis/photoOfPhotoDetection';
import { analyzeTampering } from '../../src/analysis/tamperingDetection';

const TEST_IMAGES_DIR = path.join(__dirname, '..', 'fixtures');
const SHARP_IMG = path.join(TEST_IMAGES_DIR, 'sharp_test.jpg');
const BLURRY_IMG = path.join(TEST_IMAGES_DIR, 'blurry_test.jpg');
const DARK_IMG = path.join(TEST_IMAGES_DIR, 'dark_test.jpg');
const BRIGHT_IMG = path.join(TEST_IMAGES_DIR, 'bright_test.jpg');
const SMALL_IMG = path.join(TEST_IMAGES_DIR, 'small_test.jpg');
const NORMAL_IMG = path.join(TEST_IMAGES_DIR, 'normal_test.jpg');

// Generate test fixture images using sharp
beforeAll(async () => {
    if (!fs.existsSync(TEST_IMAGES_DIR)) {
        fs.mkdirSync(TEST_IMAGES_DIR, { recursive: true });
    }

    // Sharp image: create a detailed image by generating raw random pixel data
    const sharpPixels = Buffer.alloc(800 * 600 * 3);
    for (let i = 0; i < sharpPixels.length; i++) {
        sharpPixels[i] = Math.floor(Math.random() * 256);
    }
    await sharp(sharpPixels, { raw: { width: 800, height: 600, channels: 3 } })
        .jpeg({ quality: 95 })
        .toFile(SHARP_IMG);

    // Blurry image (uniform color = very low Laplacian variance)
    await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 128, g: 128, b: 128 } },
    }).blur(10).jpeg({ quality: 95 }).toFile(BLURRY_IMG);

    // Dark image
    await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 15, g: 15, b: 15 } },
    }).jpeg().toFile(DARK_IMG);

    // Bright/overexposed image
    await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 250, g: 250, b: 250 } },
    }).jpeg().toFile(BRIGHT_IMG);

    // Small image (below minimum dimensions)
    await sharp({
        create: { width: 200, height: 150, channels: 3, background: { r: 100, g: 150, b: 200 } },
    }).jpeg().toFile(SMALL_IMG);

    // Normal image: random pixels at 1024x768
    const normalPixels = Buffer.alloc(1024 * 768 * 3);
    for (let i = 0; i < normalPixels.length; i++) {
        normalPixels[i] = Math.floor(Math.random() * 256);
    }
    await sharp(normalPixels, { raw: { width: 1024, height: 768, channels: 3 } })
        .jpeg({ quality: 85 })
        .toFile(NORMAL_IMG);
});

afterAll(() => {
    // Cleanup test fixtures
    if (fs.existsSync(TEST_IMAGES_DIR)) {
        fs.rmSync(TEST_IMAGES_DIR, { recursive: true, force: true });
    }
});

describe('Blur Detection', () => {
    it('should pass a sharp image', async () => {
        const result = await analyzeBlur(SHARP_IMG);
        expect(result.check).toBe('blur_detection');
        expect(result.passed).toBe(true);
        expect(result.score).toBeGreaterThan(0);
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should fail a blurry image', async () => {
        const result = await analyzeBlur(BLURRY_IMG);
        expect(result.check).toBe('blur_detection');
        expect(result.passed).toBe(false);
        expect(result.score).toBeLessThan(0.5);
    });

    it('should return structured result', async () => {
        const result = await analyzeBlur(SHARP_IMG);
        expect(result).toHaveProperty('check');
        expect(result).toHaveProperty('passed');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('details');
    });
});

describe('Brightness Analysis', () => {
    it('should pass a normal brightness image', async () => {
        const result = await analyzeBrightness(NORMAL_IMG);
        expect(result.check).toBe('brightness_analysis');
        expect(result.passed).toBe(true);
    });

    it('should fail a dark image', async () => {
        const result = await analyzeBrightness(DARK_IMG);
        expect(result.check).toBe('brightness_analysis');
        expect(result.passed).toBe(false);
        expect(result.details).toContain('dark');
    });

    it('should fail a bright/overexposed image', async () => {
        const result = await analyzeBrightness(BRIGHT_IMG);
        expect(result.check).toBe('brightness_analysis');
        expect(result.passed).toBe(false);
        expect(result.details).toContain('overexposed');
    });
});

describe('Dimension Validation', () => {
    it('should pass a large enough image', async () => {
        const result = await analyzeDimensions(NORMAL_IMG);
        expect(result.check).toBe('dimension_validation');
        expect(result.passed).toBe(true);
        expect(result.confidence).toBe(0.99); // dimensions are factual
    });

    it('should fail a small image', async () => {
        const result = await analyzeDimensions(SMALL_IMG);
        expect(result.check).toBe('dimension_validation');
        expect(result.passed).toBe(false);
        expect(result.details).toContain('too small');
    });
});

describe('Screenshot Detection', () => {
    it('should return a structured result', async () => {
        const result = await analyzeScreenshot(NORMAL_IMG);
        expect(result.check).toBe('screenshot_detection');
        expect(typeof result.passed).toBe('boolean');
        expect(typeof result.score).toBe('number');
        expect(typeof result.confidence).toBe('number');
    });
});

describe('Photo-of-Photo Detection', () => {
    it('should return a structured result', async () => {
        const result = await analyzePhotoOfPhoto(NORMAL_IMG);
        expect(result.check).toBe('photo_of_photo_detection');
        expect(typeof result.passed).toBe('boolean');
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
    });
});

describe('Tampering Detection', () => {
    it('should return a structured result', async () => {
        const result = await analyzeTampering(NORMAL_IMG);
        expect(result.check).toBe('tampering_detection');
        expect(typeof result.passed).toBe('boolean');
        // Details should be valid JSON
        expect(() => JSON.parse(result.details)).not.toThrow();
    });
});
