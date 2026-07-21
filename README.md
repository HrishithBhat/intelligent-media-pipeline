# Intelligent Media Processing Pipeline

A production-quality backend system that ingests vehicle images, processes them asynchronously through 10 analysis checks, and reports structured, uncertainty-aware results. Built for field-uploaded vehicle images that may have real-world quality issues.

🔗 **Live Demo:** [https://intelligent-media-pipeline-production.up.railway.app/dashboard](https://intelligent-media-pipeline-production.up.railway.app/dashboard)
📦 **GitHub:** [https://github.com/HrishithBhat/intelligent-media-pipeline](https://github.com/HrishithBhat/intelligent-media-pipeline)
🩺 **Health Check:** [https://intelligent-media-pipeline-production.up.railway.app/health](https://intelligent-media-pipeline-production.up.railway.app/health)

---

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Setup & Running](#setup--running)
- [API Reference](#api-reference)
- [Analysis Checks](#analysis-checks)
- [AI Usage Disclosure](#ai-usage-disclosure)
- [Trade-offs & Decisions](#trade-offs--decisions)
- [Deployment Notes](#deployment-notes)
- [Assumptions](#assumptions)

---

## Architecture

### System Flow Diagram

```
┌─────────┐     POST /api/images/upload      ┌──────────────┐
│  Client  │ ────────────────────────────────▸│  Express API │
│ (cURL/UI)│ ◂──── 202 { id, status }────────│   Server     │
└─────────┘                                   └──────┬───────┘
                                                     │
                  ┌──────────────────────────────────┤
                  │  1. Validate file (type/size)    │
                  │  2. Save to local storage        │
                  │  3. Insert DB row (pending)      │
                  │  4. Enqueue BullMQ job           │
                  └──────────────────────────────────┘
                                                     │
                                              ┌──────▼───────┐
                                              │    Redis      │
                                              │  (BullMQ)     │
                                              └──────┬───────┘
                                                     │
                                              ┌──────▼───────┐
                                              │   Worker(s)   │
                                              │               │
                                              │  10 Analysis  │
                                              │   Modules     │
                                              └──────┬───────┘
                                                     │
                  ┌──────────────────────────────────┤
                  │  1. Run all 10 checks            │
                  │  2. Persist results (txn)         │
                  │  3. Compute composite score       │
                  │  4. Update status: completed      │
                  └──────────────────────────────────┘
                                                     │
                                              ┌──────▼───────┐
                                              │  PostgreSQL   │
                                              │               │
                                              │  images       │
                                              │  results      │
                                              │  attempts     │
                                              └──────────────┘
```

### Processing Flow

1. **Upload**: Client sends image via `POST /api/images/upload` (multipart/form-data)
2. **Validation**: Multer validates file type (JPEG/PNG/WebP/TIFF/BMP) and size (≤10MB)
3. **Storage**: Image saved to local disk with UUID filename
4. **Persistence**: Metadata row created in PostgreSQL with `status = pending`
5. **Queue**: BullMQ job enqueued in Redis — response returns immediately (202)
6. **Worker**: Background worker picks up job, runs all 10 analysis checks
7. **Results**: All check results persisted in a single transaction, status set to `completed`
8. **Retrieval**: Client polls `GET /api/images/:id/status` or `/results`

### Queue Strategy

**BullMQ + Redis** was chosen because:
- Built-in retry with configurable exponential backoff (2s → 4s → 8s)
- Job-level timeout support (120s default)
- Configurable concurrency per worker (default: 3 concurrent jobs)
- Built-in job lifecycle events for observability
- Redis persistence ensures jobs survive worker restarts
- Dead-letter queue semantics via `removeOnFail` with age-based retention

---

## Features

### Core
- ✅ Multipart image upload with immediate 202 response
- ✅ Queue-based async processing with BullMQ
- ✅ 10 independent analysis checks, each with pass/fail, score, confidence, and details
- ✅ Status, results, and failure APIs
- ✅ Retry with exponential backoff + manual retry endpoint
- ✅ Processing attempt tracking
- ✅ Composite confidence scoring

### Bonus
- ✅ Dashboard UI (upload + results viewer + analytics)
- ✅ Analytics endpoint (totals, avg processing time, issue frequency)
- ✅ Rate limiting on upload
- ✅ Health check endpoint (`/health`)
- ✅ Docker Compose (api + worker + postgres + redis)
- ✅ Structured JSON logging (pino)
- ✅ Unit tests + integration tests
- ✅ Storage abstraction layer (swappable to S3)

---

## Tech Stack

| Component | Technology | Justification |
|-----------|-----------|---------------|
| Runtime | Node.js + TypeScript | Assignment-recommended, type-safe |
| HTTP | Express 4 | Mature, well-documented |
| Queue | BullMQ + Redis | Robust retry/backoff, concurrency control |
| Database | PostgreSQL + Prisma | Type-safe ORM, migrations, great DX |
| Storage | Local disk (abstracted) | Swappable to S3 via `StorageProvider` interface |
| Image processing | sharp | Fast native bindings, convolve/stats support |
| OCR | Tesseract.js | No external deps, works in-process |
| EXIF | exifr | Lightweight, comprehensive EXIF parser |
| Logging | pino | Structured JSON, fast |
| Testing | Jest + Supertest | Standard for Express/TS APIs |
| Container | Docker + Compose | One-command deployment |

---

## Project Structure

```
intelligent-media-pipeline/
├── prisma/
│   ├── schema.prisma              # Database schema (Image, AnalysisResult, ProcessingAttempt)
│   └── migrations/                # Auto-generated SQL migrations
├── public/
│   └── index.html                 # Dashboard UI (upload, results, analytics)
├── src/
│   ├── analysis/                  # 10 Analysis Modules
│   │   ├── index.ts               # Barrel export
│   │   ├── blurDetection.ts       # Laplacian variance via sharp convolve
│   │   ├── brightnessAnalysis.ts  # Histogram luminance + contrast stats
│   │   ├── dimensionValidation.ts # Min resolution check
│   │   ├── duplicateDetection.ts  # Perceptual hash + hamming distance
│   │   ├── exifAnalysis.ts        # Camera metadata consistency
│   │   ├── numberPlateValidation.ts # Indian plate regex + OCR correction
│   │   ├── ocrExtraction.ts       # Tesseract.js text extraction
│   │   ├── photoOfPhotoDetection.ts # Border, moiré, glare detection
│   │   ├── screenshotDetection.ts # Multi-signal heuristic detection
│   │   └── tamperingDetection.ts  # ELA + quadrant noise analysis
│   ├── config/
│   │   └── index.ts               # Centralized env config with validation
│   ├── controllers/
│   │   └── imageController.ts     # Express route handlers
│   ├── db/
│   │   └── prisma.ts              # Singleton Prisma client
│   ├── middleware/
│   │   ├── errorHandler.ts        # Global error handler (JSON responses)
│   │   ├── rateLimiter.ts         # Upload rate limiting
│   │   └── upload.ts              # Multer config (type/size validation)
│   ├── queue/
│   │   ├── connection.ts          # Redis connection options
│   │   ├── imageQueue.ts          # BullMQ queue with retry/backoff
│   │   └── index.ts               # Barrel export
│   ├── routes/
│   │   ├── analyticsRoutes.ts     # GET /api/analytics
│   │   └── imageRoutes.ts         # CRUD routes for images
│   ├── services/
│   │   └── imageService.ts        # Business logic (upload, status, results, retry, analytics)
│   ├── storage/
│   │   └── index.ts               # Storage abstraction (local disk, swappable to S3)
│   ├── types/
│   │   └── index.ts               # TypeScript interfaces
│   ├── utils/
│   │   └── logger.ts              # Pino structured JSON logger
│   ├── workers/
│   │   └── analysisWorker.ts      # BullMQ worker (runs 10 checks, persists results)
│   ├── app.ts                     # Express app setup (middleware, routes, health)
│   ├── server.ts                  # API server entry point
│   └── worker.ts                  # Worker process entry point
├── tests/
│   ├── unit/
│   │   ├── analysis.test.ts       # 11 tests for analysis modules
│   │   └── numberPlate.test.ts    # 9 tests for plate validation
│   └── integration/
│       └── api.test.ts            # API endpoint tests
├── .env.example                   # Environment variable template
├── .gitignore
├── Dockerfile                     # API server container
├── Dockerfile.worker              # Worker container
├── docker-compose.yml             # Full stack (postgres, redis, api, worker)
├── jest.config.js                 # Test configuration
├── package.json
├── tsconfig.json
├── SETUP.md                       # Detailed setup instructions
├── WORKFLOW.md                    # Development workflow log
└── README.md                      # This file
```

---

## Setup & Running

### Prerequisites

- Node.js 18+ (recommended: 20 LTS)
- PostgreSQL 14+
- Redis 7+
- Docker + Docker Compose (optional)

### Option 1: Docker Compose (Recommended)

```bash
# Clone and navigate to the project
cd intelligent-media-pipeline

# Start all services (postgres, redis, api, worker)
docker-compose up --build

# The API will be available at http://localhost:3000
# Dashboard at http://localhost:3000/dashboard
```

### Option 2: Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env
# Edit .env with your PostgreSQL and Redis connection details

# 3. Generate Prisma client
npx prisma generate

# 4. Run database migrations
npx prisma migrate dev --name init

# 5. Start the API server (Terminal 1)
npm run dev

# 6. Start the worker (Terminal 2)
npm run dev:worker

# API: http://localhost:3000
# Dashboard: http://localhost:3000/dashboard
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API server port |
| `DATABASE_URL` | (see .env.example) | PostgreSQL connection string |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `UPLOAD_DIR` | `./uploads` | Local storage directory |
| `MAX_FILE_SIZE_MB` | `10` | Max upload size |
| `WORKER_CONCURRENCY` | `3` | Jobs processed in parallel per worker |
| `JOB_TIMEOUT_MS` | `120000` | Per-job timeout |
| `JOB_MAX_RETRIES` | `3` | Auto-retry count |
| `BLUR_THRESHOLD` | `100` | Laplacian variance threshold |
| `MIN_BRIGHTNESS` | `40` | Min acceptable luminance (0-255) |
| `MAX_BRIGHTNESS` | `240` | Max acceptable luminance |
| `MIN_IMAGE_WIDTH` | `640` | Min image width in pixels |
| `MIN_IMAGE_HEIGHT` | `480` | Min image height in pixels |
| `DUPLICATE_HASH_THRESHOLD` | `10` | Hamming distance threshold |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | `30` | Requests per window |

---

## API Reference

### Upload Image

```bash
# Upload an image
curl -X POST http://localhost:3000/api/images/upload \
  -F "image=@/path/to/vehicle.jpg"
```

**Response (202 Accepted):**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "pending",
  "message": "Image uploaded successfully. Processing will begin shortly."
}
```

### Get Processing Status

```bash
curl http://localhost:3000/api/images/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status
```

**Response (200):**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "originalFilename": "vehicle.jpg",
  "status": "completed",
  "uploadedAt": "2024-01-15T10:30:00.000Z",
  "processingStartedAt": "2024-01-15T10:30:01.000Z",
  "processingCompletedAt": "2024-01-15T10:30:15.000Z"
}
```

### Get Analysis Results

```bash
curl http://localhost:3000/api/images/a1b2c3d4-e5f6-7890-abcd-ef1234567890/results
```

**Response (200):**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "originalFilename": "vehicle.jpg",
  "status": "completed",
  "compositeScore": 0.7825,
  "compositeConfidence": 0.7340,
  "results": [
    {
      "check": "blur_detection",
      "passed": true,
      "score": 0.82,
      "confidence": 0.90,
      "details": "Laplacian variance: 245.3 (threshold: 100). Image is acceptably sharp."
    },
    {
      "check": "brightness_analysis",
      "passed": true,
      "score": 0.75,
      "confidence": 0.85,
      "details": "Average luminance: 132.5/255, StdDev: 45.8. Brightness is acceptable."
    }
  ]
}
```

### Get Failure Details

```bash
curl http://localhost:3000/api/images/a1b2c3d4-e5f6-7890-abcd-ef1234567890/failure
```

**Response (200):**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "failed",
  "failureReason": "Failed after 3 attempts. Last error: ...",
  "attempts": [
    {
      "attemptNumber": 1,
      "status": "failed",
      "errorMessage": "Timeout exceeded",
      "startedAt": "2024-01-15T10:30:01.000Z",
      "completedAt": "2024-01-15T10:32:01.000Z"
    }
  ]
}
```

### Manual Retry

```bash
curl -X POST http://localhost:3000/api/images/a1b2c3d4-e5f6-7890-abcd-ef1234567890/retry
```

**Response (202):**
```json
{
  "success": true,
  "message": "Retry enqueued. Image will be re-processed."
}
```

### Analytics

```bash
curl http://localhost:3000/api/analytics
```

**Response (200):**
```json
{
  "totalImages": 42,
  "statusBreakdown": {
    "completed": 38,
    "failed": 2,
    "processing": 1,
    "pending": 1
  },
  "averageProcessingTimeMs": 12450.75,
  "issueFrequency": {
    "blur_detection": 5,
    "brightness_analysis": 3,
    "screenshot_detection": 2
  },
  "averageCompositeScore": 0.7234
}
```

### Health Check

```bash
curl http://localhost:3000/health
```

**Response (200):**
```json
{
  "status": "ok",
  "uptime": 3600.42,
  "timestamp": "2024-01-15T11:30:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

---

## Analysis Checks

Each check returns a structured result with `passed`, `score` (0-1), `confidence` (0-1), and `details`.

| # | Check | Method | Key Signals |
|---|-------|--------|-------------|
| 1 | **Blur Detection** | Laplacian variance via sharp convolve | Variance < threshold = blurry |
| 2 | **Brightness Analysis** | Greyscale histogram stats | Mean luminance, std deviation |
| 3 | **Dimension Validation** | sharp metadata | Width/height vs minimum thresholds |
| 4 | **OCR Extraction** | Tesseract.js | Extracted text, word-level confidence |
| 5 | **Number Plate Validation** | Regex + OCR correction | Indian plate format patterns (KA01AB1234) |
| 6 | **Duplicate Detection** | 16×16 perceptual hash + hamming distance | Compared against all prior images |
| 7 | **Screenshot Detection** | Multi-signal | Aspect ratio, EXIF absence, flat color bars, common screen sizes |
| 8 | **Photo-of-Photo Detection** | Heuristic analysis | Border detection, moiré patterns, glare spots |
| 9 | **EXIF Analysis** | exifr parsing | Camera make/model, timestamp consistency, GPS, software tags |
| 10 | **Tampering Detection** | ELA + noise consistency | Recompression error levels, quadrant noise variance |

### Confidence Scoring Philosophy

- **Confidence** reflects how sure the system is about its own result, not just whether the check passed.
- Each check calibrates confidence independently: dimension checks are 0.99 (factual), while heuristic checks like screenshot detection top out at ~0.85.
- **Composite score** is a simple average of all check scores — a starting point for ranking images by quality.

---

## AI Usage Disclosure

### What AI Was Used For

This project was built with AI assistance (Antigravity / Cursor) across all files. Here is a transparent breakdown:

**AI-generated with manual verification:**
- All 10 analysis modules (`src/analysis/`) — the algorithms (Laplacian variance, ELA, perceptual hashing) were specified as prompts; AI generated the implementations which were reviewed for correctness
- Express boilerplate (controllers, routes, middleware, app.ts) — standard patterns
- Prisma schema — designed from the requirements specification
- Docker & Docker Compose configuration
- Dashboard UI (public/index.html)
- Test files (unit + integration tests)

**Key decisions made by the human/prompt author:**
- Architecture choice (separate API server + worker process)
- Analysis module selection and signal combination thresholds
- Confidence calibration strategy (different caps per check type)
- Queue configuration (backoff timing, retry counts, concurrency)
- Database schema design (separate tables for results and attempts)
- Storage abstraction interface design

### Where AI Output Needed Correction

1. **Perceptual hashing**: Initial AI suggestion used `blockhash-core` directly, but setting up the native dependency was fragile. Switched to a pure-JS implementation using sharp's resize-to-16×16 + threshold approach — less sophisticated but more reliable and portable.

2. **ELA implementation**: AI initially tried to compute pixel-level diff between two sharp pipelines, but intermediate buffer sizes didn't always match due to JPEG recompression changing dimensions slightly. Added `resize` normalization to ensure both buffers have identical dimensions.

3. **OCR integration**: AI suggested `createWorker()` pattern from Tesseract.js v4, but the API changed in v5. Corrected to use `Tesseract.recognize()` directly.

4. **Number plate regex**: Initial regex was too strict (`^[A-Z]{2}\d{2}[A-Z]{2}\d{4}$`). Indian plates have variable components (1-2 digit district codes, 1-3 letter series). Expanded to multiple patterns with OCR error correction.

### How Outputs Were Validated

- **Analysis modules**: Unit tests with programmatically generated images (sharp, blurry, dark, bright, small) verify pass/fail thresholds are working correctly
- **API endpoints**: Integration tests with Supertest verify request validation, 404 handling, and response structure
- **Manual testing**: Uploaded real vehicle images and screenshots to verify the full pipeline end-to-end
- **Code review**: Every generated file was read and understood before inclusion

---

## Trade-offs & Decisions

### Intentional Simplifications

| Area | Decision | Rationale |
|------|----------|-----------|
| Perceptual hash | 16×16 greyscale threshold instead of pHash | Avoids native dependency, simpler to reason about |
| ELA | JPEG recompression at fixed 75% quality | Real ELA would use multiple quality levels |
| Worker architecture | Single worker process | Simpler to debug; can scale to multiple via `docker-compose scale worker=N` |
| Duplicate detection | Full-table scan of existing hashes | Fast enough for <100k images; would need an index/cache at scale |
| Photo-of-photo | Rule-based heuristics | ML-based detection would be far more accurate but adds deployment complexity |
| Screenshot detection | 4 independent signals with threshold=2 | Simple but effective; a trained classifier would be better |

### What Would Improve With More Time

1. **ML-based classifiers** — Train simple CNN classifiers for screenshot/photo-of-photo detection
2. **Streaming upload** — Currently uses multer memory storage; stream-to-disk for very large files
3. **Webhook/SSE notifications** — Instead of polling, push status updates to the client
4. **S3 storage backend** — Implement `S3StorageProvider` for production use
5. **Job priority** — Assign priority based on user tier or urgency
6. **Result caching** — Cache analysis results to avoid re-processing identical images
7. **More sophisticated composite scoring** — Weighted by check importance, not simple average
8. **OpenAPI/Swagger spec** — Auto-generated API documentation
9. **Prometheus metrics** — Expose `/metrics` for Grafana dashboards
10. **E2E tests** — Full pipeline tests with real Redis/PostgreSQL in CI

### Scalability Concerns

**What breaks first at 10x load (~1000 images/day):**
- Duplicate detection's full-table scan becomes slow → **Fix**: Index perceptual hashes, use locality-sensitive hashing (LSH) for O(1) lookup
- Local disk storage fills up → **Fix**: S3 + lifecycle policies
- Single Redis instance becomes bottleneck → **Fix**: Redis Cluster

**At 100x load (~10,000 images/day):**
- Tesseract.js OCR is CPU-intensive (~3-5s per image) → **Fix**: Dedicate OCR-specific worker pool, or use cloud OCR (Google Vision API, AWS Textract)
- PostgreSQL write throughput → **Fix**: Batch inserts, connection pooling (PgBouncer), read replicas
- Worker concurrency limits → **Fix**: Horizontal scaling with multiple worker containers + Redis-backed queue ensures correctness

### Failure Handling

- **Transient failures** (network, timeout): Automatic retry with exponential backoff (3 attempts)
- **Permanent failures** (corrupt file, unsupported format): Fail after max retries, persist detailed error
- **Partial analysis failure**: If one check fails, the entire job fails to ensure consistent results. Future improvement: save partial results and flag which checks succeeded
- **Worker crash mid-processing**: BullMQ's active job timeout detects stalled jobs and re-queues them

---

## Deployment Notes

### How This Would Be Deployed

**Render / Railway:**
1. Deploy API as a web service (auto-detects Node.js)
2. Deploy worker as a background worker (same codebase, different start command: `npm run start:worker`)
3. Add managed PostgreSQL and Redis instances
4. Set environment variables in the dashboard
5. Share a persistent volume for uploads (or use S3)

**AWS:**
1. API: ECS Fargate service behind ALB
2. Worker: ECS Fargate service (no load balancer needed)
3. Database: RDS PostgreSQL
4. Queue: ElastiCache Redis
5. Storage: S3 bucket with pre-signed URLs
6. CI/CD: GitHub Actions → ECR → ECS deployment

### Cost Optimization Thinking

| Resource | Est. Cost (low traffic) | Optimization |
|----------|------------------------|-------------|
| Storage | ~$0.023/GB/month (S3) | Lifecycle rules to archive/delete old images |
| Redis | ~$15/month (ElastiCache t3.micro) | Single node sufficient for <10k jobs/day |
| PostgreSQL | ~$15/month (RDS t3.micro) | Connection pooling to avoid idle connections |
| Compute (OCR) | ~$0.001/image (self-hosted) | Batch processing during off-peak; or Google Vision API at $1.50/1000 images |
| Egress | Minimal for API-only traffic | Serve images from S3 with CloudFront |

---

## Assumptions

1. **One image per upload**: The API accepts exactly one image per request, not batch uploads
2. **Image integrity**: The uploaded file is a valid image; we don't handle deeply corrupted files beyond what sharp reports
3. **Indian plates only**: Number plate validation targets Indian formats; other country formats are not validated
4. **Sequential analysis**: All 10 checks run in sequence per image for simplicity; parallelizable but not currently parallelized
5. **No authentication**: The API is open; authentication/authorization would be added in production
6. **No pagination**: Results API returns all analysis results for an image; fine for 10 checks per image
7. **Tesseract English only**: OCR uses English language model; Indian script plates (Hindi, regional languages) may not be recognized
8. **UTC timestamps**: All timestamps are stored and returned in UTC
9. **Idempotent retry**: Manual retry clears old results before re-processing; no support for incremental re-analysis
10. **Same filesystem**: API server and worker must share the uploads directory (via Docker volume or same machine)

---

## Running Tests

```bash
# All tests with coverage
npm test

# Unit tests only
npm run test:unit

# Integration tests only (requires PostgreSQL + Redis)
npm run test:integration
```

---


