import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Storage abstraction layer.
 * Currently uses local disk — designed so it can be swapped to S3-compatible storage.
 * Every method follows the same interface pattern, making it straightforward to
 * implement an S3StorageProvider that implements the same contract.
 */
export interface StorageProvider {
    save(filename: string, buffer: Buffer): Promise<string>;
    read(storagePath: string): Promise<Buffer>;
    delete(storagePath: string): Promise<void>;
    exists(storagePath: string): Promise<boolean>;
}

export class LocalStorageProvider implements StorageProvider {
    private baseDir: string;

    constructor(baseDir?: string) {
        this.baseDir = baseDir ?? config.storage.uploadDir;
        this.ensureDirectory();
    }

    private ensureDirectory(): void {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
            logger.info({ dir: this.baseDir }, 'Created upload directory');
        }
    }

    async save(filename: string, buffer: Buffer): Promise<string> {
        const filePath = path.join(this.baseDir, filename);
        await fs.promises.writeFile(filePath, buffer);
        return filePath;
    }

    async read(storagePath: string): Promise<Buffer> {
        return fs.promises.readFile(storagePath);
    }

    async delete(storagePath: string): Promise<void> {
        if (await this.exists(storagePath)) {
            await fs.promises.unlink(storagePath);
        }
    }

    async exists(storagePath: string): Promise<boolean> {
        try {
            await fs.promises.access(storagePath);
            return true;
        } catch {
            return false;
        }
    }
}

// Singleton instance — swap this for S3StorageProvider in production
export const storage: StorageProvider = new LocalStorageProvider();
