# 2. Setup Guide

How to get MAOF running from scratch on a fresh machine.

## Prerequisites

| Requirement | Version | Check Command |
|------------|---------|---------------|
| Node.js | 20 or later | `node --version` |
| pnpm | 9 or later | `pnpm --version` |
| Docker | Any recent | `docker --version` |
| Git | Any | `git --version` |

## Step 1: Clone The Repository

```bash
git clone <your-repo-url> Multi-Agent-Orchestration
cd Multi-Agent-Orchestration
```

## Step 2: Install Dependencies

```bash
pnpm install
```

This installs dependencies for all packages in the monorepo: API, dashboard, MCP bridge, and shared types.

## Step 3: Start Infrastructure (PostgreSQL + Redis)

```bash
pnpm docker:up
```

This runs `docker compose up -d` which starts:
- **PostgreSQL 16** on port `5432` (database: `maof_dev`, user: `maof`, password: `maof_dev_password`)
- **Redis 7** on port `6379`

Verify they're running:
```bash
docker ps
```

You should see `maof-postgres` and `maof-redis` with status `healthy`.

## Step 4: Create The Environment File

Create `apps/api/.env`:

```env
# Server
MAOF_PORT=3000
MAOF_HOST=0.0.0.0
MAOF_NODE_ENV=development
MAOF_LOG_LEVEL=info

# PostgreSQL
MAOF_DB_HOST=localhost
MAOF_DB_PORT=5432
MAOF_DB_NAME=maof_dev
MAOF_DB_USER=maof
MAOF_DB_PASSWORD=maof_dev_password

# Redis
MAOF_REDIS_HOST=localhost
MAOF_REDIS_PORT=6379

# JWT (change this in production — minimum 32 characters)
MAOF_JWT_SECRET=maof-dev-secret-key-minimum-32-characters-long
MAOF_JWT_ACCESS_EXPIRES_IN=15m
MAOF_JWT_REFRESH_EXPIRES_IN=7d

# CORS (dashboard URL)
MAOF_CORS_ORIGINS=http://localhost:5173

# Agent dispatch mode: mock | builtin | real
MAOF_AGENT_DISPATCH_MODE=mock
```

### Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MAOF_PORT` | No | `3000` | API server port |
| `MAOF_HOST` | No | `0.0.0.0` | API server bind address |
| `MAOF_NODE_ENV` | No | `development` | `development`, `production`, or `test` |
| `MAOF_LOG_LEVEL` | No | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `MAOF_DB_HOST` | Yes | — | PostgreSQL host |
| `MAOF_DB_PORT` | No | `5432` | PostgreSQL port |
| `MAOF_DB_NAME` | Yes | — | Database name |
| `MAOF_DB_USER` | Yes | — | Database user |
| `MAOF_DB_PASSWORD` | Yes | — | Database password |
| `MAOF_REDIS_HOST` | No | `localhost` | Redis host |
| `MAOF_REDIS_PORT` | No | `6379` | Redis port |
| `MAOF_REDIS_PASSWORD` | No | — | Redis password (if set) |
| `MAOF_JWT_SECRET` | Yes | — | JWT signing key (min 32 chars) |
| `MAOF_JWT_ACCESS_EXPIRES_IN` | No | `15m` | Access token lifetime |
| `MAOF_JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token lifetime |
| `MAOF_CORS_ORIGINS` | No | `http://localhost:5173` | Allowed CORS origins |
| `MAOF_AGENT_DISPATCH_MODE` | No | `mock` | `mock`, `builtin`, or `real` |
| `MAOF_AGENT_TOKEN_KEY` | When mode=real | — | AES-256 key (64 hex chars) for encrypting agent auth tokens |
| `MAOF_AGENT_CALL_TIMEOUT_MS` | No | `30000` | Agent HTTP call timeout (ms) |
| `MAOF_HEALTH_CHECK_INTERVAL_MS` | No | `300000` | Agent health check interval (0 to disable) |
| `MAOF_OPENAI_API_KEY` | When mode=builtin | — | OpenAI API key |
| `MAOF_ANTHROPIC_API_KEY` | When mode=builtin | — | Anthropic API key |
| `MAOF_GOOGLE_AI_API_KEY` | When mode=builtin | — | Google AI API key |
| `MAOF_DEFAULT_AI_PROVIDER` | No | — | `openai`, `anthropic`, or `google` |

## Step 5: Run Database Migrations

```bash
pnpm db:migrate
```

This creates all 13 tables and seeds 5 built-in AI agents.

## Step 6: Start The Platform

### Start everything (API + Dashboard):
```bash
pnpm app
```

### Or start them separately:
```bash
# Terminal 1 — API server
pnpm dev

# Terminal 2 — Dashboard
pnpm dev:dashboard
```

### Verify:

| Service | URL | What You Should See |
|---------|-----|-------------------|
| **API Health** | http://localhost:3000/health | `{"success":true,"data":{"status":"ok",...}}` |
| **Dashboard** | http://localhost:5173 | Login page |

## Step 7: Create Your First Account

Open http://localhost:5173 in your browser.

1. Click **Register**
2. Fill in your name, email, and password
3. Click **Register**
4. Log in with your email and password

You're now on the dashboard.

---

## Exposing The API To The Internet

If your bot runs on a remote server (VPS), it can't reach `localhost:3000`. You need a tunnel.

### Using ngrok (free tier)

```bash
# Install ngrok (macOS)
brew install ngrok

# Authenticate (one-time — get your token from https://dashboard.ngrok.com)
ngrok config add-authtoken YOUR_TOKEN

# Start tunnel
ngrok http 3000
```

ngrok prints a public URL like:
```
https://abcd-1234.ngrok-free.app
```

Your API is now accessible at that URL from anywhere.

**Important:** ngrok free tier only allows 1 tunnel at a time. If you have another ngrok tunnel running, stop it first.

**Important:** When calling the API through ngrok, add this header to skip the browser warning page:
```
ngrok-skip-browser-warning: 1
```

### Using Cloudflare Tunnel (free, persistent)

If you need a stable URL that doesn't change:

```bash
# Install cloudflared
brew install cloudflared

# Quick tunnel (no account needed)
cloudflared tunnel --url http://localhost:3000
```

---

## Common Commands Reference

| Command | What It Does |
|---------|-------------|
| `pnpm app` | Start API + Dashboard together |
| `pnpm dev` | Start API only |
| `pnpm dev:dashboard` | Start Dashboard only |
| `pnpm dev:mcp` | Start MCP bridge in dev mode |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests (182 tests) |
| `pnpm db:generate` | Generate migration after schema changes |
| `pnpm db:migrate` | Apply database migrations |
| `pnpm docker:up` | Start PostgreSQL + Redis |
| `pnpm docker:down` | Stop PostgreSQL + Redis |
| `pnpm docker:logs` | View infrastructure logs |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Auto-format with Prettier |

---

## Troubleshooting

### Port 3000 already in use

```bash
# Find what's using it
lsof -i:3000

# Kill it
kill $(lsof -ti:3000)
```

### Database connection refused

Check that PostgreSQL is running:
```bash
docker ps | grep maof-postgres
```

If it's not there, start it:
```bash
pnpm docker:up
```

### Redis connection refused

Same as above but check `maof-redis`:
```bash
docker ps | grep maof-redis
```

### Migration fails

Make sure the database exists and credentials match your `.env`:
```bash
docker exec maof-postgres psql -U maof -d maof_dev -c "SELECT 1"
```

### Dashboard can't reach API

The dashboard proxies `/api/*` to `http://localhost:3000/*`. Make sure the API is running on port 3000. Check the Vite terminal output for proxy errors.

### ngrok "too many sessions" error

Free ngrok only allows 1 session. Stop other ngrok processes:
```bash
# Kill all ngrok processes
pkill ngrok

# Or stop ngrok Docker containers
docker stop $(docker ps -q --filter ancestor=ngrok/ngrok)
```
