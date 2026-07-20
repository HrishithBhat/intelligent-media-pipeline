import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { logger } from './utils/logger';
import { prisma } from './db/prisma';
import { redisConnection } from './queue';
import imageRoutes from './routes/imageRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.url }, 'Incoming request');
    next();
});

// Static files (dashboard)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/health', async (_req, res) => {
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    let redisStatus: 'connected' | 'disconnected' = 'disconnected';

    try {
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = 'connected';
    } catch {
        // db down
    }

    try {
        const pong = await redisConnection.ping();
        if (pong === 'PONG') redisStatus = 'connected';
    } catch {
        // redis down
    }

    const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';

    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'ok' : 'degraded',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
            database: dbStatus,
            redis: redisStatus,
        },
    });
});

// API routes
app.use('/api/images', imageRoutes);
app.use('/api/analytics', analyticsRoutes);

// Dashboard fallback
app.get('/dashboard', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
