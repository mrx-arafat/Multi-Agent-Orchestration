# 1. Platform Overview

## What Is MAOF?

MAOF (Multi-Agent Orchestration Framework) is a platform for managing AI agents. You register agents, organize them into teams, assign them tasks on kanban boards, and chain them together into workflows. Think of it as a project management tool where the workers are AI agents instead of humans.

## How The Pieces Fit Together

```
┌─────────────────────────────────────────────────────────┐
│                     Users                                │
│                                                         │
│   Browser ──► Dashboard (React)                         │
│                    │                                    │
│   Telegram ──► Bot ──► MCP Bridge                      │
│                           │                             │
│                           ▼                             │
│                    ┌──────────────┐                     │
│                    │   MAOF API   │ ◄── Agents (HTTP)   │
│                    │  (Fastify)   │                     │
│                    └──────┬───────┘                     │
│                           │                             │
│                    ┌──────┴───────┐                     │
│                    │              │                     │
│               PostgreSQL       Redis                    │
│              (data store)   (job queue)                 │
└─────────────────────────────────────────────────────────┘
```

There are **four ways** to interact with the platform:

| Method | How It Works | Best For |
|--------|-------------|----------|
| **Dashboard** | Web UI at `http://localhost:5173` | Humans managing teams, viewing boards, creating workflows |
| **Telegram Bot** | Bot calls the API via HTTP (using exec/curl) | Managing tasks and agents on the go |
| **MCP Bridge** | MCP server exposing 35 tools over stdio | AI assistants with native MCP support |
| **Direct API** | REST API at `http://localhost:3000` | Custom integrations, scripts, CI/CD |

## Core Concepts

### Users
People who use the platform. Each user has an email, password, and can create API tokens for external access (bots, scripts).

### Teams
A team is a workspace. It contains agents, a kanban board, and a message bus. Teams are isolated — agents in Team A can't see Team B's tasks. Users can belong to multiple teams and invite others via join codes.

### Agents
AI agents registered on the platform. Each agent has:
- **Capabilities** — what it can do (e.g., `text-generation`, `code-review`, `research`)
- **Status** — online, degraded, or offline
- **Type** — `builtin` (AI providers like OpenAI/Claude), `generic` (your own HTTP endpoint), or `openclaw` (webhook-based)

### Kanban Board
Every team has a 5-column task board:

```
Backlog → Todo → In Progress → Review → Done
```

Tasks have a title, description, priority (low/medium/high/critical), tags, and can be assigned to agents.

Tasks also support **dependency chains** — a task can declare that it depends on other tasks. When all upstream tasks are complete, the dependent task is automatically promoted from `backlog` to `todo`. Upstream task outputs are injected into the downstream task via **input mappings** using template syntax like `{{taskUuid.output.fieldName}}`.

### Structured Output
When an agent completes a task, it can attach a **structured JSON output** alongside the text result. This output is stored on the task and made available to downstream tasks through input mappings. This enables typed data flow between agents — one agent produces a JSON object, another consumes specific fields from it.

### Webhooks
Teams can register **webhook endpoints** that receive HTTP POST notifications when events occur (task completions, status changes, etc.). Each delivery is signed with HMAC-SHA256 so receivers can verify authenticity. Failed deliveries are retried with exponential backoff.

### Cost Tracking
Every agent execution can record **token usage, cost, and latency metrics**. These are stored per-task and per-workflow, and can be queried as team summaries, per-agent breakdowns, or daily time series. This gives visibility into how much each agent and workflow costs to run.

### Workflows
A workflow chains multiple agents together in stages. Each stage requires an agent capability. Stages can run in parallel (if independent) or sequentially (if one depends on another's output).

Example workflow:
```
Stage 1: "research" capability → Agent researches the topic
Stage 2: "text-generation" capability → Agent writes content (depends on Stage 1)
Stage 3: "content-review" capability → Agent reviews the draft (depends on Stage 2)
```

### Templates
Saved workflow definitions you can reuse. Instead of building a workflow from scratch each time, save it as a template and run it with different inputs.

### Notifications
The platform notifies you about events: task completions, workflow results, agent status changes.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **API** | Node.js 20 + Fastify 5 + TypeScript | Backend server |
| **Database** | PostgreSQL 16 | Persistent data storage (users, teams, tasks, workflows) |
| **Queue** | Redis 7 + BullMQ | Async workflow execution, job processing |
| **ORM** | Drizzle ORM | Type-safe database queries |
| **Auth** | JWT + bcrypt | User authentication, password hashing |
| **Dashboard** | React 19 + Vite 6 + Tailwind CSS | Web interface |
| **Bot Bridge** | MCP SDK + stdio | Exposes API as tools for AI assistants |
| **Infrastructure** | Docker Compose | PostgreSQL + Redis containers |
| **Monorepo** | pnpm workspaces | Package management |

## Agent Dispatch Modes

When a workflow stage needs to run, MAOF "dispatches" the task to an agent. There are three modes:

| Mode | What Happens | When To Use |
|------|-------------|-------------|
| **mock** (default) | Simulates agent responses. No real AI calls. | Development, testing workflows |
| **builtin** | Routes to OpenAI, Claude, or Gemini APIs. Agents run in-process. | Production without custom agent servers |
| **real** | POSTs tasks to your agent's HTTP endpoint. | Production with custom agents |

## Database Structure

16 tables organized by module:

| Module | Tables |
|--------|--------|
| **Auth** | `users`, `api_tokens` |
| **Teams** | `teams`, `team_members`, `team_invitations` |
| **Agents** | `agents` |
| **Kanban** | `kanban_tasks` |
| **Messaging** | `agent_messages` |
| **Workflows** | `workflow_runs`, `stage_executions`, `execution_logs` |
| **Templates** | `workflow_templates` |
| **Notifications** | `notifications` |
| **Webhooks** | `webhooks`, `webhook_deliveries` |
| **Metrics** | `task_metrics` |

## Directory Structure

```
Multi-Agent-Orchestration/
├── apps/
│   ├── api/                  # Backend API (Fastify + TypeScript)
│   │   ├── src/
│   │   │   ├── config/       # Environment validation
│   │   │   ├── db/           # Database schema + migrations
│   │   │   ├── lib/          # AI providers, event bus, utilities
│   │   │   ├── modules/      # Feature modules (auth, agents, kanban, webhooks, metrics, etc.)
│   │   │   ├── plugins/      # Fastify plugins (auth, websocket)
│   │   │   └── queue/        # BullMQ workflow worker
│   │   ├── drizzle/          # SQL migration files
│   │   └── tests/            # Integration + unit tests
│   │
│   └── dashboard/            # Frontend (React + Vite + Tailwind)
│       └── src/
│           ├── components/   # Shared UI components
│           ├── lib/          # API client, auth context, websocket
│           └── pages/        # 13 page components
│
├── packages/
│   ├── mcp-bridge/           # MCP server for bot integration
│   │   └── src/
│   │       ├── tools/        # 8 tool modules (35 tools total)
│   │       ├── api-client.ts # HTTP client for MAOF API
│   │       └── helpers.ts    # Response formatting utilities
│   │
│   └── shared/               # Shared TypeScript types
│
├── user-manuals/             # This documentation
├── docker-compose.yml        # PostgreSQL + Redis
└── package.json              # Monorepo root scripts
```
