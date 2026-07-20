import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/tiff',
    'image/bmp',
];

const multerStorage = multer.memoryStorage();

/**
 * Multer upload middleware.
 * Uses memory storage so we can process the buffer directly before saving.
 * File type + size validation happens at the multer layer.
 */
export const uploadMiddleware = multer({
    storage: multerStorage,
    limits: {
        fileSize: config.storage.maxFileSizeBytes,
        files: 1,
    },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`));
        }
    },
}).single('image');

/**
 * Generate a unique filename preserving the original extension.
 */
export function generateFilename(originalName: string): string {
    const ext = path.extname(originalName);
    return `${uuidv4()}${ext}`;
}
