import { Router } from 'express';
import * as imageController from '../controllers/imageController';

const router = Router();

router.get('/', imageController.getAnalytics);

export default router;
