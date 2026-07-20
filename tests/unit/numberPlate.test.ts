import { validateNumberPlate } from '../../src/analysis/numberPlateValidation';

describe('Number Plate Validation', () => {
    it('should validate standard Indian plate format', async () => {
        const result = await validateNumberPlate('', '', 'KA 01 AB 1234');
        expect(result.check).toBe('number_plate_validation');
        expect(result.passed).toBe(true);
        expect(result.score).toBeGreaterThan(0.5);
    });

    it('should validate plate without spaces', async () => {
        const result = await validateNumberPlate('', '', 'MH12DE1234');
        expect(result.passed).toBe(true);
    });

    it('should validate with hyphen separators', async () => {
        const result = await validateNumberPlate('', '', 'DL-1C-AB-1234');
        expect(result.passed).toBe(true);
    });

    it('should apply OCR corrections (0 → O)', async () => {
        // "KA 01 A8 1234" with B→8 substitution should still match after correction
        const result = await validateNumberPlate('', '', 'KA 01 A8 1234');
        expect(result.passed).toBe(true);
    });

    it('should fail for random text', async () => {
        const result = await validateNumberPlate('', '', 'Hello World 2024');
        expect(result.passed).toBe(false);
    });

    it('should fail for empty text', async () => {
        const result = await validateNumberPlate('', '', '');
        expect(result.passed).toBe(false);
        expect(result.confidence).toBeLessThan(0.5);
    });

    it('should fail for undefined text', async () => {
        const result = await validateNumberPlate('', '', undefined);
        expect(result.passed).toBe(false);
    });

    it('should validate BH series plates', async () => {
        const result = await validateNumberPlate('', '', '22 BH 1234 AA');
        expect(result.passed).toBe(true);
    });

    it('should handle multi-line OCR output', async () => {
        const result = await validateNumberPlate('', '', 'Some noise\nKA 05 MG 9876\nMore noise');
        expect(result.passed).toBe(true);
    });
});
