# MAOF — Multi-Agent Orchestration Framework

A production-grade platform for coordinating multiple AI agents through automated workflows, team-based collaboration, and real-time task management. Think of it as a "mission control" for AI — you define teams of agents, assign tasks via Kanban boards, route multi-step workflows, and monitor everything through a polished dashboard.

## What Does This Actually Do?

Imagine you want to:
1. Create a **team** of specialized AI agents (summarizer, translator, reviewer)
2. Assign **tasks** to them via a drag-and-drop Kanban board
3. Have them **communicate** with each other through a built-in messaging system
4. Run **automated workflows** that chain agent capabilities in sequence
5. **Audit** every action with cryptographically signed logs

MAOF handles all of this. You register agents, organize them into teams, and let them collaborate — while you monitor everything from a real-time dashboard.

**Current Status:** Phase 1 + Phase 2 complete. Teams, Kanban boards, inter-agent messaging, team invitations, drag-and-drop UI, and a polished dashboard are all live. 182 tests passing.

---

## Features at a Glance

### Phase 1 (Complete)
- User authentication (JWT with refresh tokens)
- Agent registration with capabilities
- Multi-stage workflow engine (async via BullMQ)
- Per-stage execution tracking with progress
- Immutable audit trail with SHA-256 hashing
- Cryptographic signing for audit log verification
- Shared memory store (Redis) for inter-stage data
- Health check endpoint (DB + Redis status)
- Dashboard with login, agent list, workflow monitoring

### Phase 2 (Complete)
- **Team-based multi-agent orchestration** — create teams, add agents, manage members
- **Kanban task board** — 5-column board (backlog, todo, in_progress, review, done) with drag-and-drop
- **Inter-agent messaging** — direct, broadcast, and system messages within teams
- **Team invitations** — generate shareable invite codes with max uses and expiry
- **Agent types** — `generic` (HTTP endpoint) and `openclaw` (webhook-based) agent support
- **Auto-team creation** — agents can create their own team on registration
- **API tokens** — machine-to-machine authentication with scopes and expiry
- **Agent health monitoring** — manual health checks with latency tracking
- **Agent activity history** — execution log per agent (filterable by status/date)
- **Polished dashboard** — split-screen auth, team management, Kanban UI, chat interface, settings
- **Auth persistence** — sessions survive page reloads via localStorage tokens
- **Toast notifications** — system-wide feedback for all user actions

---

## Architecture Overview

```
                          +-------------------+
                          |    Dashboard      |  React 19 + Vite + Tailwind CSS
                          |  (10 pages)       |  Login, Teams, Kanban, Chat, Settings
                          |  localhost:5173    |
                          +--------+----------+
                                   |
                              HTTP requests (JWT auth)
                                   |
                          +--------v----------+
                          |    API Server     |  Fastify 5 + TypeScript
                          |    (41 endpoints) |  Auth, Agents, Teams, Kanban, Messaging
                          |  localhost:3000    |
                          +---+----------+----+
                              |          |
                    +---------+          +----------+
                    |                               |
           +--------v--------+            +---------v--------+
           |   PostgreSQL    |            |     Redis        |
           |   (11 tables)   |            |   (BullMQ Queue  |
           |   port 5432     |            |   + Memory Store)|
           +-----------------+            |   port 6379      |
           Users, agents, teams,          +------------------+
           workflows, kanban,             Async workflow execution,
           messages, invitations          shared memory, caching
```

### Monorepo Structure

| Part | What It Does | Where It Lives |
|------|-------------|----------------|
| **API** (`apps/api/`) | Backend server — all logic, auth, database, job processing | `http://localhost:3000` |
| **Dashboard** (`apps/dashboard/`) | Web interface — teams, kanban, chat, agent management | `http://localhost:5173` |
| **Shared Types** (`packages/shared/`) | TypeScript types shared between API and Dashboard | (build-time only) |

---

## Prerequisites

You need these installed:

### 1. Node.js (version 20 or higher)
```bash
node --version   # Should show v20.x.x or higher
```
If not installed: Download from [nodejs.org](https://nodejs.org/) (LTS version).

### 2. pnpm (package manager)
```bash
pnpm --version   # Should show 9.x.x or higher
```
If not installed: `npm install -g pnpm`

### 3. Docker and Docker Compose
```bash
docker --version
docker compose version
```
If not installed: Download [Docker Desktop](https://www.docker.com/products/docker-desktop/).

---

## Getting Started

### Step 1: Clone and configure
```bash
git clone https://github.com/mrx-arafat/Multi-Agent-Orchestration.git
cd Multi-Agent-Orchestration
cp .env.example .env
```
The defaults work for local development — no changes needed.

> **Important:** For production, change `MAOF_JWT_SECRET` to a random string of at least 32 characters.

### Step 2: Start infrastructure
```bash
docker compose up -d
```
Starts PostgreSQL (port 5432) and Redis (port 6379). Verify:
```bash
docker compose ps
# Both maof-postgres and maof-redis should show "running" or "healthy"
```

### Step 3: Install dependencies and migrate
```bash
pnpm install
pnpm db:migrate
```

### Step 4: Start the servers
```bash
# Terminal 1 — API server
pnpm dev

# Terminal 2 — Dashboard
pnpm --filter dashboard dev
```

### Step 5: Open the Dashboard
Go to **http://localhost:5173** — create an account, then log in.

---

## Using the Dashboard

### Pages

| Page | What It Does |
|------|-------------|
| **Dashboard** | Overview stats (agents, workflows, teams), quick links to your teams |
| **Agents** | Register new agents (generic or OpenClaw), view status, trigger health checks |
| **Workflows** | Monitor all workflow runs with status filtering |
| **Teams** | Create teams, join via invite code, view team cards |
| **Team Detail** | Manage team agents, generate invite codes, view settings |
| **Kanban Board** | Drag-and-drop task board with 5 columns and priority colors |
| **Team Chat** | Inter-agent messaging with broadcast/direct modes |
| **Settings** | Profile info and API endpoint reference |

### Key Workflows

**Creating a Team:**
1. Go to **Teams** > click **+ New Team**
2. Fill in name, description, max agents
3. Your team appears as a card — click to manage

**Inviting Users:**
1. Open a team > go to **Invitations** tab
2. Click **Generate Invite Code** (set max uses and expiry)
3. Share the 8-character code with your teammate
4. They click **Join Team** on the Teams page and enter the code

**Using the Kanban Board:**
1. Open a team > click **Kanban** in the sidebar
2. Create tasks with title, priority, and tags
3. Drag cards between columns (backlog → todo → in_progress → review → done)
4. Assign agents to tasks via the claim feature

**Agent Messaging:**
1. Open a team > click **Chat** in the sidebar
2. Select an agent as the sender
3. Choose broadcast (all agents) or direct (specific agent)
4. Messages appear in real-time with auto-refresh

---

## Using the API Directly

### Authentication
```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword","name":"Your Name"}'

# Login (returns accessToken + refreshToken)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}'
```

### Register an Agent
```bash
curl -X POST http://localhost:3000/agents/register \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-summarizer",
    "name": "Text Summarizer",
    "endpoint": "http://localhost:9001/agent",
    "authToken": "agent-secret-key",
    "capabilities": ["summarization", "text-generation"],
    "agentType": "generic",
    "createTeam": true,
    "teamName": "My Agent Team"
  }'
```

### Create a Team and Invite Members
```bash
# Create team
curl -X POST http://localhost:3000/teams \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Team","description":"AI agents working together","maxAgents":10}'

# Generate invite code
curl -X POST http://localhost:3000/teams/TEAM_UUID/invitations \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxUses":5,"expiresInHours":48}'

# Join with invite code (as another user)
curl -X POST http://localhost:3000/teams/join \
  -H "Authorization: Bearer OTHER_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inviteCode":"a1b2c3d4"}'
```

### Submit a Workflow
```bash
curl -X POST http://localhost:3000/workflows/execute \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "name": "my-pipeline",
      "stages": [
        {"id":"step-1","name":"Extract","agentCapability":"text-generation"},
        {"id":"step-2","name":"Summarize","agentCapability":"summarization","dependencies":["step-1"]}
      ]
    },
    "input": {"text":"Your input text here..."}
  }'
```

### Kanban Task Management
```bash
# Create task
curl -X POST http://localhost:3000/teams/TEAM_UUID/kanban/tasks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Review PR #42","priority":"high","tags":["code-review"]}'

# Move task status
curl -X PATCH http://localhost:3000/teams/TEAM_UUID/kanban/tasks/TASK_UUID/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}'
```

---

## All API Endpoints (41 total)

### Health & Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | No | System health (DB + Redis status) |
| `POST` | `/auth/register` | No | Create user account |
| `POST` | `/auth/login` | No | Get JWT token pair |
| `POST` | `/auth/refresh` | No | Rotate tokens |
| `GET` | `/auth/me` | Yes | Current user info |
| `POST` | `/auth/api-tokens` | Yes | Create API token (M2M) |
| `GET` | `/auth/api-tokens` | Yes | List API tokens |
| `DELETE` | `/auth/api-tokens/:tokenId` | Yes | Revoke API token |

### Agents
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/agents/register` | Yes | Register agent (with optional auto-team creation) |
| `GET` | `/agents` | Yes | List agents (`?capability=x&status=y`) |
| `GET` | `/agents/:uuid` | Yes | Agent details |
| `DELETE` | `/agents/:uuid` | Yes | Remove agent (owner only) |
| `POST` | `/agents/:uuid/health-check` | Yes | Trigger health check |
| `GET` | `/agents/:uuid/activity` | Yes | Agent execution history |

### Workflows
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/workflows/execute` | Yes | Submit workflow (async, returns 202) |
| `GET` | `/workflows` | Yes | List workflow runs |
| `GET` | `/workflows/:runId` | Yes | Workflow status + per-stage progress |
| `GET` | `/workflows/:runId/result` | Yes | Final output (404 if incomplete) |
| `GET` | `/workflows/:runId/audit` | Yes | Chronological execution trace |
| `GET` | `/workflows/:runId/audit/verify` | Yes | Verify cryptographic signatures |

### Memory Store
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/memory/:workflowRunId` | Yes | Write key-value (with optional TTL) |
| `GET` | `/memory/:workflowRunId/:key` | Yes | Read value |
| `DELETE` | `/memory/:workflowRunId/:key` | Yes | Delete key |
| `GET` | `/memory/:workflowRunId` | Yes | List all keys |

### Teams
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/teams` | Yes | Create team |
| `GET` | `/teams` | Yes | List user's teams |
| `GET` | `/teams/:teamUuid` | Yes | Team details |
| `POST` | `/teams/:teamUuid/agents` | Yes | Add agent to team |
| `DELETE` | `/teams/:teamUuid/agents/:agentUuid` | Yes | Remove agent from team |
| `GET` | `/teams/:teamUuid/agents` | Yes | List team agents |
| `POST` | `/teams/:teamUuid/members` | Yes | Add user to team |
| `POST` | `/teams/join` | Yes | Accept invitation (via invite code) |
| `POST` | `/teams/:teamUuid/invitations` | Yes | Generate invite code (admin) |
| `GET` | `/teams/:teamUuid/invitations` | Yes | List invitations (admin) |
| `DELETE` | `/teams/:teamUuid/invitations/:id` | Yes | Revoke invitation |

### Kanban Board (team-scoped)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/teams/:teamUuid/kanban/tasks` | Yes | Create task |
| `GET` | `/teams/:teamUuid/kanban/tasks` | Yes | List tasks (`?status=x&priority=y`) |
| `POST` | `/teams/:teamUuid/kanban/tasks/:id/claim` | Yes | Agent claims task |
| `PATCH` | `/teams/:teamUuid/kanban/tasks/:id/status` | Yes | Update task status |
| `GET` | `/teams/:teamUuid/kanban/summary` | Yes | Board summary (counts by status) |

### Messaging (team-scoped)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/teams/:teamUuid/messages` | Yes | Send message (direct/broadcast) |
| `GET` | `/teams/:teamUuid/messages` | Yes | Team message feed |
| `GET` | `/teams/:teamUuid/messages/inbox/:agentUuid` | Yes | Agent inbox |
| `PATCH` | `/teams/:teamUuid/messages/:id/read` | Yes | Mark message read |

---

## Database Schema (11 tables)

| Table | Purpose |
|-------|---------|
| `users` | User accounts (email, password hash, role: admin/user) |
| `agents` | Registered AI agents (capabilities, endpoint, type, status, team) |
| `teams` | Team groups with ownership and agent limits |
| `team_members` | User-to-team mapping with roles (owner/admin/member) |
| `team_invitations` | Shareable invite codes with max uses and expiry |
| `kanban_tasks` | Task board items scoped to teams (5 statuses, 4 priorities) |
| `agent_messages` | Inter-agent messages (direct/broadcast/system) |
| `workflow_runs` | Workflow execution instances with status tracking |
| `stage_executions` | Per-stage execution within workflows |
| `execution_logs` | Immutable audit trail with SHA-256 hashes + signatures |
| `api_tokens` | Machine-to-machine tokens with scopes and expiry |

---

## Project Structure

```
Multi-Agent-Orchestration/
│
├── apps/
│   ├── api/                              # Backend API (Fastify + TypeScript)
│   │   ├── src/
│   │   │   ├── app.ts                    # App setup (plugins, routes)
│   │   │   ├── server.ts                 # Server entry point
│   │   │   ├── config/                   # Environment config + validation
│   │   │   ├── db/
│   │   │   │   ├── schema/               # 11 Drizzle ORM table definitions
│   │   │   │   │   ├── users.ts
│   │   │   │   │   ├── agents.ts
│   │   │   │   │   ├── teams.ts          # teams + team_members
│   │   │   │   │   ├── team-invitations.ts
│   │   │   │   │   ├── kanban-tasks.ts
│   │   │   │   │   ├── agent-messages.ts
│   │   │   │   │   ├── workflow-runs.ts
│   │   │   │   │   ├── stage-executions.ts
│   │   │   │   │   ├── execution-logs.ts
│   │   │   │   │   └── api-tokens.ts
│   │   │   │   └── migrate.ts
│   │   │   ├── modules/
│   │   │   │   ├── auth/                 # Auth (register, login, JWT, API tokens)
│   │   │   │   │   ├── routes.ts
│   │   │   │   │   ├── service.ts
│   │   │   │   │   └── api-token-service.ts
│   │   │   │   ├── agents/               # Agent management (CRUD, health, activity)
│   │   │   │   │   ├── routes.ts
│   │   │   │   │   ├── service.ts
│   │   │   │   │   └── activity-service.ts
│   │   │   │   ├── teams/                # Teams (CRUD, members, invitations)
│   │   │   │   │   ├── routes.ts
│   │   │   │   │   ├── service.ts
│   │   │   │   │   └── invitation-service.ts
│   │   │   │   ├── kanban/               # Kanban board (tasks, claims, status)
│   │   │   │   │   ├── routes.ts
│   │   │   │   │   └── service.ts
│   │   │   │   ├── messaging/            # Inter-agent messaging
│   │   │   │   │   ├── routes.ts
│   │   │   │   │   └── service.ts
│   │   │   │   ├── workflows/            # Workflow execution & tracking
│   │   │   │   │   ├── routes.ts
│   │   │   │   │   └── service.ts
│   │   │   │   ├── memory/               # Redis key-value store
│   │   │   │   │   ├── routes.ts
│   │   │   │   │   └── service.ts
│   │   │   │   └── audit/                # Audit trail + signing
│   │   │   │       ├── routes.ts
│   │   │   │       └── service.ts
│   │   │   ├── plugins/                  # Fastify plugins
│   │   │   │   ├── authenticate.ts       # JWT + API token middleware
│   │   │   │   ├── database.ts           # PostgreSQL + Redis connection
│   │   │   │   ├── error-handler.ts      # Global error handling
│   │   │   │   ├── cors.ts
│   │   │   │   └── queue.ts              # BullMQ job queue
│   │   │   └── queue/
│   │   │       ├── workflow-queue.ts
│   │   │       └── workflow-worker.ts
│   │   ├── tests/
│   │   │   ├── integration/              # 11 integration test suites
│   │   │   └── unit/                     # 4 unit test suites
│   │   ├── drizzle/                      # Migration SQL files
│   │   └── drizzle.config.ts
│   │
│   └── dashboard/                        # Frontend (React 19 + Vite + Tailwind)
│       └── src/
│           ├── pages/
│           │   ├── LoginPage.tsx          # Split-screen branded login
│           │   ├── RegisterPage.tsx       # Split-screen branded registration
│           │   ├── DashboardPage.tsx      # Stats overview + team quick links
│           │   ├── AgentsPage.tsx         # Agent cards + registration form
│           │   ├── WorkflowsPage.tsx      # Workflow runs table
│           │   ├── TeamsPage.tsx          # Team cards + create/join
│           │   ├── TeamDetailPage.tsx     # Agents, invitations, settings tabs
│           │   ├── KanbanPage.tsx         # Drag-and-drop Kanban board (@dnd-kit)
│           │   ├── MessagingPage.tsx      # Inter-agent chat interface
│           │   └── SettingsPage.tsx       # Profile + API reference
│           ├── components/
│           │   ├── Layout.tsx             # Sidebar with SVG icons + sections
│           │   ├── ProtectedRoute.tsx     # Auth guard with session restore
│           │   └── Toast.tsx              # Toast notification system
│           └── lib/
│               ├── api.ts                # API client (50+ functions, localStorage auth)
│               └── auth-context.tsx      # Auth state + session restoration
│
├── packages/
│   └── shared/                           # Shared TypeScript types
│
├── docker/
│   └── postgres/
│       └── init.sql                      # Database initialization
│
├── docker-compose.yml                    # PostgreSQL + Redis containers
├── .env.example                          # Environment template
└── package.json                          # Root scripts
```

---

## Tests (182 total)

### Integration Tests (11 suites)
| Suite | Tests | Coverage |
|-------|-------|----------|
| `auth.test.ts` | 16 | Login, register, refresh, JWT validation, API tokens |
| `agents.test.ts` | 15 | Registration, listing, health checks, deletion |
| `workflows.test.ts` | 10 | Submission, status tracking, result retrieval |
| `teams-kanban-messaging.test.ts` | 34 | Teams CRUD, kanban tasks, messaging, auto-team creation |
| `phase2.test.ts` | 16 | API tokens, invitation system, advanced features |
| `audit.test.ts` | 10 | Audit log creation, signature verification |
| `memory.test.ts` | 14 | Redis write/read/delete, TTL handling |
| `db.test.ts` | 12 | Database migrations, schema validation |
| `rbac.test.ts` | 8 | Authorization (team membership, ownership) |
| `agent-dispatch.test.ts` | 4 | Workflow queue dispatch |
| `health.test.ts` | 4 | Health check endpoint |

### Unit Tests (4 suites)
| Suite | Tests | Coverage |
|-------|-------|----------|
| `retry-logic.test.ts` | 21 | Workflow retry mechanism with backoff |
| `signing.test.ts` | 17 | Cryptographic signing (audit signatures) |
| `task-tracker.test.ts` | 11 | Task state machine (claiming, status) |
| `health-checker.test.ts` | 10 | Agent health logic (status transitions) |

Run all tests:
```bash
pnpm test
```

---

## Common Commands

| Command | What It Does |
|---------|-------------|
| `pnpm dev` | Start the API server (port 3000) |
| `pnpm --filter dashboard dev` | Start the dashboard (port 5173) |
| `pnpm test` | Run all 182 tests |
| `pnpm build` | Build all packages for production |
| `pnpm db:generate` | Generate migration after schema changes |
| `pnpm db:migrate` | Apply pending database migrations |
| `pnpm docker:up` | Start PostgreSQL and Redis |
| `pnpm docker:down` | Stop PostgreSQL and Redis |
| `pnpm docker:logs` | View database/Redis logs |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Auto-format with Prettier |

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| **Node.js 20+** | JavaScript runtime |
| **TypeScript 5.7** | Type-safe development |
| **Fastify 5** | HTTP server (2x faster than Express) |
| **PostgreSQL 16** | Primary database (11 tables) |
| **Redis 7** | Job queue + memory store |
| **BullMQ 5** | Async workflow execution |
| **Drizzle ORM** | Type-safe SQL queries |
| **Zod** | Runtime validation |
| **React 19** | Dashboard UI |
| **Vite 6** | Frontend build tool |
| **Tailwind CSS 3.4** | Utility-first styling |
| **@dnd-kit** | Drag-and-drop Kanban board |
| **React Router 7** | Client-side routing |
| **Vitest 3** | Test runner |
| **JWT + bcrypt** | Authentication + password hashing |
| **Docker Compose** | Infrastructure (PostgreSQL + Redis) |
| **pnpm** | Monorepo package manager |

---

## Roadmap

| Phase | Status | Features |
|-------|--------|----------|
| **Phase 1** | Complete | Auth, agent CRUD, workflow engine, audit trail, basic dashboard |
| **Phase 2** | Complete | Teams, Kanban, messaging, invitations, agent types, polished UI, API tokens |
| **Phase 3** | Planned | WebSocket live updates, real AI agent integration (OpenAI/Claude/Gemini), workflow templates, notification system |
| **Phase 4** | Planned | Kubernetes deployment, distributed tracing, Prometheus metrics, rate limiting |
| **Phase 5** | Planned | gRPC support, parallel stage execution, multi-tenancy, plugin marketplace |

### Phase 3 — Planned Features
- **WebSocket real-time updates** — live Kanban board, message notifications, workflow progress
- **Real AI agent integration** — connect actual LLM APIs (OpenAI, Claude, Gemini) as agents
- **Workflow templates** — pre-built workflow definitions for common patterns
- **Agent capability matching** — smart routing based on agent capabilities and load
- **Notification system** — email/webhook notifications for task assignments and workflow completion
- **Role-based dashboard** — admin vs member views with granular permissions
- **Team analytics** — task completion rates, agent utilization, workflow success metrics
- **File attachments** — attach files to Kanban tasks and messages
- **Workflow visual editor** — drag-and-drop workflow builder in the dashboard
- **Agent SDK** — npm package for building custom agents that integrate with MAOF

---

## Stopping Everything

```bash
# Stop API server: Ctrl+C in its terminal
# Stop dashboard: Ctrl+C in its terminal

# Stop databases:
docker compose down

# Delete all data and start fresh:
docker compose down -v
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 3000 in use | Stop the other process or change `MAOF_PORT` in `.env` |
| Port 5432 in use | Stop other PostgreSQL or change port in `docker-compose.yml` |
| Cannot connect to DB | Run `docker compose ps` — ensure containers are running |
| pnpm not found | `npm install -g pnpm` |
| docker not found | Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| Tests failing | `docker compose up -d && pnpm db:migrate && pnpm test` |
| Dashboard shows errors | Ensure API server is running on port 3000 first |
| Page reload logs out | Clear localStorage and re-login (auth persistence uses `maof_access_token`) |

---

## Author

**Easin Arafat** — [@mrx-arafat](https://github.com/mrx-arafat)

## License

Apache-2.0
