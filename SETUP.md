# Setup Guide

Complete setup instructions for running the Intelligent Media Processing Pipeline locally, via Docker Compose, or in production.

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [Option 1: Docker Compose (Recommended)](#option-1-docker-compose-recommended)
- [Option 2: Local Development](#option-2-local-development)
- [Option 3: Production Deployment](#option-3-production-deployment)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### For Docker Compose (easiest)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- That's it! Everything else runs inside containers.

### For Local Development
- [Node.js 18+](https://nodejs.org/) (recommended: 20 LTS)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL + Redis containers)
- Git

---

## Option 1: Docker Compose (Recommended)

This is the **easiest way** — one command starts everything.

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/intelligent-media-pipeline.git
cd intelligent-media-pipeline

# 2. Start all services
docker-compose up --build
```

This starts 4 containers:
| Service | Port | Description |
|---------|------|-------------|
| `postgres` | 5432 (internal) | PostgreSQL 16 database |
| `redis` | 6379 (internal) | Redis 7 queue backend |
| `api` | **3000** | Express API + Dashboard |
| `worker` | — | BullMQ analysis worker |

**Access points:**
- Dashboard: http://localhost:3000/dashboard
- API: http://localhost:3000/api/images/upload
- Health: http://localhost:3000/health

**To stop:**
```bash
docker-compose down          # Stop containers
docker-compose down -v       # Stop + delete database data
```

**To restart:**
```bash
docker-compose up            # Reuse existing containers
docker-compose up --build    # Rebuild after code changes
```

---

## Option 2: Local Development

Use this when you want to edit code and see changes instantly (hot-reload).

### Step 1: Install Dependencies

```bash
cd intelligent-media-pipeline
npm install
```

### Step 2: Start PostgreSQL and Redis via Docker

```bash
# Start Redis
docker run -d --name media-redis -p 6379:6379 redis:7-alpine

# Start PostgreSQL
# NOTE: If you already have PostgreSQL running locally on port 5432,
# use port 5433 instead (change -p 5432:5432 to -p 5433:5432)
docker run -d --name media-postgres \
  -p 5432:5432 \
  -e POSTGRES_USER=pipeline \
  -e POSTGRES_PASSWORD=pipeline123 \
  -e POSTGRES_DB=media_pipeline \
  postgres:16-alpine
```

### Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` if needed. Key settings:
```
DATABASE_URL=postgresql://pipeline:pipeline123@127.0.0.1:5432/media_pipeline?schema=public
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

> **Windows users**: If you have a local PostgreSQL on port 5432, change the Docker port to 5433 and update DATABASE_URL accordingly:
> ```
> DATABASE_URL=postgresql://pipeline:pipeline123@127.0.0.1:5433/media_pipeline?schema=public
> ```

### Step 4: Setup Database

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init
```

### Step 5: Start the Application (2 terminals needed)

**Terminal 1 — API Server:**
```bash
npm run dev
```

**Terminal 2 — Worker:**
```bash
npm run dev:worker
```

**Access points:**
- Dashboard: http://localhost:3000/dashboard
- API: http://localhost:3000/api/images/upload
- Health: http://localhost:3000/health

### Managing Docker Containers

```bash
# Check if containers are running
docker ps

# Stop containers
docker stop media-redis media-postgres

# Start existing containers (after laptop restart)
docker start media-redis media-postgres

# Remove containers entirely
docker rm -f media-redis media-postgres
```

---

## Option 3: Production Deployment

### AWS / Cloud

1. **Database**: Use managed PostgreSQL (AWS RDS, Supabase, Neon)
2. **Redis**: Use managed Redis (AWS ElastiCache, Upstash, Redis Cloud)
3. **API**: Deploy as a web service (ECS, Railway, Render)
4. **Worker**: Deploy as background worker (same codebase, command: `npm run start:worker`)
5. **Storage**: Replace local storage with S3 (implement `S3StorageProvider`)

### Environment Variables for Production

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@your-db-host:5432/media_pipeline
REDIS_HOST=your-redis-host
REDIS_PORT=6379
UPLOAD_DIR=/data/uploads    # or configure S3
WORKER_CONCURRENCY=5        # scale based on CPU
LOG_LEVEL=warn
```

---

## Running Tests

```bash
# All tests
npm test

# Unit tests only (no DB/Redis needed)
npx jest tests/unit --forceExit

# With coverage
npx jest --coverage --forceExit
```

---

## Troubleshooting

### "ECONNREFUSED 127.0.0.1:6379"
Redis is not running. Start it:
```bash
docker start media-redis
# or create it:
docker run -d --name media-redis -p 6379:6379 redis:7-alpine
```

### "Authentication failed for pipeline"
Local PostgreSQL is intercepting the connection. Either:
- Stop your local PostgreSQL, OR
- Use a different port: `-p 5433:5432` and update `DATABASE_URL` to use port 5433

### "EADDRINUSE: address already in use :::3000"
Another instance is already running on port 3000. Kill it:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F

# Mac/Linux
lsof -i :3000
kill -9 <PID>
```

### "Docker: error during connect"
Docker Desktop is not running. Open Docker Desktop and wait for it to start.

### "prisma migrate: connection refused"
PostgreSQL container isn't ready yet. Wait a few seconds and retry:
```bash
docker exec media-postgres pg_isready -U pipeline
npx prisma migrate dev --name init
```

### Containers stopped after laptop restart
Docker containers stop when Docker Desktop closes. Restart them:
```bash
docker start media-redis media-postgres
```
Or set them to auto-restart:
```bash
docker update --restart=always media-redis media-postgres
```
