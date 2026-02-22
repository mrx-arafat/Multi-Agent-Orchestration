# MAOF Development Status

> Last updated: 2026-02-22 (Phase 9 added)

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

### Phase 3 — Real-Time & Templates (Complete)
- [x] WebSocket real-time event streaming (`@fastify/websocket`)
- [x] JWT-authenticated WebSocket connections via query string token
- [x] Per-user and per-team event channels with subscribe/unsubscribe
- [x] In-process event bus for service → WebSocket broadcasting
- [x] Real-time Kanban events (task:created, task:claimed, task:updated)
- [x] Real-time messaging events (message:new)
- [x] Real-time workflow progress (workflow:stage_completed, workflow:completed, workflow:failed)
- [x] Frontend WebSocket client with auto-reconnect and exponential backoff
- [x] React hooks for consuming real-time events (`useWebSocket`, `useTeamEvents`, `useRealtimeEvent`)
- [x] Live connection indicator in sidebar (green dot when connected)
- [x] Workflow templates database table and CRUD API (5 endpoints)
- [x] 4 built-in templates: Data Pipeline, Content Generation, Code Review, Research & Summarize
- [x] Template gallery page with category filtering and search
- [x] One-click template instantiation (clone → execute workflow)
- [x] Template usage count tracking
- [x] Auto-seed templates on server startup
- [x] In-app notification system with database persistence
- [x] 6 notification types: task_assigned, workflow_completed, workflow_failed, team_invite, agent_offline, message_received
- [x] Notification API endpoints (list, unread count, mark read, mark all read)
- [x] Auto-create notifications from workflow completion/failure events
- [x] Real-time notification push via WebSocket
- [x] Notification bell component with unread badge in sidebar
- [x] Notification dropdown panel with mark-read actions

### Phase 4 — Real AI Integration (Complete)
- [x] **AI provider abstraction** — Unified interface for OpenAI (GPT-4o), Anthropic (Claude), Google (Gemini)
- [x] **17 built-in capability prompts** — Detailed system prompts and JSON output schemas for each capability
- [x] **Builtin dispatch mode** — `MAOF_AGENT_DISPATCH_MODE=builtin` routes stages to real AI APIs (no HTTP agent needed)
- [x] **5 built-in AI agents** — Auto-registered on startup: Text AI, Research AI, Content AI, Code AI, Data AI
- [x] **Agent type system** — New `builtin` agent type with special UI badges
- [x] **AI status API** — `GET /ai/status` endpoint exposing provider config and capabilities
- [x] **Settings: AI Providers tab** — Shows dispatch mode, configured providers, setup guide
- [x] **Agents page: built-in badges** — Built-in agents show "AI Built-in" badge with violet theme
- [x] **Smart agent capability matching** — Multi-factor scoring algorithm: capacity (40%), response time (30%), health (20%), recency (10%)
- [x] **Response time tracking** — Rolling window of last 20 execution times per agent in Redis
- [x] **Capability matching API** — `GET /agents/match/:capability` returns scored agents with breakdown
- [x] **Role-based dashboard views** — Sidebar navigation filtered by user role, admin badge display

### Phase 5 — Analytics & Visual Editor (Complete)
- [x] **Team analytics backend** — 5 analytics API endpoints for task, agent, workflow, time-series, and overview metrics
- [x] **Task completion metrics** — Rates by status and priority, average completion time
- [x] **Agent utilization metrics** — Tasks assigned/completed, stages executed, avg execution time per agent
- [x] **Workflow success metrics** — Success/failure rates, average duration, stages per workflow
- [x] **Time-series analytics** — 30-day daily trends for tasks created/completed, workflows started/completed/failed
- [x] **Overview stats endpoint** — Quick dashboard numbers: agents, tasks, workflows
- [x] **Analytics dashboard page** — Team selector, stat cards, bar charts, sparkline trends, agent utilization list
- [x] **Workflow visual editor** — Stage builder with capability selection, dependency management, input variable configuration
- [x] **Stage dependency graph** — Visual flow indicator showing execution order
- [x] **Quick-start templates** — 3 built-in editor templates: Translation Pipeline, Code Review, Research & Content
- [x] **JSON preview panel** — Real-time workflow definition preview
- [x] **Execute from editor** — One-click workflow execution with custom input
- [x] **Save as template** — Save editor workflows to template gallery

### Phase 8 — Dashboard UI/UX Overhaul (Complete)
- [x] **Reusable ConfirmDialog component** — Modal with danger/warning/info variants, Escape key close, backdrop click, focus management
- [x] **Confirmation dialogs for destructive actions** — Delete agent, revoke API token, all destructive actions now require explicit confirmation
- [x] **AgentsPage: search and pagination** — Client-side search by name/ID/capability, server-side pagination with page controls
- [x] **AgentsPage: better empty states** — Context-aware empty state (search vs no agents) with clear action buttons
- [x] **WorkflowsPage: detail modal** — Click "View Details" to see workflow progress bar, stage counts, timestamps, error messages
- [x] **WorkflowsPage: pagination and navigation** — Server-side pagination, status filter resets page, "New Workflow" button links to editor
- [x] **WorkflowsPage: actionable empty state** — Links to Workflow Editor and Templates instead of raw API endpoint text
- [x] **WorkflowsPage: status icons** — SVG icons for each workflow status (queued, in_progress, completed, failed)
- [x] **DashboardPage: quick actions grid** — 4 quick action cards: New Workflow, Templates, Register Agent, Create Team
- [x] **DashboardPage: improved stat cards** — Icons, success rate calculation, running workflow count, better sub-labels
- [x] **DashboardPage: empty state for new users** — Helpful guidance when no teams exist with link to create first team
- [x] **DashboardPage: online agent indicator** — Header shows real-time count of online agents with animated dot
- [x] **SettingsPage: editable profile** — Inline name editing with save/cancel, updates auth context immediately
- [x] **SettingsPage: API token management UI** — Full CRUD: create tokens (name + expiry), view token list, revoke with confirmation
- [x] **SettingsPage: token copy-to-clipboard** — New token shown once with copy button, clear warning about one-time display
- [x] **Profile update API** — `PATCH /auth/profile` endpoint for updating user name
- [x] **Auth context: refreshUser** — New `refreshUser()` method re-fetches user data after profile updates
- [x] **Error states with retry** — Error banners include retry button (AgentsPage, WorkflowsPage)
- [x] **Consistent page layout** — Fixed WorkflowsPage double-padding, unified header patterns across all pages

## Statistics

| Metric | Count |
|--------|-------|
| API Endpoints | 86 |
| Database Tables | 16 |
| Frontend Pages | 13 |
| Frontend Components | 3 (ConfirmDialog, NotificationBell, Toast) |
| Service Modules | 21 |
| Service Functions | 140+ |
| AI Capabilities | 17 |
| AI Providers | 3 (OpenAI, Anthropic, Google) |
| Integration Test Suites | 13 |
| Unit Test Suites | 6 |
| Total Tests | 179 |

## Key Architecture Decisions

1. **Team-scoped isolation** — Kanban tasks, messages, and agents are scoped to teams. This provides natural multi-tenancy within the platform.

2. **Agent types** — Three types supported: `generic` (expects HTTP POST to endpoint), `openclaw` (webhook-based for OpenClaw agents), and `builtin` (in-process AI execution). Extensible via the `agent_type` enum.

3. **Invitation system** — Uses 8-character hex codes generated via `crypto.randomBytes(4)`. Codes have optional max uses and expiry. Only team owners/admins can create invitations.

4. **Auth persistence** — JWT tokens stored in localStorage with keys `maof_access_token` and `maof_refresh_token`. On page load, the auth context calls `GET /auth/me` to validate the stored token.

5. **Optimistic UI** — Kanban drag-and-drop updates the UI immediately, then persists to backend. On failure, the UI reverts to the previous state.

6. **Audit trail** — Every workflow stage execution generates an immutable log entry with SHA-256 hashed inputs/outputs and optional cryptographic signatures for tamper detection.

7. **In-process event bus** — Services emit events to a central `EventEmitter`-based bus. The WebSocket plugin subscribes and forwards events to connected clients based on channel subscriptions. This avoids the need for Redis pub/sub in single-instance deployments.

8. **Channel-based WebSocket routing** — Clients subscribe to channels (`user:<uuid>`, `team:<uuid>`). Events are broadcast only to clients subscribed to the matching channel. Users are auto-subscribed to their own user channel.

9. **Template seeding** — Built-in workflow templates are auto-seeded on server startup using idempotent insert logic (checks by name). This ensures templates are available immediately after migration.

10. **AI provider abstraction** — Three providers (OpenAI, Anthropic, Google) implement a common `AIProvider` interface. The `builtin` dispatch mode routes workflow stages to AI APIs in-process, eliminating the need for external agent HTTP servers. Each capability maps to a system prompt + JSON output schema.

11. **Built-in agents** — Five logical AI agents (Text, Research, Content, Code, Data) group related capabilities and auto-register on startup with `agent_type='builtin'`. They appear in the agent registry but skip health checks and use `builtin://local` as their endpoint sentinel.

12. **Smart agent routing** — Multi-factor scoring algorithm selects the best agent for each capability. Factors: available capacity (40%), average response time (30%), health status (20%), and task recency (10%). Response times are tracked via a rolling window in Redis (last 20 samples per agent).

13. **Role-based UI** — Navigation items support a `roles` filter. The sidebar renders only items the user's role permits. Admin users see a badge in the sidebar footer. The auth context passes `role` from JWT payload through to all components.

14. **Analytics aggregation** — Team-scoped analytics queries use PostgreSQL aggregate functions (`count`, `avg`, `filter`) for efficient metrics computation. Time-series data uses `to_char` grouping for daily bucketing over configurable windows.

15. **Parallel stage execution** — Stages with no inter-dependencies run concurrently via `Promise.all()`. The `getExecutionLevels()` function groups stages into dependency levels using Kahn's algorithm. Levels execute sequentially; stages within a level execute in parallel. If any stage in a parallel batch fails, the workflow is marked failed immediately. The workflow status API returns `progress.currentStages` (array of all in-progress stage IDs) and `progress.inProgress` (count) for real-time multi-stage tracking.

16. **Visual workflow editor** — A zero-dependency drag-and-drop editor that produces the standard `WorkflowDefinition` JSON format. Stages support capability selection from built-in agents, dependency wiring, variable interpolation (`${stageId.output.field}`), and retry configuration. Quick-start templates bootstrap common patterns.

17. **Agent-first design** — The platform is designed for autonomous agent operation, not human interaction. Agents consume structured APIs to register, discover work, execute tasks, communicate with peers, and report results. The dashboard is human oversight only. The `GET /agent-ops/protocol` endpoint provides a machine-readable instruction manual that any agent can read to learn how to operate within MAOF — covering authentication, lifecycle phases, endpoint catalog, and 13 operating rules.

18. **Agent task lifecycle** — Agent-facing APIs wrap the kanban system into a clean lifecycle: discover available tasks (filtered by capability match), start (claim + move to in_progress), complete (submit result, done or review), fail (release for reassignment). Tasks released on failure go back to "todo" so other agents can pick them up — no work is lost.

19. **Agent communication protocol** — Agents coordinate via three message types: direct (peer-to-peer handoff), broadcast (team-wide announcements), and system (automated notifications). Each agent has an inbox endpoint that returns unread messages with optional auto-mark-as-read. Messages carry structured metadata for passing context between agents.

20. **Confirmation dialog pattern** — All destructive actions (delete agent, revoke token) use a shared `ConfirmDialog` component with variant-based styling (danger/warning/info). Dialogs trap focus, close on Escape, and prevent accidental double-clicks.

21. **Client-side search with server-side pagination** — Agent search filters the current page's results client-side for instant feedback, while pagination is server-side for scalability. This hybrid approach gives snappy search UX without fetching all records.

22. **Workflow detail modal** — Clicking a workflow row opens a detail modal (not a new page) that fetches full status including parallel stage progress. This keeps the list context visible and enables quick browsing through multiple workflows.

23. **Profile updates via auth context** — After profile edits, `refreshUser()` re-fetches from `/auth/me` and updates React context. All components consuming `useAuth()` reflect the change immediately without page reload.

24. **Task dependency graph (Phase 9)** — Kanban tasks support `dependsOn` (UUID array) for DAG-style dependency chains. The context resolver uses Handlebars-style template syntax `{{taskUuid.output.field}}` for `inputMapping`, resolving upstream task outputs into downstream task inputs. When a task completes, `processTaskCompletion()` checks if downstream tasks are fully unblocked and auto-promotes them from `backlog` to `todo`.

25. **Structured typed output (Phase 9)** — Tasks produce a JSONB `output` field alongside the legacy text `result`. The `output` field enables structured context passing between agents (e.g., `{type: "code_review", findings: [...], score: 7.5}`). This is the primary vehicle for agent-to-agent data flow.

26. **Agent-to-agent delegation (Phase 9)** — The `POST /agent-ops/agents/:uuid/delegate` endpoint enables A2A task creation. The delegating agent specifies a required capability which becomes the task tag, enabling capability-based routing. Delegated tasks support the full dependency/context chain.

27. **Retry with dead letter (Phase 9)** — Each task has configurable `maxRetries`. On failure, `retryCount` increments and the task is re-queued (`todo`, unassigned) for another agent. When retries are exhausted, the task moves to `done` with failure details — acting as a dead letter. The timeout checker handles stale `in_progress` tasks similarly.

28. **Webhook delivery with HMAC signing (Phase 9)** — Webhook payloads are signed with HMAC-SHA256 using a per-webhook secret (`X-MAOF-Signature` header). Deliveries are tracked in `webhook_deliveries` with exponential backoff retry (up to 5 attempts, max 1 hour backoff). Dead-lettered deliveries are preserved for debugging.

29. **Event-driven webhook integration (Phase 9)** — `registerWebhookDelivery()` attaches a listener to the event bus. All team-channel events (task:*, workflow:*, message:*) automatically trigger webhook delivery to matching subscribers. This keeps the webhook layer decoupled from business logic.

30. **Cost attribution (Phase 9)** — The `task_metrics` table records token usage, cost (in cents for integer precision), latency, provider, and model per execution. Aggregation queries support team summary, per-agent breakdown, daily time-series, and per-workflow drill-down.

### Phase 6 — Agent Operations Protocol (Complete)
- [x] **Agent protocol endpoint** — `GET /agent-ops/protocol` returns machine-readable operating instructions (no auth required)
- [x] **9-step agent lifecycle** — Register → Join Team → Discover Work → Claim → Execute → Report → Communicate → Check Inbox → Health Response
- [x] **Agent context endpoint** — `GET /agent-ops/agents/:uuid/context` returns full state: team, pending tasks, unread messages
- [x] **Agent task discovery** — `GET /agent-ops/agents/:uuid/tasks?filter=available` returns capability-matched unclaimed tasks
- [x] **Agent task start** — `POST /agent-ops/agents/:uuid/tasks/:taskUuid/start` claims and begins work
- [x] **Agent task complete** — `POST /agent-ops/agents/:uuid/tasks/:taskUuid/complete` submits result (done or review)
- [x] **Agent task fail** — `POST /agent-ops/agents/:uuid/tasks/:taskUuid/fail` releases task for reassignment
- [x] **Agent broadcast** — `POST /agent-ops/agents/:uuid/broadcast` sends team-wide message
- [x] **Agent direct message** — `POST /agent-ops/agents/:uuid/message` sends peer-to-peer message
- [x] **Agent inbox** — `GET /agent-ops/agents/:uuid/inbox?markAsRead=true` reads and optionally marks messages
- [x] **Agent status reporting** — `POST /agent-ops/agents/:uuid/status` self-reports online/degraded/offline
- [x] **13 operating rules** — Machine-readable rules for agent behavior (health checks, task claiming, reporting)
- [x] **Full endpoint catalog** — Protocol includes every endpoint with request/response examples

### Phase 7 — Parallel Execution (Complete)
- [x] **Parallel stage execution** — Independent workflow stages run concurrently via `Promise.all()`
- [x] **Execution level grouping** — `getExecutionLevels()` groups stages by dependency depth for optimal parallelism
- [x] **Workflow status: multiple in-progress stages** — `progress.currentStages` array and `progress.inProgress` count
- [x] **Visual parallel flow indicator** — Workflow editor shows parallel groups with `||` notation and green "PARALLEL" badge
- [x] **Execution level summary** — Editor summary shows execution levels and parallel group count
- [x] **Backward compatible** — Existing sequential workflows execute identically; `progress.current` still works
- [x] **Database fix** — Fixed `api_tokens.token_prefix` column size (varchar(12) → varchar(16))

### Phase 9 — Agent-Native Infrastructure (Complete)
- [x] **Context Store & Task Dependencies** — Tasks support `dependsOn` (UUID array) for dependency graphs and `inputMapping` (Handlebars-style `{{taskUuid.output.field}}`) for context chaining between tasks
- [x] **Structured Task Output** — Tasks produce typed JSONB `output` in addition to text `result`. Output flows through dependency chains via template resolution
- [x] **Auto-Dependency Resolution** — When upstream tasks complete, downstream blocked tasks are automatically promoted from `backlog` to `todo` with resolved input context
- [x] **Task Dependency Context API** — `GET /teams/:teamUuid/kanban/tasks/:taskUuid/context` returns full upstream outputs and resolved input mappings
- [x] **Agent-to-Agent Task Delegation** — `POST /agent-ops/agents/:uuid/delegate` lets agents create subtasks for other agents, tagged with required capabilities for auto-matching
- [x] **Streaming Progress** — `POST /agent-ops/agents/:uuid/tasks/:taskUuid/progress` reports step N/M with message; emits real-time WebSocket `task:progress` events
- [x] **Task Retry with Dead Letter** — Configurable `maxRetries` per task. Failed tasks re-queue for other agents until retries exhausted, then move to dead-letter (`done` with failure info)
- [x] **Task Timeout Enforcement** — Configurable `timeoutMs` per task. Stale `in_progress` tasks auto-detected and handled (retry or dead-letter)
- [x] **Webhook Notifications** — CRUD for webhook registrations (`/teams/:teamUuid/webhooks`). Events auto-delivered via HMAC-SHA256 signed HTTP POST with exponential backoff retry. Delivery history tracking
- [x] **Cost Tracking & Metrics** — `task_metrics` table records tokens, cost, latency per execution. API endpoints for team cost summary, per-agent breakdown, daily time-series, per-workflow breakdown
- [x] **Event-Driven Webhook Delivery** — All team events (task:created, task:completed, workflow:failed, etc.) auto-trigger matching webhook deliveries via event bus integration

## What's Next — Phase 10 Priorities

### High Priority
- [ ] **File attachments** — Attach files to Kanban tasks and messages
- [ ] **Agent SDK (npm package)** — Build custom agents that integrate with MAOF
- [ ] **Mobile responsive layout** — Sidebar collapse, responsive grids, touch-friendly Kanban

### Medium Priority
- [ ] **Email notifications** — Extend notification system with email delivery for offline users
- [ ] **Plugin marketplace** — Community-contributed agent templates and workflow patterns
- [ ] **Rate limiting** — Per-user and per-agent request throttling
- [ ] **Real-time WebSocket on more pages** — Live agent status, Kanban updates from other users

### Lower Priority
- [ ] **Kubernetes deployment** — Helm charts for production deployment
- [ ] **Distributed tracing** — OpenTelemetry integration
- [ ] **Prometheus metrics** — System observability and alerting
- [ ] **gRPC support** — Alternative to HTTP for agent communication
- [ ] **Redis pub/sub for multi-instance WebSocket** — Scale real-time events across multiple API instances
- [ ] **Keyboard shortcuts** — Kanban keyboard navigation, global search shortcut
- [ ] **Data export** — CSV/PDF export for analytics and workflow history

## File Inventory

### Backend Service Modules
| Module | Service Files | Route File |
|--------|--------------|------------|
| Auth | `service.ts`, `api-token-service.ts` | `routes.ts` |
| Agents | `service.ts`, `activity-service.ts`, `router.ts` | `routes.ts` |
| Teams | `service.ts`, `invitation-service.ts` | `routes.ts` |
| Kanban | `service.ts`, `context-resolver.ts`, `timeout-checker.ts` | `routes.ts` |
| Messaging | `service.ts` | `routes.ts` |
| Workflows | `service.ts`, `validator.ts` | `routes.ts` |
| Memory | `service.ts` | `routes.ts` |
| Audit | `service.ts` | `routes.ts` |
| Templates | `service.ts`, `seed.ts` | `routes.ts` |
| Notifications | `service.ts` | `routes.ts` |
| Built-in Agents | `executor.ts`, `capability-prompts.ts`, `seed.ts` | `routes.ts` |
| Analytics | `service.ts` | `routes.ts` |
| Agent Ops | `service.ts`, `protocol.ts` | `routes.ts` |
| Webhooks | `service.ts` | `routes.ts` |
| Metrics | `service.ts` | `routes.ts` |

### Backend Infrastructure
| Module | File | Purpose |
|--------|------|---------|
| Event Bus | `lib/event-bus.ts` | In-process pub/sub for real-time events |
| WebSocket | `plugins/websocket.ts` | JWT-authenticated WS connections |
| AI Providers | `lib/ai-providers/` | OpenAI, Anthropic, Google provider abstraction |
| Cache | `lib/cache.ts` | Redis caching for stage outputs and agent capabilities |

### Database Tables
| Table | Schema File | Enums |
|-------|------------|-------|
| users | `users.ts` | user_role (admin, user) |
| agents | `agents.ts` | agent_status (online, degraded, offline), agent_type (generic, openclaw, builtin) |
| teams, team_members | `teams.ts` | — |
| team_invitations | `team-invitations.ts` | — |
| kanban_tasks | `kanban-tasks.ts` | kanban_status (5 values), kanban_priority (4 values) |
| agent_messages | `agent-messages.ts` | message_type (direct, broadcast, system) |
| workflow_runs | `workflow-runs.ts` | workflow_status (queued, in_progress, completed, failed) |
| stage_executions | `stage-executions.ts` | stage_status (queued, in_progress, completed, failed) |
| execution_logs | `execution-logs.ts` | — |
| api_tokens | `api-tokens.ts` | — |
| workflow_templates | `workflow-templates.ts` | — |
| notifications | `notifications.ts` | notification_type (6 values) |
| webhooks | `webhooks.ts` | — |
| webhook_deliveries | `webhooks.ts` | webhook_delivery_status (4 values) |
| task_metrics | `task-metrics.ts` | — |

### Frontend Pages
| Page | File | Key Libraries |
|------|------|--------------|
| Login | `LoginPage.tsx` | — |
| Register | `RegisterPage.tsx` | — |
| Dashboard | `DashboardPage.tsx` | — |
| Agents | `AgentsPage.tsx` | — |
| Workflows | `WorkflowsPage.tsx` | — |
| Templates | `TemplatesPage.tsx` | — |
| Teams | `TeamsPage.tsx` | — |
| Team Detail | `TeamDetailPage.tsx` | — |
| Kanban | `KanbanPage.tsx` | @dnd-kit/core, @dnd-kit/sortable |
| Chat | `MessagingPage.tsx` | — |
| Settings | `SettingsPage.tsx` | — |
| Analytics | `AnalyticsPage.tsx` | — |
| Workflow Editor | `WorkflowEditorPage.tsx` | — |

### Frontend Infrastructure
| Module | File | Purpose |
|--------|------|---------|
| WebSocket Client | `lib/websocket.tsx` | Auto-reconnecting WS with React hooks |
| Notification Bell | `components/NotificationBell.tsx` | Unread badge + dropdown panel |
| API Client | `lib/api.ts` | Typed fetch wrapper with JWT auth |
| Auth Context | `lib/auth-context.tsx` | React context for user state + role |
