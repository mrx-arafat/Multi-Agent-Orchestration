# MAOF MVP Skeleton Implementation Plan

Created: 2026-02-18
Status: COMPLETE
Approved: Yes
Iterations: 0
Worktree: Yes

> **Status Lifecycle:** PENDING → COMPLETE → VERIFIED
> **Iterations:** Tracks implement→verify cycles (incremented by verify phase)
>
> - PENDING: Initial state, awaiting implementation
> - COMPLETE: All tasks implemented
> - VERIFIED: All checks passed
>
> **Approval Gate:** Implementation CANNOT proceed until `Approved: Yes`
> **Worktree:** Set at plan creation (from dispatcher). `Yes` uses git worktree isolation; `No` works directly on current branch (default)

## Summary

**Goal:** Build the production-grade foundation for the Multi-Agent Orchestration Framework (MAOF) — a DevOps-grade platform for coordinating heterogeneous AI agents. This skeleton implements Phase 1 MVP: working API endpoints with real database operations, JWT authentication, BullMQ job queue, and a minimal monitoring dashboard.

**Architecture:** pnpm monorepo with three workspaces — `apps/api` (Fastify + TypeScript backend), `apps/dashboard` (React + Vite + TypeScript frontend), and `packages/shared` (shared types and validation schemas). The API follows a modular plugin architecture where each domain (agents, workflows, auth, audit) is a Fastify plugin with its own routes, services, and schemas. BullMQ handles async workflow execution. Drizzle ORM provides type-safe database access with explicit SQL control.

**Tech Stack:**
- **Runtime:** Node.js 24 + TypeScript 5.x (strict mode)
- **API Framework:** Fastify v5 with Pino logging
- **ORM:** Drizzle ORM (1:1 SQL mapping, 2x faster than Prisma)
- **Database:** PostgreSQL 16 (via Docker)
- **Cache/Queue:** Redis 7 + BullMQ (via Docker)
- **Auth:** JWT (access + refresh tokens) with bcrypt password hashing
- **Dashboard:** React 19 + Vite + TypeScript + Tailwind CSS
- **Testing:** Vitest + Supertest
- **Package Manager:** pnpm (workspaces)
- **Infrastructure:** Docker Compose for local dev

## Scope

### In Scope

- Monorepo project structure with pnpm workspaces
- Docker Compose setup (PostgreSQL 16, Redis 7)
- Fastify application with plugin architecture
- Environment-based configuration management
- Drizzle ORM schema for all SRS data models (agents, workflow_runs, stage_executions, execution_logs, users)
- Database migration system
- JWT authentication (user registration, login, token refresh, middleware)
- Agent registration CRUD endpoints (POST register, GET list, GET by ID, health status)
- Workflow execution endpoints (POST execute, GET status, GET result) with BullMQ queue
- Audit trail endpoint (GET execution logs)
- Health check endpoint with DB/Redis connectivity verification
- Graceful shutdown handling
- Structured JSON logging (Pino)
- Minimal React dashboard (agent registry view, workflow status view)
- Testing framework with first integration tests
- ESLint + Prettier configuration

### Out of Scope

- Agent health check polling (Phase 2 — periodic cron-based health checks)
- Retry logic & fallback agents (Phase 2)
- Load balancing & capacity-based routing (Phase 2)
- Cryptographic signing of audit logs (Phase 2)
- RBAC (Phase 2 — MVP has simple user ownership)
- Redis context caching / memory store API (Phase 2)
- Kubernetes deployment manifests (Phase 3)
- Distributed tracing / Prometheus metrics (Phase 3)
- gRPC, parallel execution, multi-tenancy (Phase 4)
- Real agent integration (skeleton uses mock/stub agent responses)
- Production SSL/TLS configuration
- CI/CD pipeline

## Prerequisites

- Node.js 24+ installed
- pnpm installed (`npm install -g pnpm`)
- Docker + Docker Compose installed
- No other services running on ports 3000 (API), 5173 (dashboard), 5432 (PostgreSQL), 6379 (Redis)

## Context for Implementer

> This is a greenfield project. The only existing file is the SRS document at `Multi-Agent-Orchestration-SRS.md`.

- **Patterns to follow:** Fastify plugin architecture — each domain module registers as a Fastify plugin with `fastify.register()`. Routes, services, and schemas co-located per module.
- **Conventions:**
  - File naming: kebab-case (`agent-routes.ts`, `workflow-service.ts`)
  - Directory structure: `modules/<domain>/{routes,service,schema}.ts`
  - All API responses follow consistent envelope: `{ success: boolean, data?: T, error?: { code: string, message: string } }`
  - Environment variables prefixed: `MAOF_` (e.g., `MAOF_DB_HOST`, `MAOF_JWT_SECRET`)
  - All IDs use UUID v4 format with domain prefix (e.g., `agent-uuid-xxx`, `wr-xxx`)
- **Key files:**
  - `Multi-Agent-Orchestration-SRS.md` — Full requirements specification (829 lines). Sections 5-6 define API specs and data models.
- **Gotchas:**
  - SRS uses `ENUM` types in SQL — Drizzle uses `pgEnum()` for PostgreSQL enums
  - SRS references `TEXT[]` for capabilities — Drizzle supports PostgreSQL arrays
  - The SRS `auth_token_hash` field stores a bcrypt hash, never plaintext
  - Workflow `status` transitions must be enforced: queued → in_progress → completed|failed
- **Domain context:** MAOF orchestrates AI agents (Claude, Gemini, custom LLMs) through multi-step workflows. Each workflow has stages; each stage routes to an agent with matching capabilities. The execution context accumulates outputs from each stage and passes them forward.

## Runtime Environment

- **Start command:** `pnpm --filter api dev` (API), `pnpm --filter dashboard dev` (Dashboard)
- **API Port:** 3000
- **Dashboard Port:** 5173
- **Infrastructure:** `docker compose up -d` (PostgreSQL on 5432, Redis on 6379)
- **Health check:** `curl http://localhost:3000/health`
- **Restart procedure:** Ctrl+C and re-run start command. Infrastructure containers persist data in Docker volumes.

## Progress Tracking

**MANDATORY: Update this checklist as tasks complete. Change `[ ]` to `[x]`.**

- [x] Task 1: Monorepo & infrastructure setup
- [x] Task 2: Core API application (Fastify)
- [x] Task 3: Testing framework setup
- [x] Task 4: Database layer (Drizzle ORM)
- [x] Task 5: JWT authentication module
- [x] Task 6: Agent registration & discovery module
- [x] Task 7: Workflow execution engine
- [x] Task 8: Audit trail module
- [x] Task 9: Dashboard skeleton (React + Vite)

**Total Tasks:** 9 | **Completed:** 9 | **Remaining:** 0

## Implementation Tasks

### Task 1: Monorepo & Infrastructure Setup

**Objective:** Initialize the pnpm monorepo workspace with three packages (api, dashboard, shared), configure TypeScript, ESLint, Prettier, and set up Docker Compose for PostgreSQL and Redis.

**Dependencies:** None

**Files:**

- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json` (shared TypeScript config)
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.env` (local dev, gitignored)
- Create: `.eslintrc.cjs`
- Create: `.prettierrc`
- Create: `docker-compose.yml`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/dashboard/package.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts` (barrel export)
- Create: `packages/shared/src/types/api.ts` (API response envelope, error codes)
- Create: `packages/shared/src/types/agent.ts` (Agent, AgentStatus types)
- Create: `packages/shared/src/types/workflow.ts` (WorkflowRun, StageExecution, WorkflowDefinition types)
- Create: `packages/shared/src/types/auth.ts` (User, TokenPair, LoginRequest types)

**Key Decisions / Notes:**

- **Git init first:** Project is not a git repo. Initialize git, create `main` branch, then create feature branch `feat/maof-mvp-skeleton` for worktree isolation.
- pnpm workspaces with `apps/*` and `packages/*` globs
- TypeScript strict mode enabled globally via `tsconfig.base.json`
- Docker Compose services: `postgres` (port 5432, volume for persistence), `redis` (port 6379)
- PostgreSQL 16 with initial database `maof_dev` created on startup
- Redis 7 with no password for local dev
- Environment variables: `MAOF_DB_HOST`, `MAOF_DB_PORT`, `MAOF_DB_NAME`, `MAOF_DB_USER`, `MAOF_DB_PASSWORD`, `MAOF_REDIS_HOST`, `MAOF_REDIS_PORT`, `MAOF_JWT_SECRET`, `MAOF_JWT_EXPIRES_IN`, `MAOF_PORT`
- `.env.example` has all vars with placeholder values; `.env` has working local defaults
- Root `package.json` scripts: `dev`, `build`, `test`, `lint`, `format`, `db:migrate`, `db:generate`, `docker:up`, `docker:down`
- `packages/shared` contains TypeScript interfaces and type definitions shared between API and dashboard. No runtime code — pure types that both workspaces import.

**Definition of Done:**

- [ ] Git repository initialized with `main` branch and initial commit
- [ ] `pnpm install` completes without errors
- [ ] `docker compose up -d` starts PostgreSQL and Redis containers
- [ ] `docker compose ps` shows both services healthy
- [ ] TypeScript compilation succeeds for all workspaces
- [ ] ESLint runs without configuration errors
- [ ] Shared types importable from both API and dashboard workspaces

**Verify:**

- `cd /Users/easinarafat/Devs/Multi-Agent-Orchestration && git log --oneline -1` — initial commit exists
- `pnpm install` — dependencies installed
- `docker compose up -d && docker compose ps` — postgres and redis running
- `pnpm -r exec tsc --noEmit` — TypeScript compiles in all workspaces

---

### Task 2: Core API Application (Fastify)

**Objective:** Create the Fastify application factory with plugin architecture, environment-based configuration, structured Pino logging, global error handler, CORS, health endpoint (with DB/Redis connectivity check), and graceful shutdown.

**Dependencies:** Task 1

**Files:**

- Create: `apps/api/src/app.ts` (Fastify app factory)
- Create: `apps/api/src/server.ts` (entry point — starts server, handles signals)
- Create: `apps/api/src/config/index.ts` (environment config loader with validation)
- Create: `apps/api/src/config/env.ts` (Zod schema for environment variables)
- Create: `apps/api/src/plugins/error-handler.ts` (global error handler plugin)
- Create: `apps/api/src/plugins/cors.ts` (CORS configuration plugin)
- Create: `apps/api/src/routes/health.ts` (health check route)
- Create: `apps/api/src/lib/logger.ts` (Pino logger configuration)
- Create: `apps/api/src/types/index.ts` (shared API types — response envelope, errors)

**Key Decisions / Notes:**

- App factory pattern: `buildApp()` function returns configured Fastify instance. This enables testing (create fresh instances per test).
- Config validation: Use Zod to validate environment variables at startup — fail fast if config is invalid.
- Health endpoint returns: `{ status: "ok", timestamp, services: { database: "connected"|"disconnected", redis: "connected"|"disconnected" } }`
- Error handler maps known errors (validation, not found, unauthorized) to proper HTTP status codes with consistent envelope.
- Graceful shutdown: Listen for SIGINT/SIGTERM, close Fastify (drains connections), then close DB/Redis pools.
- Pino log level from env: `MAOF_LOG_LEVEL` (default: `info` in prod, `debug` in dev).
- CORS allows `http://localhost:5173` (dashboard) in development.

**Definition of Done:**

- [ ] `pnpm --filter api dev` starts the server on port 3000
- [ ] `GET /health` returns 200 with database and redis status
- [ ] Invalid environment variables cause startup failure with clear error message
- [ ] Unhandled route returns 404 with JSON error envelope
- [ ] Server shuts down gracefully on SIGINT (no "port already in use" on restart)

**Verify:**

- `pnpm --filter api dev &` then `curl http://localhost:3000/health` — returns JSON with services status
- `curl http://localhost:3000/nonexistent` — returns `{ "success": false, "error": { "code": "NOT_FOUND" } }`

---

### Task 3: Testing Framework Setup

**Objective:** Configure Vitest for the API workspace with test utilities, Docker-based test database setup, and a first integration test for the health endpoint.

**Dependencies:** Task 2

**Files:**

- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/tests/setup.ts` (global test setup — env vars, Docker check)
- Create: `apps/api/tests/helpers/app.ts` (test app factory — creates/destroys Fastify instances)
- Create: `apps/api/tests/helpers/db.ts` (test database setup/teardown)
- Create: `apps/api/tests/integration/health.test.ts` (health endpoint tests)

**Key Decisions / Notes:**

- Vitest with `@vitest/coverage-v8` for coverage reporting
- Test environment uses same Docker PostgreSQL/Redis but separate database `maof_test`
- Test helper: `createTestApp()` builds a full Fastify instance with all plugins; `destroyTestApp(app)` closes it cleanly
- Use `inject()` method (Fastify's built-in light HTTP injection) instead of Supertest for cleaner tests
- Global setup creates test database; global teardown drops it
- Coverage threshold: 80% (as per user's testing rules)

**Definition of Done:**

- [ ] `pnpm --filter api test` runs and passes
- [ ] Health endpoint test verifies 200 response with correct shape
- [ ] Test creates and destroys Fastify instance without port conflicts
- [ ] Coverage report generates after test run

**Verify:**

- `pnpm --filter api test` — all tests pass
- `pnpm --filter api test -- --coverage` — coverage report shows > 0% (baseline)

---

### Task 4: Database Layer (Drizzle ORM)

**Objective:** Set up Drizzle ORM with PostgreSQL, define all data model schemas from SRS Section 6 (agents, users, workflow_runs, stage_executions, execution_logs), configure migrations, and create the initial migration.

**Dependencies:** Task 1, Task 2

**Files:**

- Create: `apps/api/drizzle.config.ts` (Drizzle Kit configuration)
- Create: `apps/api/src/db/index.ts` (database connection pool + Drizzle instance)
- Create: `apps/api/src/db/schema/index.ts` (re-exports all schemas)
- Create: `apps/api/src/db/schema/users.ts` (users table — for JWT auth)
- Create: `apps/api/src/db/schema/agents.ts` (agents table — from SRS 6.1)
- Create: `apps/api/src/db/schema/workflow-runs.ts` (workflow_runs table — from SRS 6.2)
- Create: `apps/api/src/db/schema/stage-executions.ts` (stage_executions table — from SRS 6.2)
- Create: `apps/api/src/db/schema/execution-logs.ts` (execution_logs table — from SRS 6.2)
- Create: `apps/api/src/db/migrate.ts` (migration runner)
- Create: `apps/api/src/plugins/database.ts` (Fastify plugin to register DB on app instance)

**Key Decisions / Notes:**

- **Users table** (not in SRS, needed for JWT auth):
  ```
  id (serial PK), user_uuid (UUID unique), email (unique), password_hash, name, role (enum: admin|user),
  created_at, updated_at, deleted_at (soft delete)
  ```
- **Agents table** (from SRS 6.1): Use `pgEnum` for status (`online`, `degraded`, `offline`). `capabilities` as `text[]` array. `auth_token_hash` stored via bcrypt.
- **workflow_runs table** (from SRS 6.2): Status enum (`queued`, `in_progress`, `completed`, `failed`). `workflow_definition` and `input` as `jsonb`. Foreign key to users.
- **stage_executions table** (from SRS 6.2): Status enum matching workflow. `input`/`output` as `jsonb`. FK to workflow_runs.
- **execution_logs table** (from SRS 6.2): `signature` as `jsonb`. Append-only (no update/delete operations exposed).
- Drizzle Kit generates SQL migration files in `apps/api/drizzle/` directory.
- Database plugin decorates Fastify instance with `app.db` (Drizzle instance) and `app.pool` (pg Pool).
- Connection pool: min 2, max 20 connections (configurable via env).

**Definition of Done:**

- [ ] `pnpm --filter api db:generate` creates migration SQL files
- [ ] `pnpm --filter api db:migrate` applies migrations to PostgreSQL
- [ ] All 5 tables exist in database with correct columns and types
- [ ] Drizzle instance connects and can perform basic SELECT
- [ ] Database plugin properly decorates Fastify instance

**Verify:**

- `pnpm --filter api db:generate && pnpm --filter api db:migrate` — migrations apply
- `docker compose exec postgres psql -U maof -d maof_dev -c "\dt"` — lists all 5 tables

---

### Task 5: JWT Authentication Module

**Objective:** Implement user registration, login, token refresh endpoints, JWT token generation/validation, and an authentication middleware plugin. Passwords hashed with bcrypt.

**Dependencies:** Task 3, Task 4

**Files:**

- Create: `apps/api/src/modules/auth/routes.ts` (POST /auth/register, POST /auth/login, POST /auth/refresh)
- Create: `apps/api/src/modules/auth/service.ts` (AuthService — user CRUD, password hashing, token generation)
- Create: `apps/api/src/modules/auth/schemas.ts` (Zod request/response schemas + Fastify type providers)
- Create: `apps/api/src/plugins/authenticate.ts` (Fastify plugin — JWT verification decorator)
- Create: `apps/api/tests/integration/auth.test.ts`

**Key Decisions / Notes:**

- Use `@fastify/jwt` for JWT integration (signs and verifies tokens on the Fastify instance).
- Access token TTL: 15 minutes. Refresh token TTL: 7 days. Both configurable via env.
- Registration: email + password + name → returns user object (no tokens — must login after registration).
- Login: email + password → returns `{ accessToken, refreshToken, user }`.
- Refresh: refreshToken → returns new `{ accessToken, refreshToken }`.
- Auth middleware (`app.authenticate`) is a Fastify `preHandler` hook that verifies JWT and decorates `request.user` with `{ userId, email, role }`.
- Password hashing: bcrypt with 12 salt rounds.
- Registration validates: email format, password min 8 chars, name required.
- Duplicate email returns 409 Conflict.
- Wrong credentials return 401 Unauthorized (generic message — don't reveal which field is wrong).

**Definition of Done:**

- [ ] POST /auth/register creates user in DB with hashed password
- [ ] POST /auth/login returns valid JWT tokens for correct credentials
- [ ] POST /auth/login returns 401 for wrong password
- [ ] POST /auth/refresh returns new token pair for valid refresh token
- [ ] Protected routes return 401 when no/invalid token provided
- [ ] All auth tests pass

**Verify:**

- `pnpm --filter api test -- tests/integration/auth.test.ts` — auth tests pass
- Manual: `curl -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"password123","name":"Test"}'` — returns 201

---

### Task 6: Agent Registration & Discovery Module

**Objective:** Implement agent registration, listing, retrieval, and capability search endpoints per SRS Section 5.1. All endpoints require JWT authentication.

**Dependencies:** Task 4, Task 5

**Files:**

- Create: `apps/api/src/modules/agents/routes.ts` (POST /agents/register, GET /agents, GET /agents/:agentUuid, DELETE /agents/:agentUuid)
- Create: `apps/api/src/modules/agents/service.ts` (AgentService — CRUD operations, capability matching)
- Create: `apps/api/src/modules/agents/schemas.ts` (Zod schemas for requests/responses)
- Create: `apps/api/tests/integration/agents.test.ts`

**Key Decisions / Notes:**

- POST `/agents/register`: Creates agent entry. Generates `agent_uuid` (UUID v4). Hashes the `auth_token` before storage. Returns registry entry with UUID and registration timestamp. Requires JWT auth.
- GET `/agents`: Lists all non-deleted agents. Supports query params: `?capability=code-audit` (filter by capability tag), `?status=online` (filter by health status). Paginated: `?page=1&limit=20`.
- GET `/agents/:agentUuid`: Returns full agent details including capabilities array and status.
- DELETE `/agents/:agentUuid`: Soft-delete (sets `deleted_at`). Only the user who registered the agent can delete it (ownership check).
- Capability search uses PostgreSQL array `@>` (contains) operator for efficient matching.
- Agent `auth_token` is NEVER returned in any response — only stored as hash.
- All endpoints protected by `app.authenticate` preHandler.

**Definition of Done:**

- [ ] POST /agents/register creates agent with hashed auth_token
- [ ] GET /agents returns paginated list with capability filtering
- [ ] GET /agents/:agentUuid returns agent details (without auth_token)
- [ ] DELETE /agents/:agentUuid soft-deletes (only by owner)
- [ ] Unauthenticated requests return 401
- [ ] All agent tests pass

**Verify:**

- `pnpm --filter api test -- tests/integration/agents.test.ts` — agent tests pass
- Manual: register an agent via curl, then list and verify it appears

---

### Task 7: Workflow Execution Engine

**Objective:** Implement workflow submission, status tracking, and result retrieval endpoints. Workflow execution is queued via BullMQ and processed asynchronously by a worker. For MVP, the worker simulates stage execution (no real agent calls).

**Dependencies:** Task 4, Task 5, Task 6

**Files:**

- Create: `apps/api/src/modules/workflows/routes.ts` (POST /workflows/execute, GET /workflows/:runId, GET /workflows/:runId/result)
- Create: `apps/api/src/modules/workflows/service.ts` (WorkflowService — create run, update status, get results)
- Create: `apps/api/src/modules/workflows/schemas.ts` (Zod schemas — workflow definition, stage definition)
- Create: `apps/api/src/modules/workflows/validator.ts` (workflow definition validator — checks stage dependencies, capability references)
- Create: `apps/api/src/queue/workflow-queue.ts` (BullMQ queue definition)
- Create: `apps/api/src/queue/workflow-worker.ts` (BullMQ worker — processes workflow stages sequentially)
- Create: `apps/api/src/plugins/queue.ts` (Fastify plugin to register BullMQ queue)
- Create: `apps/api/tests/integration/workflows.test.ts`

**Key Decisions / Notes:**

- POST `/workflows/execute`: Accepts workflow definition (JSON matching SRS 2.1 format) + initial input. Validates workflow structure (stages, dependencies, required fields). Creates `workflow_run` record with status `queued`. Enqueues BullMQ job. Returns `workflow_run_id` + status.
- GET `/workflows/:runId`: Returns current status with per-stage progress (total, completed, current). Only accessible by workflow owner.
- GET `/workflows/:runId/result`: Returns final output from last stage. Returns 404 if not completed yet.
- **BullMQ Worker (MVP):** Processes stages sequentially. For each stage: creates `stage_execution` record → simulates agent work (2-second delay + mock output) → updates stage status → passes output to next stage's input. Updates workflow status as stages complete.
- Workflow definition validation: checks all `dependencies` reference valid stage IDs, no circular dependencies, `agent_capability` is a non-empty string.
- Variable interpolation: `${stage_id.output.field}` resolved at execution time using completed stage outputs.
- Queue connection uses the same Redis instance from Docker Compose.
- Worker runs in-process with the API for MVP (separate worker process in Phase 3).

**Definition of Done:**

- [ ] POST /workflows/execute validates definition and enqueues job
- [ ] GET /workflows/:runId returns current execution progress
- [ ] GET /workflows/:runId/result returns final output after completion
- [ ] BullMQ worker processes stages sequentially with mock agent responses
- [ ] Variable interpolation resolves `${stage.output.field}` syntax
- [ ] Invalid workflow definitions rejected with descriptive errors
- [ ] All workflow tests pass

**Verify:**

- `pnpm --filter api test -- tests/integration/workflows.test.ts` — workflow tests pass
- Manual: submit a 2-stage workflow via curl, poll status until completed, retrieve result

---

### Task 8: Audit Trail Module

**Objective:** Implement execution logging middleware that records every stage execution, and an audit trail retrieval endpoint per SRS Section 5.6.

**Dependencies:** Task 4, Task 5, Task 7

**Files:**

- Create: `apps/api/src/modules/audit/routes.ts` (GET /workflows/:runId/audit)
- Create: `apps/api/src/modules/audit/service.ts` (AuditService — log stage execution, retrieve audit trail)
- Create: `apps/api/src/modules/audit/schemas.ts` (Zod schemas for audit log entries)
- Create: `apps/api/tests/integration/audit.test.ts`

**Key Decisions / Notes:**

- Audit logging is called by the workflow worker after each stage execution (not HTTP middleware — it's internal).
- Each log entry contains: `workflow_run_id`, `stage_id`, `agent_id`, `action` (execute/retry/fail), `input_hash` (SHA-256), `output_hash` (SHA-256), `status`, `logged_at`.
- GET `/workflows/:runId/audit`: Returns chronological list of all execution log entries for a workflow run. Protected by JWT auth. Only accessible by workflow owner.
- Input/output hashes are SHA-256 of the JSON-stringified payloads (deterministic — keys sorted).
- Append-only: no UPDATE or DELETE operations on execution_logs table.
- Cryptographic signing (FR-5.2) is deferred to Phase 2 — signature field will be null for MVP.

**Definition of Done:**

- [ ] Stage executions create audit log entries automatically
- [ ] GET /workflows/:runId/audit returns chronological execution trace
- [ ] Log entries contain SHA-256 hashes of input/output payloads
- [ ] Audit logs are append-only (no modification endpoints exposed)
- [ ] All audit tests pass

**Verify:**

- `pnpm --filter api test -- tests/integration/audit.test.ts` — audit tests pass
- Manual: execute a workflow, then GET /workflows/:runId/audit — returns log entries

---

### Task 9: Dashboard Skeleton (React + Vite)

**Objective:** Create a minimal React dashboard with Tailwind CSS showing the agent registry and workflow execution status. Connects to the API via fetch. Includes login page.

**Dependencies:** Task 2, Task 5, Task 6, Task 7

**Files:**

- Create: `apps/dashboard/index.html`
- Create: `apps/dashboard/vite.config.ts`
- Create: `apps/dashboard/tsconfig.json`
- Create: `apps/dashboard/tailwind.config.ts`
- Create: `apps/dashboard/postcss.config.js`
- Create: `apps/dashboard/src/main.tsx`
- Create: `apps/dashboard/src/App.tsx` (router setup)
- Create: `apps/dashboard/src/lib/api.ts` (API client — fetch wrapper with JWT handling)
- Create: `apps/dashboard/src/lib/auth-context.tsx` (React context for auth state)
- Create: `apps/dashboard/src/pages/LoginPage.tsx` (email + password login form)
- Create: `apps/dashboard/src/pages/DashboardPage.tsx` (overview — agent count, workflow count)
- Create: `apps/dashboard/src/pages/AgentsPage.tsx` (agent registry table — name, capabilities, status)
- Create: `apps/dashboard/src/pages/WorkflowsPage.tsx` (workflow runs table — status, progress, timestamps)
- Create: `apps/dashboard/src/components/Layout.tsx` (sidebar nav + header)
- Create: `apps/dashboard/src/components/ProtectedRoute.tsx` (redirects to login if not authenticated)

**Key Decisions / Notes:**

- React Router v7 for client-side routing
- API client stores JWT in memory (not localStorage — more secure). Refresh token in httpOnly cookie would be Phase 2.
- Tailwind CSS for rapid styling — no component library dependency.
- Dashboard page shows: total agents (online/offline), total workflows (completed/failed/running), recent activity.
- Agents page: table with name, capabilities (tags), status (colored badge), endpoint, registered date. No edit/delete in MVP.
- Workflows page: table with run ID, name, status (colored badge), progress (X/Y stages), created, completed. Click to view details (stage-by-stage breakdown).
- Login page: simple centered form. Registration link (also a simple form).
- API proxy: Vite dev server proxies `/api/*` to `http://localhost:3000` to avoid CORS issues in development.

**Definition of Done:**

- [ ] `pnpm --filter dashboard dev` starts Vite dev server on port 5173
- [ ] Login page authenticates against API and stores JWT
- [ ] Dashboard page shows agent and workflow counts
- [ ] Agents page lists registered agents with status badges
- [ ] Workflows page lists workflow runs with progress indicators
- [ ] Unauthenticated users redirected to login
- [ ] API requests include JWT Authorization header

**Verify:**

- `pnpm --filter dashboard dev` — starts without errors
- `pnpm --filter dashboard build` — production build succeeds with no TypeScript errors
- Open `http://localhost:5173` — login page renders, can log in and see dashboard

---

## Testing Strategy

- **Unit tests:** Config validation, workflow definition validator, password hashing, variable interpolation, SHA-256 hashing
- **Integration tests:** Each module has integration tests using Fastify's `inject()` method against a real test database. Tests create/read/update data end-to-end.
- **Manual verification:** After all tasks complete, run a full workflow: register user → login → register agent → submit workflow → poll until complete → check audit trail → view in dashboard
- **Coverage target:** 80% minimum across API workspace

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Docker not running when tests execute | Medium | Tests fail | Test setup script checks Docker health, prints clear error message if services are down |
| BullMQ worker blocks API event loop | Low | API latency spikes | Worker uses BullMQ's sandboxed processor option; for MVP, mock execution is fast (2s delay) |
| Database connection pool exhaustion during tests | Medium | Tests hang/fail | Each test file gets its own app instance with small pool (max 5); teardown closes pool |
| JWT secret not set in production | High | Security vulnerability | Zod env validation requires `MAOF_JWT_SECRET` with minimum 32-char length; startup fails if missing |
| Dashboard API calls fail silently | Medium | Confusing user experience | API client wrapper catches errors and displays toast notifications with error messages |
| Large workflow definitions cause memory issues | Low | Worker crashes | Workflow definition max size validated (100 stages, 10MB payload limit per SRS 7.3) |

## Open Questions

- None — all decisions resolved for Phase 1 MVP scope.

### Deferred Ideas

- WebSocket/SSE for real-time workflow status updates on dashboard (Phase 2)
- Agent health check dashboard widget with sparkline charts (Phase 2)
- Dark mode for dashboard (Phase 2)
- OpenAPI/Swagger documentation auto-generation from Zod schemas (Phase 2)
- Rate limiting middleware (Phase 3)
- Multi-tenant workspace support (Phase 4)
