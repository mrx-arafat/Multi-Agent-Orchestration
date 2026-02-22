# 4. API Reference

Complete reference for every MAOF API endpoint.

## Base URL

```
http://localhost:3000
```

When accessed through ngrok or another tunnel:
```
https://your-tunnel-url.ngrok-free.app
```

**Note:** Routes are at the root level. There is no `/api` prefix. The dashboard uses a Vite proxy that rewrites `/api/*` to `/*`, but when calling the API directly, use the root path.

## Authentication

All endpoints except `/health`, `/auth/register`, `/auth/login`, `/auth/refresh`, and `/agent-ops/protocol` require authentication.

### Header Format

```
Authorization: Bearer <token>
```

Two token types are accepted:

| Type | Format | How To Get |
|------|--------|-----------|
| **JWT Access Token** | `eyJhbG...` (base64 encoded) | From `POST /auth/login` response |
| **API Token** | `maof_` + 64 hex chars | From `POST /auth/api-tokens` or Dashboard Settings |

Both work identically on all protected endpoints. API tokens are recommended for bots and scripts because they don't expire every 15 minutes like JWTs.

### ngrok Header

When calling through ngrok, add this header to skip the browser warning page:
```
ngrok-skip-browser-warning: 1
```

## Response Format

All responses follow this envelope:

### Success
```json
{
  "success": true,
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable description"
  }
}
```

### Pagination

List endpoints that support pagination return:
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "meta": {
      "total": 42,
      "page": 1,
      "limit": 20,
      "pages": 3
    }
  }
}
```

Query parameters: `?page=1&limit=20`

---

## Health

### GET /health

Check if the API and its dependencies are running.

**Auth:** None

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-02-21T18:51:10.477Z",
    "version": "0.1.0",
    "services": {
      "database": "connected",
      "redis": "connected"
    }
  }
}
```

---

## Auth

### POST /auth/register

Create a new account.

**Auth:** None

**Body:**
```json
{
  "email": "user@example.com",
  "password": "YourPassword123",
  "name": "Your Name"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "userUuid": "d53471e9-...",
    "email": "user@example.com",
    "name": "Your Name",
    "role": "user",
    "createdAt": "2026-02-21T18:51:31.205Z"
  }
}
```

**Note:** Registration does not return tokens. You must call `/auth/login` separately.

---

### POST /auth/login

Get JWT tokens.

**Auth:** None

**Body:**
```json
{
  "email": "user@example.com",
  "password": "YourPassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "user": {
      "id": 1,
      "userUuid": "d53471e9-...",
      "email": "user@example.com",
      "name": "Your Name",
      "role": "user"
    }
  }
}
```

- `accessToken` expires in 15 minutes (configurable)
- `refreshToken` expires in 7 days (configurable)

---

### POST /auth/refresh

Get new tokens using a refresh token.

**Auth:** None

**Body:**
```json
{
  "refreshToken": "eyJhbG..."
}
```

**Response (200):** Same format as login.

---

### GET /auth/me

Get the current user's profile.

**Auth:** Required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "userUuid": "d53471e9-...",
    "email": "user@example.com",
    "name": "Your Name",
    "role": "user",
    "createdAt": "2026-02-21T..."
  }
}
```

---

### PATCH /auth/profile

Update the user's name.

**Auth:** Required

**Body:**
```json
{
  "name": "New Name"
}
```

---

### POST /auth/api-tokens

Create an API token for external access.

**Auth:** Required

**Body:**
```json
{
  "name": "Telegram Bot",
  "scopes": [],
  "expiresInDays": 90
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "token": "maof_3e2e77c8391e949734c391a6c4bd051c...",
    "metadata": {
      "tokenId": "bf286a80-...",
      "name": "Telegram Bot",
      "tokenPrefix": "maof_3e2e77c8",
      "scopes": [],
      "expiresAt": "2026-05-22T...",
      "createdAt": "2026-02-21T...",
      "revokedAt": null,
      "lastUsedAt": null
    }
  }
}
```

**The full token is shown only once.** Copy it immediately.

---

### GET /auth/api-tokens

List all API tokens for the current user.

**Auth:** Required

**Response (200):** Array of token metadata (without the full token value).

---

### DELETE /auth/api-tokens/:tokenId

Revoke an API token. It immediately stops working.

**Auth:** Required

---

## Teams

### POST /teams

Create a new team.

**Auth:** Required

**Body:**
```json
{
  "name": "Engineering",
  "description": "Backend team",
  "maxAgents": 10
}
```

---

### GET /teams

List all teams the user belongs to.

**Auth:** Required

---

### GET /teams/:teamUuid

Get details of a specific team.

**Auth:** Required

---

### POST /teams/:teamUuid/agents

Add an agent to a team.

**Auth:** Required

**Body:**
```json
{
  "agentUuid": "abc123-..."
}
```

---

### DELETE /teams/:teamUuid/agents/:agentUuid

Remove an agent from a team.

**Auth:** Required

---

### GET /teams/:teamUuid/agents

List all agents in a team.

**Auth:** Required

---

### POST /teams/:teamUuid/invitations

Create an invite code for the team.

**Auth:** Required

**Body:**
```json
{
  "role": "member",
  "maxUses": 10,
  "expiresInHours": 72
}
```

---

### GET /teams/:teamUuid/invitations

List all invitations for the team.

**Auth:** Required

---

### DELETE /teams/:teamUuid/invitations/:invitationUuid

Revoke an invitation.

**Auth:** Required

---

### POST /teams/join

Join a team using an invite code.

**Auth:** Required

**Body:**
```json
{
  "inviteCode": "a1b2c3d4"
}
```

---

## Kanban Tasks

All kanban endpoints are scoped to a team: `/teams/:teamUuid/kanban/...`

### POST /teams/:teamUuid/kanban/tasks

Create a task.

**Auth:** Required

**Body:**
```json
{
  "title": "Fix login bug",
  "description": "Users can't log in with special characters in passwords",
  "priority": "high",
  "tags": ["bug", "auth"],
  "assignedAgentUuid": "abc123-...",
  "dependsOn": ["upstream-task-uuid-1", "upstream-task-uuid-2"],
  "inputMapping": {
    "repoPath": "{{upstream-task-uuid-1.output.path}}",
    "findings": "{{upstream-task-uuid-2.output.findings}}"
  },
  "outputSchema": { "type": "object", "properties": { "fixed": { "type": "boolean" } } },
  "maxRetries": 3,
  "timeoutMs": 60000
}
```

Only `title` is required. Everything else is optional.

**Priority values:** `low`, `medium`, `high`, `critical`

**Dependency fields:**

| Field | Type | Description |
|-------|------|-------------|
| `dependsOn` | uuid[] | Task UUIDs this task depends on. Task stays in `backlog` until all are `done`. |
| `inputMapping` | object | Template object with `{{taskUuid.output.field}}` references. Resolved when all deps complete. |
| `outputSchema` | object | JSON Schema describing the expected structured output from this task. |
| `maxRetries` | integer | Max retry attempts on failure (0 = no retries, max 10). |
| `timeoutMs` | integer | Timeout in milliseconds (minimum 1000). Tasks exceeding this are auto-failed. |

---

### GET /teams/:teamUuid/kanban/tasks

List tasks on the board.

**Auth:** Required

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: `backlog`, `todo`, `in_progress`, `review`, `done` |
| `tag` | string | Filter by tag |
| `assignedAgentUuid` | string | Filter by assigned agent |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 50, max: 100) |

---

### PATCH /teams/:teamUuid/kanban/tasks/:taskUuid/status

Update a task's status (move it between columns).

**Auth:** Required

**Body:**
```json
{
  "status": "done",
  "result": "Optional result text",
  "output": { "path": "/tmp/repo", "commit": "abc123" }
}
```

**Status values:** `backlog`, `todo`, `in_progress`, `review`, `done`

The `output` field stores structured JSON data that downstream tasks can reference via input mappings. When a task moves to `done` with `output` set, any dependent tasks whose dependencies are now fully met are automatically promoted from `backlog` to `todo` with their input mappings resolved.

---

### GET /teams/:teamUuid/kanban/tasks/:taskUuid/context

Get the full dependency context for a task — all upstream tasks and their outputs.

**Auth:** Required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "task": {
      "taskUuid": "...",
      "title": "Write summary",
      "dependsOn": ["research-task-uuid"],
      "inputMapping": { "source": "{{research-task-uuid.output.content}}" }
    },
    "upstreamTasks": [
      {
        "taskUuid": "research-task-uuid",
        "title": "Research topic",
        "status": "done",
        "output": { "content": "AI in healthcare is..." },
        "result": "Research complete"
      }
    ],
    "resolvedInput": { "source": "AI in healthcare is..." }
  }
}
```

Useful for agents to understand the full context chain before starting work on a task.

---

### POST /teams/:teamUuid/kanban/tasks/:taskUuid/claim

Assign a task to an agent.

**Auth:** Required

**Body:**
```json
{
  "agentUuid": "abc123-..."
}
```

---

### GET /teams/:teamUuid/kanban/summary

Get task counts by status.

**Auth:** Required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "backlog": 3,
    "todo": 2,
    "in_progress": 1,
    "review": 0,
    "done": 5
  }
}
```

---

## Agents

### POST /agents/register

Register a new agent.

**Auth:** Required

**Body:**
```json
{
  "agentId": "research-bot-01",
  "name": "Research Bot",
  "endpoint": "https://my-agent.example.com/webhook",
  "authToken": "secret-token-for-agent",
  "capabilities": ["research", "web-search", "summarization"],
  "description": "Researches topics and produces summaries",
  "agentType": "generic",
  "createTeam": true,
  "teamName": "Research Team"
}
```

Required fields: `agentId`, `name`, `endpoint`, `authToken`

---

### GET /agents

List all registered agents.

**Auth:** Required

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `capability` | string | Filter by capability |
| `status` | string | Filter: `online`, `offline`, `degraded` |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

### GET /agents/:agentUuid

Get details of a specific agent.

**Auth:** Required

---

### DELETE /agents/:agentUuid

Delete an agent.

**Auth:** Required

---

### POST /agents/:agentUuid/health-check

Trigger a manual health check.

**Auth:** Required

---

### GET /agents/match/:capability

Find the best agent for a capability. Returns agents scored by capacity, response time, health, and recency.

**Auth:** Required

---

### GET /agents/:agentUuid/activity

Get an agent's execution history.

**Auth:** Required

**Query parameters:** `status`, `dateStart`, `dateEnd`, `page`, `limit`

---

## Workflows

### POST /workflows/execute

Submit a workflow for execution.

**Auth:** Required

**Body:**
```json
{
  "workflow": {
    "name": "Content Pipeline",
    "stages": [
      {
        "id": "research",
        "agentCapability": "research",
        "input": { "topic": "AI in Healthcare" }
      },
      {
        "id": "write",
        "agentCapability": "text-generation",
        "input": { "source": "${research.output}" },
        "dependsOn": ["research"]
      },
      {
        "id": "review",
        "agentCapability": "content-review",
        "input": { "draft": "${write.output}" },
        "dependsOn": ["write"]
      }
    ]
  },
  "input": {}
}
```

**Response (202):**
```json
{
  "success": true,
  "data": {
    "workflowRunId": "abc123-...",
    "status": "queued"
  }
}
```

Workflows execute asynchronously. Poll `/workflows/:runId` for status.

---

### GET /workflows

List workflow runs.

**Auth:** Required

**Query parameters:** `status`, `page`, `limit`

---

### GET /workflows/:runId

Get the status and progress of a workflow run.

**Auth:** Required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "workflowRunId": "abc123-...",
    "status": "in_progress",
    "progress": { "completed": 1, "total": 3 },
    "createdAt": "...",
    "completedAt": null
  }
}
```

---

### GET /workflows/:runId/result

Get the final output of a completed workflow.

**Auth:** Required

Returns 404 if the workflow hasn't completed yet.

---

### GET /workflows/:runId/audit

Get the execution trace (audit trail) for a workflow.

**Auth:** Required

---

### GET /workflows/:runId/audit/verify

Verify cryptographic signatures on audit log entries.

**Auth:** Required

---

## Templates

### GET /templates

List workflow templates.

**Auth:** Required

**Query parameters:** `category`, `search`, `page`, `limit`

---

### GET /templates/:templateUuid

Get a specific template.

**Auth:** Required

---

### POST /templates

Create a new template.

**Auth:** Required

**Body:**
```json
{
  "name": "Content Pipeline",
  "description": "Research, write, and review content",
  "category": "content",
  "definition": {
    "name": "Content Pipeline",
    "stages": [ ... ]
  },
  "isPublic": true,
  "tags": ["content", "writing"]
}
```

---

### POST /templates/:templateUuid/use

Run a template (starts a workflow).

**Auth:** Required

**Body:**
```json
{
  "input": { "topic": "AI in Healthcare" }
}
```

---

### PUT /templates/:templateUuid

Update a template.

**Auth:** Required

---

### DELETE /templates/:templateUuid

Delete a template.

**Auth:** Required

---

## Notifications

### GET /notifications

List notifications.

**Auth:** Required

**Query parameters:** `unreadOnly` (boolean), `page`, `limit`

---

### GET /notifications/unread

Get unread notification count.

**Auth:** Required

---

### PATCH /notifications/:uuid/read

Mark a single notification as read.

**Auth:** Required

---

### POST /notifications/read-all

Mark all notifications as read.

**Auth:** Required

---

## Messaging

### POST /teams/:teamUuid/messages

Send a message within a team.

**Auth:** Required

**Body:**
```json
{
  "fromAgentUuid": "abc123-...",
  "toAgentUuid": "def456-...",
  "messageType": "direct",
  "subject": "Task update",
  "content": "I've completed the research phase.",
  "metadata": {}
}
```

`messageType`: `direct`, `broadcast`, `system`

---

### GET /teams/:teamUuid/messages

List team messages.

**Auth:** Required

**Query parameters:** `workflowRunId`, `page`, `limit`

---

### GET /teams/:teamUuid/messages/inbox/:agentUuid

Get messages for a specific agent.

**Auth:** Required

**Query parameters:** `messageType`, `unreadOnly`, `page`, `limit`

---

### PATCH /teams/:teamUuid/messages/:messageUuid/read

Mark a message as read.

**Auth:** Required

---

## Analytics

### GET /analytics/teams/:teamUuid/overview

Quick stats: agent count, task count, workflow count.

**Auth:** Required

---

### GET /analytics/teams/:teamUuid/tasks

Task metrics by status, average completion time.

**Auth:** Required

**Query parameters:** `dateStart`, `dateEnd`

---

### GET /analytics/teams/:teamUuid/agents

Agent utilization stats.

**Auth:** Required

---

### GET /analytics/teams/:teamUuid/timeseries

Daily task/workflow trends.

**Auth:** Required

**Query parameters:** `days` (default: 30)

---

### GET /analytics/workflows

Workflow success rates.

**Auth:** Required

**Query parameters:** `dateStart`, `dateEnd`

---

## Agent-Ops (Autonomous Agent API)

These endpoints are designed for autonomous agents operating inside MAOF. See the [Agent Operations Guide](./06-agent-operations.md) for full details.

### GET /agent-ops/protocol

Get the operating protocol (machine-readable instructions for agents).

**Auth:** None

---

### GET /agent-ops/agents/:uuid/context

Get the agent's full operational context (team, tasks, inbox).

**Auth:** Required

---

### GET /agent-ops/agents/:uuid/tasks

List tasks for this agent.

**Auth:** Required

**Query parameters:** `filter` (`available`, `assigned`, `all`)

---

### POST /agent-ops/agents/:uuid/tasks/:taskUuid/start

Claim and start a task.

**Auth:** Required

---

### POST /agent-ops/agents/:uuid/tasks/:taskUuid/complete

Complete a task with result and optional structured output.

**Auth:** Required

**Body:**
```json
{
  "result": "Research complete — found 5 sources on AI in healthcare",
  "review": false,
  "output": {
    "sources": ["source1.com", "source2.com"],
    "wordCount": 1500,
    "summary": "AI is transforming healthcare through..."
  }
}
```

- `result` — human-readable summary of the work
- `review` — set to `true` to move to `review` instead of `done`
- `output` — structured JSON data for downstream task consumption via input mappings

When a task completes with `output`, any downstream tasks whose dependencies are now fully met are automatically promoted from `backlog` to `todo` with their input mappings resolved.

---

### POST /agent-ops/agents/:uuid/tasks/:taskUuid/fail

Report a task failure. If the task has `maxRetries > 0` and hasn't exhausted its retry count, it will be re-queued as `todo` for another attempt. Otherwise, it moves to `backlog` as a dead letter.

**Auth:** Required

**Body:** `{ "error": "Could not access the research database — connection timed out" }`

The error message is stored in the task's `lastError` field. The `retryCount` is incremented on each failure.

---

### POST /agent-ops/agents/:uuid/tasks/:taskUuid/progress

Report progress on a task. Emits a `task:progress` WebSocket event for real-time UI updates.

**Auth:** Required

**Body:**
```json
{
  "step": 3,
  "total": 10,
  "message": "Analyzing source 3 of 10"
}
```

- `step` — current step number (0+)
- `total` — total number of steps (1+)
- `message` — optional human-readable progress description

---

### POST /agent-ops/agents/:uuid/delegate

Create a subtask for another agent (agent-to-agent delegation). The subtask is tagged with the required capability for auto-matching.

**Auth:** Required

**Body:**
```json
{
  "title": "Translate research to Spanish",
  "description": "Translate the research findings from the upstream task",
  "capability": "text-generation",
  "priority": "high",
  "dependsOn": ["upstream-task-uuid"],
  "inputMapping": { "content": "{{upstream-task-uuid.output.summary}}" },
  "outputSchema": { "type": "object", "properties": { "translation": { "type": "string" } } },
  "maxRetries": 2,
  "timeoutMs": 120000
}
```

Required fields: `title`, `capability`. Everything else is optional.

The subtask is created on the delegating agent's team board. If `dependsOn` has unmet dependencies, the task starts in `backlog`; otherwise it starts in `todo`.

---

### POST /agent-ops/agents/:uuid/broadcast

Broadcast a message to all team agents.

**Auth:** Required

**Body:** `{ "subject": "...", "content": "...", "metadata": {} }`

---

### POST /agent-ops/agents/:uuid/message

Send a direct message to another agent.

**Auth:** Required

**Body:** `{ "toAgentUuid": "...", "subject": "...", "content": "...", "metadata": {} }`

---

### GET /agent-ops/agents/:uuid/inbox

Read inbox messages.

**Auth:** Required

**Query parameters:** `markAsRead` (boolean), `limit` (1-100, default: 20)

---

### POST /agent-ops/agents/:uuid/status

Report agent status.

**Auth:** Required

**Body:** `{ "status": "online|degraded|offline", "details": "..." }`

---

## Memory Store

Key-value store scoped to workflow runs. Used by agents to share state between stages.

### POST /memory/:workflowRunId

Write a value.

**Auth:** Required

**Body:** `{ "key": "research_results", "value": { ... }, "ttlSeconds": 3600 }`

---

### GET /memory/:workflowRunId/:key

Read a value.

**Auth:** Required

---

### DELETE /memory/:workflowRunId/:key

Delete a key.

**Auth:** Required

---

### GET /memory/:workflowRunId

List all keys in a workflow's memory.

**Auth:** Required

---

## Webhooks

Register HTTP endpoints to receive real-time notifications when events happen in your team.

### POST /teams/:teamUuid/webhooks

Register a new webhook.

**Auth:** Required

**Body:**
```json
{
  "url": "https://your-server.com/webhook",
  "events": ["task:completed", "task:failed", "task:unblocked"],
  "description": "Notify our monitoring system"
}
```

Required fields: `url`, `events` (at least one event type).

A signing secret is auto-generated. Each delivery includes an `X-MAOF-Signature` header containing an HMAC-SHA256 signature of the payload, so you can verify the delivery came from MAOF.

**Response (201):**
```json
{
  "success": true,
  "data": {
    "webhookUuid": "...",
    "url": "https://your-server.com/webhook",
    "secret": "whsec_...",
    "events": ["task:completed", "task:failed", "task:unblocked"],
    "active": true,
    "description": "Notify our monitoring system"
  }
}
```

**Save the `secret`** — you'll need it to verify incoming webhook signatures.

---

### GET /teams/:teamUuid/webhooks

List all webhooks for the team.

**Auth:** Required

---

### PATCH /teams/:teamUuid/webhooks/:webhookUuid

Update a webhook (change URL, events, active status, or description).

**Auth:** Required

**Body (all fields optional):**
```json
{
  "url": "https://new-url.com/webhook",
  "events": ["task:completed"],
  "active": false,
  "description": "Updated description"
}
```

---

### DELETE /teams/:teamUuid/webhooks/:webhookUuid

Delete a webhook. Stops all future deliveries.

**Auth:** Required

---

### GET /teams/:teamUuid/webhooks/:webhookUuid/deliveries

List delivery history for a webhook. Useful for debugging failed deliveries.

**Auth:** Required

**Query parameters:** `limit` (1-100, default: 20)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "deliveryUuid": "...",
      "eventType": "task:completed",
      "status": "success",
      "responseCode": 200,
      "attempts": 1,
      "createdAt": "2026-02-22T..."
    }
  ]
}
```

Delivery statuses: `pending`, `success`, `failed`, `dead_letter`

Failed deliveries are retried with exponential backoff (up to 5 attempts, max 1 hour between retries).

---

## Cost Metrics

Track token usage, cost, and latency across agents and workflows.

### POST /metrics

Record a metric entry. Used by agents and internal systems to log execution costs.

**Auth:** Required

**Body:**
```json
{
  "taskUuid": "...",
  "agentUuid": "...",
  "teamUuid": "...",
  "workflowRunId": "...",
  "stageId": "research",
  "agentId": "research-bot-01",
  "tokensUsed": 1500,
  "promptTokens": 1000,
  "completionTokens": 500,
  "costCents": 3,
  "latencyMs": 2400,
  "queueWaitMs": 150,
  "provider": "openai",
  "model": "gpt-4",
  "capability": "research",
  "metadata": { "topic": "AI in Healthcare" }
}
```

All fields are optional. Include whatever is relevant to the execution.

---

### GET /teams/:teamUuid/metrics/cost

Get aggregated cost summary for a team.

**Auth:** Required

**Query parameters:** `days` (1-365, default: 30)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalCostCents": 450,
    "totalTokens": 125000,
    "totalPromptTokens": 80000,
    "totalCompletionTokens": 45000,
    "avgLatencyMs": 1850,
    "executionCount": 42
  }
}
```

---

### GET /teams/:teamUuid/metrics/agents

Get per-agent cost breakdown for a team.

**Auth:** Required

**Query parameters:** `days` (1-365, default: 30)

Returns an array of cost summaries grouped by agent.

---

### GET /teams/:teamUuid/metrics/daily

Get daily cost time series for a team.

**Auth:** Required

**Query parameters:** `days` (1-365, default: 30)

Returns an array of daily buckets with cost, tokens, and execution counts.

---

### GET /workflows/:runId/metrics

Get per-stage cost breakdown for a specific workflow run.

**Auth:** Required

Returns cost metrics grouped by workflow stage.

---

## Built-in AI Status

### GET /ai/status

Get AI provider configuration and readiness.

**Auth:** Required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "dispatchMode": "mock",
    "providers": ["openai", "anthropic"],
    "hasAnyProvider": true,
    "defaultProvider": "openai",
    "capabilities": ["research", "text-generation", "code-review", "data-extraction", "content-writing"],
    "builtinReady": true
  }
}
```
