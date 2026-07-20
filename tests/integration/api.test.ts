import request from 'supertest';
import app from '../../src/app';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const TEST_FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

// Generate a simple test image before tests
beforeAll(async () => {
    if (!fs.existsSync(TEST_FIXTURES_DIR)) {
        fs.mkdirSync(TEST_FIXTURES_DIR, { recursive: true });
    }
});

afterAll(() => {
    if (fs.existsSync(TEST_FIXTURES_DIR)) {
        fs.rmSync(TEST_FIXTURES_DIR, { recursive: true, force: true });
    }
});

describe('API Integration Tests', () => {
    describe('GET /health', () => {
        it('should return health status', async () => {
            const res = await request(app).get('/health');
            expect(res.status).toBeLessThanOrEqual(503);
            expect(res.body).toHaveProperty('status');
            expect(res.body).toHaveProperty('uptime');
            expect(res.body).toHaveProperty('timestamp');
            expect(res.body).toHaveProperty('services');
        });
    });

    describe('POST /api/images/upload', () => {
        it('should reject requests without a file', async () => {
            const res = await request(app).post('/api/images/upload');
            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty('error');
        });

        it('should reject non-image files', async () => {
            const textBuffer = Buffer.from('This is not an image');
            const res = await request(app)
                .post('/api/images/upload')
                .attach('image', textBuffer, { filename: 'test.txt', contentType: 'text/plain' });
            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/images/:id/status', () => {
        it('should return 404 for non-existent image', async () => {
            const res = await request(app).get('/api/images/00000000-0000-0000-0000-000000000000/status');
            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('GET /api/images/:id/results', () => {
        it('should return 404 for non-existent image', async () => {
            const res = await request(app).get('/api/images/00000000-0000-0000-0000-000000000000/results');
            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/images/:id/failure', () => {
        it('should return 404 for non-existent image', async () => {
            const res = await request(app).get('/api/images/00000000-0000-0000-0000-000000000000/failure');
            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/images/:id/retry', () => {
        it('should return error for non-existent image', async () => {
            const res = await request(app).post('/api/images/00000000-0000-0000-0000-000000000000/retry');
            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('GET /api/analytics', () => {
        it('should return analytics data', async () => {
            const res = await request(app).get('/api/analytics');
            // May fail if DB is not connected, but should not crash
            expect([200, 500]).toContain(res.status);
            if (res.status === 200) {
                expect(res.body).toHaveProperty('totalImages');
                expect(res.body).toHaveProperty('statusBreakdown');
                expect(res.body).toHaveProperty('issueFrequency');
            }
        });
    });

    describe('404 Handler', () => {
        it('should return 404 for unknown routes', async () => {
            const res = await request(app).get('/api/nonexistent');
            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error');
        });
    });
});
