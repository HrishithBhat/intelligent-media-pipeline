# Development Workflow Log

A complete chronological record of every step taken to build the Intelligent Media Processing Pipeline.

---

## Phase 1: Project Initialization

### 1.1 Package & Config Setup
- Created `package.json` with all dependencies:
  - **Runtime**: express, bullmq, ioredis, @prisma/client, sharp, tesseract.js, exifr, multer, uuid, pino, helmet, cors, express-rate-limit, dotenv
  - **Dev**: typescript, tsx, ts-jest, jest, supertest, @types/* packages, prisma CLI
- Created `tsconfig.json` with strict mode, ES2022 target, path aliases
- Created `.env.example` with all configurable environment variables
- Created `.gitignore` (node_modules, dist, uploads, .env, coverage, test fixtures)

### 1.2 Database Schema
- Created `prisma/schema.prisma` with 3 models:
  - `Image` — tracks uploaded images, status, composite scores, timestamps
  - `AnalysisResult` — stores each check's pass/fail, score, confidence, details
  - `ProcessingAttempt` — tracks retry attempts with error messages

---

## Phase 2: Core Infrastructure

### 2.1 Configuration Module
- `src/config/index.ts` — Centralized env config with validation and defaults for all thresholds, ports, concurrency settings

### 2.2 Database & Logging
- `src/db/prisma.ts` — Singleton Prisma client instance
- `src/utils/logger.ts` — Pino structured JSON logger with child logger factory

### 2.3 Type Definitions
- `src/types/index.ts` — TypeScript interfaces for `AnalysisCheckResult`, `UploadResponse`, `StatusResponse`, `ResultsResponse`, `FailureResponse`, `AnalyticsResponse`

### 2.4 Queue System
- `src/queue/connection.ts` — Redis connection options for BullMQ
- `src/queue/imageQueue.ts` — BullMQ queue with exponential backoff (2s→4s→8s), 3 retries, 24h completed job retention, 7-day failed job retention
- `src/queue/index.ts` — Barrel export

### 2.5 Storage Abstraction
- `src/storage/index.ts` — `StorageProvider` interface with `LocalStorageProvider` implementation. Designed to be swappable to S3 without changing business logic.

### 2.6 Middleware
- `src/middleware/upload.ts` — Multer config: memory storage, 10MB limit, JPEG/PNG/WebP/TIFF/BMP validation
- `src/middleware/errorHandler.ts` — Global Express error handler with structured JSON responses and Prisma error detection
- `src/middleware/rateLimiter.ts` — Rate limiting on upload endpoint (30 req/min)

---

## Phase 3: Analysis Engine (10 Modules)

### 3.1 Blur Detection (`src/analysis/blurDetection.ts`)
- **Method**: Laplacian variance via sharp's `convolve()` with kernel `[0,1,0,1,-4,1,0,1,0]`
- **Logic**: Compute variance of convolved greyscale image. High variance = sharp, low = blurry
- **Threshold**: Configurable (default: 100)

### 3.2 Brightness Analysis (`src/analysis/brightnessAnalysis.ts`)
- **Method**: Greyscale histogram statistics via `sharp.stats()`
- **Logic**: Mean luminance + standard deviation. Flags too dark (<40) or overexposed (>240)
- **Output**: Detailed luminance and contrast metrics

### 3.3 Duplicate Detection (`src/analysis/duplicateDetection.ts`)
- **Method**: 16×16 greyscale perceptual hash + Hamming distance
- **Logic**: Resize to 16×16, threshold at mean brightness to create 256-bit hash. Compare against all existing hashes in DB via Hamming distance.
- **Threshold**: Distance < 10 = duplicate

### 3.4 OCR Extraction (`src/analysis/ocrExtraction.ts`)
- **Method**: Tesseract.js `recognize()` with English language model
- **Output**: Extracted text, word count, average confidence score

### 3.5 Number Plate Validation (`src/analysis/numberPlateValidation.ts`)
- **Method**: Regex pattern matching against Indian plate formats + OCR error correction
- **Patterns**: Standard (KA01AB1234), BH series (22BH1234AA), diplomatic, military
- **OCR Corrections**: O↔0, I↔1, S↔5, B↔8, Z↔2, G↔6
- **Bug Fix**: Fixed multi-line OCR handling — split on newlines before cleaning, added sliding window word-group matching to find plates within noisy text

### 3.6 Dimension Validation (`src/analysis/dimensionValidation.ts`)
- **Method**: `sharp.metadata()` for width/height
- **Logic**: Compare against minimum thresholds (default: 640×480)
- **Confidence**: 0.99 (factual measurement)

### 3.7 Screenshot Detection (`src/analysis/screenshotDetection.ts`)
- **Method**: 4 independent signals combined with threshold
- **Signals**: Common screen aspect ratios • Missing EXIF data • Flat-color status bars • Common screen resolutions (1920×1080, etc.)
- **Logic**: ≥2 signals triggered = likely screenshot

### 3.8 Photo-of-Photo Detection (`src/analysis/photoOfPhotoDetection.ts`)
- **Method**: Heuristic analysis of multiple visual indicators
- **Signals**: Border/frame detection • Moiré pattern analysis • Glare spot detection • Overall image characteristics

### 3.9 EXIF Analysis (`src/analysis/exifAnalysis.ts`)
- **Method**: `exifr` parsing for camera metadata
- **Extracts**: Camera make/model, timestamp, GPS coordinates, software tags, orientation
- **Flags**: Missing EXIF, software editing tags, timestamp inconsistencies

### 3.10 Tampering Detection (`src/analysis/tamperingDetection.ts`)
- **Method**: Error Level Analysis (ELA) + noise consistency
- **ELA**: Re-save at 75% quality, compute pixel-level difference. Tampered regions show higher error levels.
- **Noise**: Divide image into 4 quadrants, compare noise variance. Inconsistent quadrants suggest splicing.
- **Bug Fix**: Added `resize` normalization to ensure buffers have identical dimensions after JPEG recompression

---

## Phase 4: API Layer

### 4.1 Service Layer (`src/services/imageService.ts`)
- `uploadImage()` — Save file, create DB row, enqueue BullMQ job, return 202
- `getImageStatus()` — Return current processing status
- `getImageResults()` — Return all 10 check results with composite score
- `getImageFailure()` — Return failure reason + attempt history
- `retryImageAnalysis()` — Clear old results, reset status, re-enqueue
- `getAnalytics()` — Aggregate stats: totals, status breakdown, avg processing time, issue frequency, avg composite score

### 4.2 Controllers (`src/controllers/imageController.ts`)
- Express route handlers wrapping service calls with error forwarding
- **Bug Fix**: Added `Request<IdParams>` generic typing to fix Express v5 `string | string[]` params issue

### 4.3 Routes
- `src/routes/imageRoutes.ts` — POST /upload, GET /:id/status, GET /:id/results, GET /:id/failure, POST /:id/retry
- `src/routes/analyticsRoutes.ts` — GET /api/analytics

### 4.4 Application Setup (`src/app.ts`)
- Express app with helmet, CORS, JSON parsing, rate limiting
- Health check endpoint (`/health`) checking DB + Redis connectivity
- Static file serving for dashboard (`/dashboard`)
- 404 handler for unknown routes

### 4.5 Entry Points
- `src/server.ts` — API server with graceful shutdown (SIGTERM/SIGINT)
- `src/worker.ts` — Worker process entry point

---

## Phase 5: Worker

### 5.1 Analysis Worker (`src/workers/analysisWorker.ts`)
- BullMQ Worker consuming from `image-analysis` queue
- Runs all 10 checks sequentially per image
- OCR runs before number plate validation (dependency)
- Persists all results in a single Prisma transaction
- Computes composite score (average of all check scores)
- Tracks processing attempts with error details
- **Bug Fix**: Moved `timeout` from queue `defaultJobOptions` to Worker's `lockDuration` (BullMQ v5 API change)

---

## Phase 6: Dashboard UI

### 6.1 Dashboard (`public/index.html`)
- Single-page HTML/CSS/JS dashboard
- Dark theme with glassmorphism, gradient accents, micro-animations
- Real-time stats polling (every 5s): total images, completed, processing, failed, avg processing time
- Drag-and-drop upload zone with file type/size validation
- Status polling after upload with progress indicators
- Analysis results viewer with score bars, confidence badges, pass/fail indicators
- Image ID lookup for retrieving past results
- System health indicator (green dot when all services operational)

---

## Phase 7: Containerization

### 7.1 Docker
- `Dockerfile` — Multi-stage build for API server (node:20-slim, Prisma generate, production dependencies only)
- `Dockerfile.worker` — Worker-specific Dockerfile
- `docker-compose.yml` — 4 services:
  - `postgres` (PostgreSQL 16 Alpine) with health checks
  - `redis` (Redis 7 Alpine) with health checks
  - `api` (Express server, depends on postgres + redis, auto-runs migrations)
  - `worker` (BullMQ worker, depends on postgres + redis)

---

## Phase 8: Testing

### 8.1 Jest Configuration
- `jest.config.js` — ts-jest preset, 30s timeout, coverage reporting
- **Bug Fix**: Converted from `jest.config.ts` to `.js` because ts-jest couldn't parse TS config format

### 8.2 Unit Tests (`tests/unit/analysis.test.ts`) — 11 tests
- Programmatically generates test images using sharp (random pixels for "sharp", solid gray + blur for "blurry", solid dark/bright, small dimensions)
- **Bug Fix**: Replaced `noise` option in sharp `create` (not a valid option) with raw Buffer of random pixels
- Tests blur detection pass/fail, brightness pass/fail, dimension validation, screenshot/photo-of-photo/tampering structured output

### 8.3 Unit Tests (`tests/unit/numberPlate.test.ts`) — 9 tests
- Standard Indian format, no-spaces format, hyphen separators, OCR corrections, random text rejection, empty/undefined text, BH series, multi-line OCR

### 8.4 Integration Tests (`tests/integration/api.test.ts`)
- Health endpoint, upload without file, upload non-image, 404 for nonexistent image ID, analytics endpoint, unknown route 404

---

## Phase 9: Bug Fixes & TypeScript Compilation

### 9.1 TypeScript Errors Fixed
1. **BullMQ `timeout`**: Removed `timeout` from `defaultJobOptions` (not valid in BullMQ v5), added `lockDuration` to Worker config instead
2. **Express params typing**: Changed from `Request` to `Request<IdParams>` with `as string` cast to fix `string | string[]` type error in Express v5
3. **Number plate `cleaned` scope**: Variable `cleaned` was inside loop but referenced outside — replaced with `lines.join(' ')`
4. **Sharp `noise` option**: `create` options don't support `noise` — switched to raw Buffer with random pixels for test images
5. **Jest config format**: Converted `.ts` to `.js` because ts-jest couldn't parse TypeScript config

### 9.2 Compilation Result
- `npx tsc --noEmit` — **0 errors**
- `npx tsc` — Successful build to `dist/`
- All 20 unit tests passing

---

## Phase 10: Local Deployment & Verification

### 10.1 Infrastructure Setup
- Started Docker Desktop on Windows
- Pulled and ran `redis:7-alpine` on port 6379
- Pulled and ran `postgres:16-alpine` on port **5433** (not 5432, because a local PostgreSQL was already using that port)
- **Bug Fix**: Changed `localhost` to `127.0.0.1` in `.env` to avoid IPv6 resolution issues on Windows
- Ran `npx prisma migrate dev --name init` to create database tables

### 10.2 End-to-End Verification
- Started API server (`npm run dev`) on port 3000
- Started worker (`npm run dev:worker`) with concurrency=3
- Uploaded 3 test images via curl and dashboard
- All 3 processed successfully with 10/10 checks in ~3.7s average
- Dashboard showing correct stats, analysis results with score bars
- Health endpoint returning `{"status": "ok", "services": {"database": "connected", "redis": "connected"}}`

---

## Phase 11: Git & Delivery Preparation

### 11.1 Git Setup
- Initialized git repo
- Updated `.gitignore` with test fixtures and temp files
- Committed all files with descriptive commit message
- Created `WORKFLOW.md` (this file), `SETUP.md`, added file structure to `README.md`
