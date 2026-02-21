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
  "assignedAgentUuid": "abc123-..."
}
```

Only `title` is required. Everything else is optional.

**Priority values:** `low`, `medium`, `high`, `critical`

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
  "status": "in_progress",
  "result": "Optional result text (useful when moving to done)"
}
```

**Status values:** `backlog`, `todo`, `in_progress`, `review`, `done`

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

Complete a task.

**Auth:** Required

**Body:** `{ "result": "...", "review": false }`

---

### POST /agent-ops/agents/:uuid/tasks/:taskUuid/fail

Report a task failure.

**Auth:** Required

**Body:** `{ "error": "..." }`

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
