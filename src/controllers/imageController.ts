import { Request, Response, NextFunction } from 'express';
import * as imageService from '../services/imageService';
import { logger } from '../utils/logger';

interface IdParams {
    id: string;
}

/**
 * POST /api/images/upload
 * Accepts multipart form data, persists the image, enqueues analysis.
 * Returns 202 Accepted immediately with the processing ID.
 */
export async function uploadImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No image file provided. Use field name "image".' });
            return;
        }

        const result = await imageService.uploadImage(req.file);
        res.status(202).json(result);
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/images/:id/status
 */
export async function getStatus(req: Request<IdParams>, res: Response, next: NextFunction): Promise<void> {
    try {
        const id = req.params.id as string;
        const result = await imageService.getImageStatus(id);

        if (!result) {
            res.status(404).json({ error: 'Image not found' });
            return;
        }

        res.json(result);
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/images/:id/results
 */
export async function getResults(req: Request<IdParams>, res: Response, next: NextFunction): Promise<void> {
    try {
        const id = req.params.id as string;
        const result = await imageService.getImageResults(id);

        if (!result) {
            res.status(404).json({ error: 'Image not found' });
            return;
        }

        if (result.status !== 'completed') {
            res.status(409).json({
                error: 'Results not yet available',
                status: result.status,
                message: `Image is currently in "${result.status}" status. Check back later.`,
            });
            return;
        }

        res.json(result);
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/images/:id/failure
 */
export async function getFailure(req: Request<IdParams>, res: Response, next: NextFunction): Promise<void> {
    try {
        const id = req.params.id as string;
        const result = await imageService.getImageFailure(id);

        if (!result) {
            res.status(404).json({ error: 'Image not found' });
            return;
        }

        if (result.status !== 'failed') {
            res.status(409).json({
                error: 'Image has not failed',
                status: result.status,
            });
            return;
        }

        res.json(result);
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/images/:id/retry
 */
export async function retryAnalysis(req: Request<IdParams>, res: Response, next: NextFunction): Promise<void> {
    try {
        const id = req.params.id as string;
        const result = await imageService.retryImageAnalysis(id);

        if (!result.success) {
            res.status(400).json({ error: result.message });
            return;
        }

        res.status(202).json(result);
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/analytics
 */
export async function getAnalytics(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const result = await imageService.getAnalytics();
        res.json(result);
    } catch (error) {
        next(error);
    }
}
