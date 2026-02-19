# MAOF Development Status

> Last updated: 2026-02-20

## Completed Phases

### Phase 1 — Core Platform (Complete)
- [x] User authentication (JWT + refresh tokens)
- [x] Agent registration with capabilities and endpoints
- [x] Multi-stage workflow engine (async via BullMQ)
- [x] Per-stage execution tracking with progress
- [x] Immutable audit trail with SHA-256 hashing
- [x] Cryptographic signing for audit log verification (FR-5.2)
- [x] Shared memory store (Redis) for inter-stage data passing
- [x] Health check endpoint (database + Redis connectivity)
- [x] Dashboard with login, agent list, workflow monitoring
- [x] Production hardening (error handling, input validation, graceful shutdown)

### Phase 2 — Team Collaboration (Complete)
- [x] Team creation with ownership and agent limits
- [x] Team member management (owner/admin/member roles)
- [x] Team invitations with shareable invite codes (8-char hex, max uses, expiry)
- [x] Add/remove agents to/from teams
- [x] Kanban task board (5 columns: backlog → todo → in_progress → review → done)
- [x] Kanban task priorities (low, medium, high, critical)
- [x] Agent task claiming
- [x] Inter-agent messaging (direct, broadcast, system types)
- [x] Agent inbox with read receipts
- [x] Agent types: `generic` (HTTP) and `openclaw` (webhook)
- [x] Auto-team creation on agent registration (`createTeam: true`)
- [x] API tokens for machine-to-machine auth (scopes, expiry, revocation)
- [x] Agent health monitoring (manual health checks with latency tracking)
- [x] Agent activity history (execution log per agent)
- [x] Drag-and-drop Kanban board UI (@dnd-kit)
- [x] Inter-agent chat interface with broadcast/direct modes
- [x] Team management UI (agents, invitations, settings tabs)
- [x] Agent registration form in dashboard
- [x] Split-screen branded login/register pages
- [x] Dashboard overview with team stats and quick links
- [x] Auth persistence via localStorage (sessions survive page reload)
- [x] Toast notification system for user feedback
- [x] Polished sidebar with SVG icons and section labels
- [x] Settings page with profile info and API reference

## Statistics

| Metric | Count |
|--------|-------|
| API Endpoints | 41 |
| Database Tables | 11 |
| Frontend Pages | 10 |
| Service Modules | 11 |
| Service Functions | 50+ |
| Integration Test Suites | 11 |
| Unit Test Suites | 4 |
| Total Tests | 182 |

## Key Architecture Decisions

1. **Team-scoped isolation** — Kanban tasks, messages, and agents are scoped to teams. This provides natural multi-tenancy within the platform.

2. **Agent types** — Two types supported: `generic` (expects HTTP POST to endpoint) and `openclaw` (webhook-based for OpenClaw agents). Extensible via the `agent_type` enum.

3. **Invitation system** — Uses 8-character hex codes generated via `crypto.randomBytes(4)`. Codes have optional max uses and expiry. Only team owners/admins can create invitations.

4. **Auth persistence** — JWT tokens stored in localStorage with keys `maof_access_token` and `maof_refresh_token`. On page load, the auth context calls `GET /auth/me` to validate the stored token.

5. **Optimistic UI** — Kanban drag-and-drop updates the UI immediately, then persists to backend. On failure, the UI reverts to the previous state.

6. **Audit trail** — Every workflow stage execution generates an immutable log entry with SHA-256 hashed inputs/outputs and optional cryptographic signatures for tamper detection.

## What's Next — Phase 3 Priorities

### High Priority
- [ ] **WebSocket real-time updates** — Replace polling with live updates for Kanban board, messages, and workflow progress
- [ ] **Real AI agent integration** — Connect OpenAI, Claude, Gemini APIs as actual agents (currently mock responses)
- [ ] **Workflow templates** — Pre-built workflow definitions users can clone and customize
- [ ] **Notification system** — Email/webhook notifications for task assignments and workflow events

### Medium Priority
- [ ] **Agent capability matching** — Smart routing based on capabilities, load, and response time
- [ ] **Role-based dashboard views** — Different UI for admin vs member vs viewer roles
- [ ] **Team analytics** — Task completion rates, agent utilization, workflow success metrics
- [ ] **File attachments** — Attach files to Kanban tasks and messages
- [ ] **Workflow visual editor** — Drag-and-drop workflow builder in the dashboard

### Lower Priority
- [ ] **Agent SDK (npm package)** — Build custom agents that integrate with MAOF
- [ ] **Plugin marketplace** — Community-contributed agent templates and workflow patterns
- [ ] **Kubernetes deployment** — Helm charts for production deployment
- [ ] **Distributed tracing** — OpenTelemetry integration
- [ ] **Prometheus metrics** — System observability and alerting
- [ ] **Rate limiting** — Per-user and per-agent request throttling
- [ ] **gRPC support** — Alternative to HTTP for agent communication
- [ ] **Parallel stage execution** — Run independent workflow stages concurrently

## File Inventory

### Backend Service Modules
| Module | Service Files | Route File |
|--------|--------------|------------|
| Auth | `service.ts`, `api-token-service.ts` | `routes.ts` |
| Agents | `service.ts`, `activity-service.ts` | `routes.ts` |
| Teams | `service.ts`, `invitation-service.ts` | `routes.ts` |
| Kanban | `service.ts` | `routes.ts` |
| Messaging | `service.ts` | `routes.ts` |
| Workflows | `service.ts` | `routes.ts` |
| Memory | `service.ts` | `routes.ts` |
| Audit | `service.ts` | `routes.ts` |

### Database Tables
| Table | Schema File | Enums |
|-------|------------|-------|
| users | `users.ts` | user_role (admin, user) |
| agents | `agents.ts` | agent_status (online, degraded, offline), agent_type (generic, openclaw) |
| teams, team_members | `teams.ts` | — |
| team_invitations | `team-invitations.ts` | — |
| kanban_tasks | `kanban-tasks.ts` | kanban_status (5 values), kanban_priority (4 values) |
| agent_messages | `agent-messages.ts` | message_type (direct, broadcast, system) |
| workflow_runs | `workflow-runs.ts` | workflow_status (queued, in_progress, completed, failed) |
| stage_executions | `stage-executions.ts` | stage_status (queued, in_progress, completed, failed) |
| execution_logs | `execution-logs.ts` | — |
| api_tokens | `api-tokens.ts` | — |

### Frontend Pages
| Page | File | Key Libraries |
|------|------|--------------|
| Login | `LoginPage.tsx` | — |
| Register | `RegisterPage.tsx` | — |
| Dashboard | `DashboardPage.tsx` | — |
| Agents | `AgentsPage.tsx` | — |
| Workflows | `WorkflowsPage.tsx` | — |
| Teams | `TeamsPage.tsx` | — |
| Team Detail | `TeamDetailPage.tsx` | — |
| Kanban | `KanbanPage.tsx` | @dnd-kit/core, @dnd-kit/sortable |
| Chat | `MessagingPage.tsx` | — |
| Settings | `SettingsPage.tsx` | — |
