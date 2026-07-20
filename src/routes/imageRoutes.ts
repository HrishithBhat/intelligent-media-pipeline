import { Router } from 'express';
import * as imageController from '../controllers/imageController';
import { uploadMiddleware } from '../middleware/upload';
import { uploadRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Upload with rate limiting
router.post(
    '/upload',
    uploadRateLimiter,
    (req, res, next) => {
        uploadMiddleware(req, res, (err) => {
            if (err) return next(err);
            next();
        });
    },
    imageController.uploadImage
);

// Status, results, failure
router.get('/:id/status', imageController.getStatus);
router.get('/:id/results', imageController.getResults);
router.get('/:id/failure', imageController.getFailure);

// Manual retry
router.post('/:id/retry', imageController.retryAnalysis);

export default router;
