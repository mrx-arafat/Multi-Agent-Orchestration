# MAOF User Manual

**Multi-Agent Orchestration Framework** — Your command center for building, managing, and orchestrating teams of AI agents.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Managing Agents](#3-managing-agents)
4. [Working with Teams](#4-working-with-teams)
5. [Kanban Board (Task Management)](#5-kanban-board)
6. [Agent Messaging](#6-agent-messaging)
7. [Workflows](#7-workflows)
8. [Workflow Editor](#8-workflow-editor)
9. [Templates](#9-templates)
10. [Analytics](#10-analytics)
11. [Notifications](#11-notifications)
12. [Settings](#12-settings)
13. [Webhooks](#13-webhooks)
14. [Agent Operations (A2A Protocol)](#14-agent-operations-a2a-protocol)
15. [Real-Time Events (WebSocket)](#15-real-time-events)
16. [API Reference](#16-api-reference)
17. [Configuration](#17-configuration)
18. [Security](#18-security)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. Getting Started

### What is MAOF?

MAOF is a platform for orchestrating multiple AI agents. You can:

- **Register agents** (AI-powered HTTP services or built-in AI providers)
- **Organize agents into teams** with role-based access
- **Assign tasks** using Kanban boards with drag-and-drop
- **Run workflows** that chain multiple agents together
- **Enable agent-to-agent messaging** in real-time
- **Monitor everything** with analytics and notifications

### Creating Your Account

1. Open the MAOF dashboard in your browser.
2. Click **"Create one"** on the login page.
3. Fill in your **name**, **email**, and **password** (minimum 8 characters).
4. Click **"Create account"**.
5. You'll be redirected to the login page. Sign in with your new credentials.

### Signing In

1. Enter your **email** and **password**.
2. Click **"Sign in"**.
3. You'll land on the Dashboard overview page.

Your session uses JWT tokens that auto-refresh in the background. If your session expires, you'll be redirected to the login page automatically.

---

## 2. Dashboard Overview

The Dashboard is your home screen. It gives you a quick snapshot of your activity.

### Sidebar Navigation

The sidebar on the left contains all main sections:

| Section | Description |
|---------|-------------|
| **Overview** | Dashboard home with summary stats |
| **Agents** | Register and manage AI agents |
| **Teams** | Create and manage agent teams |
| **Workflows** | View and track workflow executions |
| **Templates** | Browse and create workflow templates |
| **Editor** | Visual workflow builder |
| **Analytics** | Charts and metrics for your teams |
| **Settings** | Profile, API tokens, and account management |

On mobile devices, tap the hamburger menu (three lines) in the top-left to open the sidebar.

### Status Indicator

At the bottom of the sidebar, you'll see:
- Your **name** and **email**
- A **Live/Offline** indicator showing your WebSocket connection status
- A **Sign out** button

---

## 3. Managing Agents

Agents are the workers in your orchestration system. Each agent has capabilities (things it can do) and connects to MAOF via an HTTP endpoint.

### Agent Types

| Type | Description | Example |
|------|-------------|---------|
| **AI Built-in** | Powered by AI providers (OpenAI, Claude, Gemini) already configured in MAOF | Text summarization, code review |
| **HTTP (Generic)** | Your own external service that speaks MAOF's agent protocol | Custom ML model, data pipeline |
| **OpenClaw** | OpenClaw-compatible webhook agents | Third-party integrations |

### Registering a New Agent

1. Go to **Agents** in the sidebar.
2. Click **"+ Register Agent"**.
3. Fill in the form:

| Field | Required | Description |
|-------|----------|-------------|
| Agent ID | Yes | A unique identifier (e.g., `my-code-reviewer`) |
| Name | Yes | Display name (e.g., "Code Review Agent") |
| Endpoint URL | Yes | The HTTP endpoint MAOF will call (e.g., `https://agent.example.com`) |
| Auth Token | Yes | A secret token MAOF uses to authenticate with your agent |
| Description | No | What this agent does |
| Capabilities | No | Comma-separated tags (e.g., `code.review, code.explain`) |
| Agent Type | No | Generic (default) or OpenClaw |

4. Optionally check **"Auto-create a team for this agent"** to set up a team immediately.
5. Click **"Register Agent"**.

### Agent Status

Each agent has a health status:

| Status | Meaning |
|--------|---------|
| **Online** (green pulse) | Agent is healthy and responding |
| **Degraded** (amber) | Agent is responding but reported issues |
| **Offline** (gray) | Agent is unreachable |

### Health Checks

- MAOF automatically pings agents every 5 minutes.
- To manually check an agent, hover over its card and click **"Ping"**.
- The health check calls `GET <agent-endpoint>/health` and expects a JSON response with `{ "status": "healthy" }`.

### Searching and Filtering

- Use the **search bar** to find agents by name, ID, or capability.
- Use the **status dropdown** to filter by Online, Degraded, or Offline.
- Results are paginated — use **Previous/Next** to navigate.

### Deleting an Agent

1. Hover over the agent card.
2. Click **"Delete"**.
3. Confirm in the dialog.

This is a soft delete — the agent is removed from all teams and marked as deleted.

### Agent Capabilities

Capabilities are tags that describe what an agent can do. They're used for:
- **Workflow stage matching**: MAOF auto-selects agents with the right capability.
- **Filtering**: Find agents by what they do.
- **Delegation**: Agents can delegate work to agents with specific capabilities.

Built-in capability categories:

| Category | Capabilities |
|----------|-------------|
| **Text** | `text.summarize`, `text.translate`, `text.sentiment`, `text.classify` |
| **Research** | `research.web_search`, `research.fact_check`, `research.compare` |
| **Content** | `content.blog_post`, `content.email`, `content.social_media` |
| **Code** | `code.review`, `code.generate`, `code.explain`, `code.refactor` |
| **Data** | `data.extract`, `data.transform`, `data.analyze` |

---

## 4. Working with Teams

Teams are the primary way to organize agents. All resources (tasks, messages, agents) are isolated within a team — agents in one team cannot see or interact with another team's data.

### Creating a Team

1. Go to **Teams** in the sidebar.
2. Click **"+ New Team"**.
3. Fill in:
   - **Team Name** (e.g., "Code Review Squad")
   - **Description** (optional)
   - **Max Agents** (1–50, default: 10)
4. Click **"Create Team"**.

You'll automatically become the **owner** of the team.

### Joining a Team

If someone has shared an invite code with you:

1. Go to **Teams**.
2. Click **"Join Team"**.
3. Enter the **invite code** (e.g., `a1b2c3d4`).
4. Click **"Join"**.

### Team Roles

| Role | Can Do |
|------|--------|
| **Owner** | Everything — manage members, agents, invites, settings, delete team |
| **Admin** | Manage most resources — add/remove agents, create tasks, send invites |
| **Member** | View and use team resources — view tasks, send messages, run workflows |

### Creating Invite Codes

As an owner or admin:

1. Open the team detail page (click on a team card).
2. In the **Invite Codes** section, click **"Generate Code"**.
3. Configure:
   - **Role**: What role new members get (member or admin)
   - **Max Uses**: How many times the code can be used (1–1000)
   - **Expiration**: How long the code is valid (1–8760 hours)
4. Share the generated code with others.

### Adding Agents to a Team

1. Open the team detail page.
2. In the **Agents** section, click **"Add Agent"**.
3. Select an agent from the dropdown.
4. The agent is now part of the team and can receive tasks and messages.

### Removing Agents

1. On the team detail page, find the agent.
2. Click the remove button next to the agent.
3. Confirm the removal.

---

## 5. Kanban Board

Each team has a Kanban board for managing tasks. Tasks flow through columns from left to right as work progresses.

### Accessing the Board

1. Open a team from the **Teams** page.
2. Click the **Kanban** link or navigate to the team's Kanban page.

### Board Columns

| Column | Color | Meaning |
|--------|-------|---------|
| **Backlog** | Slate | Tasks not yet scheduled |
| **To Do** | Blue | Ready to be picked up |
| **In Progress** | Amber | Agent is actively working |
| **Review** | Purple | Work done, awaiting review |
| **Done** | Green | Completed |

### Creating a Task

1. Click **"+ New Task"** at the top of the board.
2. Fill in:
   - **Title** (required)
   - **Priority**: Low, Medium, High, or Critical
   - **Description** (optional)
   - **Tags** (comma-separated, optional)
3. Click **"Add Task"**.

New tasks start in the **Backlog** column.

### Task Priority Levels

| Priority | Visual | Use When |
|----------|--------|----------|
| **Critical** | Red left border | Urgent, needs immediate attention |
| **High** | Orange left border | Important, should be done soon |
| **Medium** | Yellow left border | Standard priority (default) |
| **Low** | Blue left border | Nice to have, no rush |

### Moving Tasks (Drag and Drop)

- Click and drag any task card.
- Drop it into a different column to change its status.
- The change is saved automatically.
- A "Saving..." indicator appears while the update is in progress.

### Task Cards

Each card shows:
- **Title** and **priority badge**
- **Description** (truncated to 2 lines)
- **Tags** as small pills
- **Assigned agent** (if any) with their avatar and online status

---

## 6. Agent Messaging

Teams have a built-in chat system for agent-to-agent communication.

### Accessing Messages

1. Open a team from the **Teams** page.
2. Click the **Chat** link to open the messaging page.

### Sending a Message

1. At the bottom of the chat, select the **sending agent** from the dropdown.
2. Choose the message type:
   - **Broadcast**: Sends to all agents in the team.
   - **Direct**: Sends to one specific agent (select the recipient).
3. Type your message.
4. Click **Send** or press **Enter**.

### Message Display

- Each message shows the **sender's avatar**, **name**, and **timestamp** (on hover).
- **Broadcast** messages have a blue "broadcast" badge.
- **Direct** messages show "to [Agent Name]".
- Messages with a **subject** line display it in bold above the content.

### Real-Time Updates

Messages update in real-time via WebSocket. If the WebSocket disconnects, the page falls back to polling every 30 seconds.

### Agent Sidebar

The left sidebar in the chat shows all agents in the team with:
- Their **avatar** (first letter of name)
- Their **name**
- Their **status** (online/offline indicator)

---

## 7. Workflows

Workflows let you chain multiple agent capabilities together into automated pipelines. Each workflow is made up of **stages**, where each stage calls an agent with a specific capability.

### How Workflows Work

1. You define a workflow with one or more **stages**.
2. Each stage specifies a **capability** (e.g., `text.translate`).
3. Stages can **depend on other stages** — dependencies run first.
4. Stages without dependencies run **in parallel**.
5. Data flows between stages using **input mapping** (e.g., `${translate.output.translated}`).
6. MAOF automatically selects the best available agent for each stage.

### Workflow Lifecycle

```
Queued  -->  In Progress  -->  Completed
                           -->  Failed
```

| Status | Meaning |
|--------|---------|
| **Queued** | Submitted, waiting to start |
| **In Progress** | Stages are executing |
| **Completed** | All stages finished successfully |
| **Failed** | One or more stages failed after retries |

### Viewing Workflow Runs

1. Go to **Workflows** in the sidebar.
2. You'll see a list of all your workflow runs with their status.
3. Click on a run to see detailed stage-by-stage progress.

### Executing a Workflow

You can execute workflows in two ways:
- From the **Workflow Editor** (visual builder — see next section).
- From a **Template** (pre-built workflow — see Templates section).

### Retry Configuration

Each stage can have retry settings:

| Setting | Default | Description |
|---------|---------|-------------|
| **Max Retries** | 2 | How many times to retry on failure (0–10) |
| **Backoff (ms)** | 1000 | Wait time between retries (doubles each time) |
| **Timeout (ms)** | 30000 | Max time per agent call |

---

## 8. Workflow Editor

The Workflow Editor is a visual tool for building workflows by adding and connecting stages.

### Opening the Editor

Go to **Editor** in the sidebar.

### Building a Workflow

#### Step 1: Name Your Workflow
At the top, enter a name (e.g., "Content Generation Pipeline").

#### Step 2: Add Stages
Click **"+ Add Stage"** to add a new stage. Each stage has:

| Field | Description |
|-------|-------------|
| **Stage Name** | Display name (e.g., "Translate Text") |
| **Agent Capability** | Select from the dropdown (e.g., `text.translate`) |
| **Stage ID** | Unique identifier used for references (auto-generated) |
| **Dependencies** | Click other stages to make this stage wait for them |
| **Input Variables** | Key-value pairs — use `${workflow.input.field}` for workflow inputs or `${stageId.output.field}` for outputs from previous stages |
| **Retry Config** | Max retries, backoff time, timeout (under "Retry Configuration" toggle) |

#### Step 3: Arrange Stages
- Use the **up/down arrows** to reorder stages.
- Click the **expand/collapse** button to show/hide stage details.
- Click the **X** button to remove a stage.

#### Step 4: Check the Execution Flow
The **Execution Flow** bar shows how stages will run:
- Stages without dependencies run in **parallel** (shown with `||`).
- Stages with dependencies run **sequentially** (shown with arrows).

#### Step 5: Provide Input
On the right sidebar, enter **Workflow Input (JSON)** — this is the data passed to the first stage(s).

Example:
```json
{
  "text": "Hello, how are you?",
  "language": "es"
}
```

#### Step 6: Execute or Save

- **Execute Workflow**: Runs the workflow immediately with the provided input.
- **Save as Template**: Saves the workflow for reuse later.

### Quick Start Templates

The editor includes three pre-built templates you can load with one click:

| Template | Stages | Description |
|----------|--------|-------------|
| **Text Translation Pipeline** | 3 | Analyze sentiment, translate, then summarize |
| **Code Review Workflow** | 3 | Review code, explain issues, and refactor (review + refactor run in parallel) |
| **Research & Content Pipeline** | 4 | Web research, analyze data, write blog post, create social media posts |

### Summary Panel

The right sidebar shows:
- **Stages**: Total number of stages
- **Execution Levels**: How many sequential steps
- **Parallel Groups**: How many levels have parallel stages
- **Capabilities**: Number of unique capabilities used
- **Dependencies**: Total dependency connections

### JSON Preview

Click **"Show JSON"** to see the raw workflow definition that will be sent to the API. This is useful for debugging or copying to use programmatically.

---

## 9. Templates

Templates are saved workflow definitions that you can reuse.

### Browsing Templates

1. Go to **Templates** in the sidebar.
2. You'll see all available templates (your private ones + public ones).
3. Use the **search bar** to find templates by name.
4. Use the **category filter** to narrow by category.

### Creating a Template

1. Click **"+ New Template"**.
2. Fill in:
   - **Name** (required)
   - **Category** (e.g., "data-processing", "content", "code-review")
   - **Description** (optional)
   - **Tags** (comma-separated)
   - **Visibility**: Public (everyone can see) or Private (only you)
   - **Definition (JSON)**: The workflow definition
3. Click **"Create"**.

Alternatively, build a workflow in the **Editor** and click **"Save as Template"**.

### Using a Template

1. Find the template you want.
2. Click **"Use Template"**.
3. Provide any input data the workflow needs.
4. The workflow will be queued for execution.

### Managing Templates

- **Edit**: Click on a template to modify its name, description, definition, or visibility.
- **Delete**: Remove a template you own (or any template if you're an admin).

---

## 10. Analytics

The Analytics page gives you insights into your team's performance.

### Accessing Analytics

1. Go to **Analytics** in the sidebar.
2. Select a **team** from the dropdown (if you're in multiple teams).
3. Choose a **time range** (defaults to last 30 days).

### Available Metrics

#### Overview Cards
- **Total Agents**: How many agents are in the team
- **Total Tasks**: Number of tasks on the Kanban board
- **Workflows Run**: Number of workflow executions

#### Task Metrics
- **Completion rate**: Percentage of tasks that reached "Done"
- **Tasks by status**: Breakdown across all Kanban columns
- **Tasks by priority**: Distribution of Critical/High/Medium/Low

#### Agent Utilization
- **Tasks per agent**: How many tasks each agent has handled
- **Stages executed**: Workflow stages completed per agent
- **Average time**: How long agents take per task

#### Time Series
- **Daily task activity**: Tasks created and completed per day
- **Workflow activity**: Workflows started and completed per day

---

## 11. Notifications

MAOF sends notifications for important events. You'll see them via the bell icon in the sidebar.

### Notification Types

| Type | When It Fires |
|------|--------------|
| **Task Assigned** | A task is assigned to one of your agents |
| **Workflow Completed** | A workflow you started finishes successfully |
| **Workflow Failed** | A workflow you started fails |
| **Team Invite** | Someone invites you to a team |
| **Agent Offline** | An agent in your team goes offline |
| **Message Received** | A message is sent in your team |

### Viewing Notifications

1. Click the **bell icon** in the bottom-left sidebar.
2. Unread notifications have a blue dot.
3. The bell shows a **red badge** with the unread count.

### Managing Notifications

- **Mark as read**: Click on any unread notification.
- **Mark all as read**: Click "Mark all read" at the top of the notification panel.
- Notifications arrive in **real-time** via WebSocket.

---

## 12. Settings

The Settings page lets you manage your account, API tokens, and security.

### Profile Tab

- **Name**: Update your display name.
- **Email**: View your email (read-only).
- **Member since**: When your account was created.

### API Tokens Tab

API tokens let external systems authenticate with MAOF without using your email/password.

#### Creating a Token

1. Go to **Settings > API Tokens**.
2. Click **"Create Token"**.
3. Enter a **name** (e.g., "CI/CD Pipeline").
4. Optionally set an **expiration** (1–365 days).
5. Click **"Create"**.
6. **Copy the token immediately** — it's shown only once! The format is `maof_<64 hex characters>`.

#### Using a Token

Include it in the `Authorization` header:
```
Authorization: Bearer maof_abc123...
```

#### Revoking a Token

Click **"Revoke"** next to any token. Revoked tokens stop working immediately.

### AI Provider Status

Shows which AI providers are configured:
- **OpenAI** (GPT models)
- **Anthropic** (Claude models)
- **Google** (Gemini models)

And the current **dispatch mode**:
- **Real**: Agents are called via their HTTP endpoints
- **Mock**: Responses are simulated (for development)
- **Builtin**: Built-in AI providers handle all requests

### Danger Zone

- **Change Password**: Enter your current password and a new one (minimum 8 characters).
- **Delete Account**: Permanently removes your account. You'll be signed out immediately.

---

## 13. Webhooks

Webhooks let you receive HTTP callbacks when events happen in your team.

### Setting Up a Webhook

Use the API to create webhooks for a team:

```
POST /teams/:teamUuid/webhooks
```

Body:
```json
{
  "url": "https://your-server.com/webhook",
  "events": ["task:completed", "workflow:completed"],
  "description": "Notify our Slack channel"
}
```

### Supported Events

| Event | Fires When |
|-------|-----------|
| `task:created` | A new task is added to the Kanban board |
| `task:updated` | A task's status, assignment, or details change |
| `task:completed` | A task moves to "Done" |
| `workflow:started` | A workflow begins execution |
| `workflow:completed` | A workflow finishes successfully |
| `workflow:failed` | A workflow fails |
| `message:sent` | A message is sent in the team |

### Verifying Webhook Signatures

Every webhook delivery is signed with HMAC-SHA256. The signature is in the `X-MAOF-Signature` header:

```
X-MAOF-Signature: sha256=<hex-encoded-signature>
```

To verify:
1. Compute `HMAC-SHA256(webhook_secret, request_body)`.
2. Compare with the signature in the header.
3. Reject if they don't match.

### Delivery & Retries

- Webhooks are delivered with up to **5 retries** with exponential backoff.
- Failed deliveries are logged — check delivery history via the API.
- You can view delivery history at `GET /teams/:teamUuid/webhooks/:webhookUuid/deliveries`.

---

## 14. Agent Operations (A2A Protocol)

The Agent Operations API is designed for **agents themselves** to call. It provides a simplified, agent-friendly interface for the full task lifecycle.

### Protocol Discovery

Agents can discover how to interact with MAOF:

```
GET /agent-ops/protocol
```

This returns instructions, capabilities, and authentication requirements — no auth needed for this endpoint.

### Agent Lifecycle

#### 1. Get Context
```
GET /agent-ops/agents/:uuid/context
```
Returns everything the agent needs: its team, pending tasks, unread messages, and capabilities.

#### 2. Find Available Tasks
```
GET /agent-ops/agents/:uuid/tasks?filter=available
```
Returns tasks that match the agent's capabilities and aren't claimed by another agent.

#### 3. Start a Task
```
POST /agent-ops/agents/:uuid/tasks/:taskUuid/start
```
Claims the task and moves it to "In Progress".

#### 4. Report Progress
```
POST /agent-ops/agents/:uuid/tasks/:taskUuid/progress
Body: { "step": 3, "total": 5, "message": "Processing data..." }
```
Updates the progress bar visible in the dashboard.

#### 5. Complete or Fail
```
POST /agent-ops/agents/:uuid/tasks/:taskUuid/complete
Body: { "result": "Summary of work done", "output": { "data": "structured output" } }
```

Or on failure:
```
POST /agent-ops/agents/:uuid/tasks/:taskUuid/fail
Body: { "error": "Reason for failure" }
```

### Agent Communication

| Action | Endpoint | Body |
|--------|----------|------|
| Broadcast to team | `POST /agent-ops/agents/:uuid/broadcast` | `{ subject, content }` |
| Direct message | `POST /agent-ops/agents/:uuid/message` | `{ toAgentUuid, subject, content }` |
| Read inbox | `GET /agent-ops/agents/:uuid/inbox` | Query: `markAsRead, limit` |

### Delegating Work

Agents can create subtasks for other agents:

```
POST /agent-ops/agents/:uuid/delegate
Body: {
  "title": "Review this code",
  "capability": "code.review",
  "priority": "high"
}
```

MAOF will find an agent with the `code.review` capability and assign the task.

### Requesting Human Approval

When an agent needs human authorization before proceeding:

```
POST /agent-ops/agents/:uuid/request-approval
Body: {
  "title": "Deploy to production?",
  "description": "Agent wants to deploy v2.3.1",
  "context": { "version": "2.3.1", "changes": 42 }
}
```

A human can then approve or reject via the dashboard or API.

### Real-Time Event Streams

Agents can receive events in real-time using one of two methods:

**Server-Sent Events (SSE)**:
```
GET /agent-ops/agents/:uuid/events
```
- Persistent connection with automatic keepalive (30s heartbeat).
- Reconnect with `lastEventId` to resume without missing events.

**Long Polling**:
```
GET /agent-ops/agents/:uuid/events/poll?timeout=30000
```
- Blocks for up to `timeout` milliseconds waiting for events.
- Returns all pending events as a batch.

---

## 15. Real-Time Events

MAOF uses WebSockets to deliver events instantly to the dashboard and connected agents.

### How It Works

1. When you sign in, the dashboard opens a WebSocket connection.
2. The connection subscribes to your user channel and team channels.
3. Events (new messages, task updates, notifications) are pushed instantly.
4. If the connection drops, it **reconnects automatically** with exponential backoff.

### Connection Status

The **Live/Offline** indicator in the sidebar shows your WebSocket status:
- **Live** (green dot): Connected and receiving events
- **Offline** (gray dot): Disconnected (will auto-reconnect)

### What Events Are Delivered

| Event | Description |
|-------|-------------|
| `message:new` | New message in a team |
| `message:broadcast` | Broadcast message |
| `notification:new` | New notification for you |
| `task:updated` | Task status changed |
| `task:assigned` | Task assigned to an agent |
| `task:progress` | Agent reported progress on a task |
| `agent:status` | Agent went online/offline/degraded |
| `workflow:status` | Workflow status changed |
| `approval:requested` | Agent requested human approval |
| `approval:responded` | Human approved/rejected a gate |

---

## 16. API Reference

### Base URL

All API endpoints are prefixed with your MAOF server URL (e.g., `http://localhost:3000`).

### Authentication

All endpoints (except `/auth/register`, `/auth/login`, and `/agent-ops/protocol`) require:

```
Authorization: Bearer <access_token>
```

### Response Format

**Success**:
```json
{
  "success": true,
  "data": { ... }
}
```

**Error**:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `BAD_REQUEST` | 400 | Invalid input or missing required fields |
| `UNAUTHORIZED` | 401 | Missing or expired token |
| `FORBIDDEN` | 403 | You don't have permission for this action |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Duplicate resource (e.g., agent ID already taken) |
| `INTERNAL_ERROR` | 500 | Server error — try again later |

### Pagination

Most list endpoints support pagination:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | 1 | Page number (starts at 1) |
| `limit` | 20 | Items per page (max varies by endpoint, typically 100) |

Response includes:
```json
{
  "data": [...],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

### Endpoint Quick Reference

#### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Sign in (get tokens) |
| POST | `/auth/refresh` | Refresh tokens |
| GET | `/auth/me` | Get current user |
| PATCH | `/auth/profile` | Update profile |
| POST | `/auth/api-tokens` | Create API token |
| GET | `/auth/api-tokens` | List API tokens |
| DELETE | `/auth/api-tokens/:tokenId` | Revoke API token |

#### Agents
| Method | Path | Description |
|--------|------|-------------|
| POST | `/agents/register` | Register new agent |
| GET | `/agents` | List agents (filterable) |
| GET | `/agents/:agentUuid` | Get agent details |
| DELETE | `/agents/:agentUuid` | Delete agent |
| POST | `/agents/:agentUuid/health-check` | Manual health check |
| GET | `/agents/match/:capability` | Find agent for capability |
| GET | `/agents/:agentUuid/activity` | Agent activity history |

#### Teams
| Method | Path | Description |
|--------|------|-------------|
| POST | `/teams` | Create team |
| GET | `/teams` | List your teams |
| GET | `/teams/:teamUuid` | Get team details |
| POST | `/teams/:teamUuid/members` | Add member |
| POST | `/teams/:teamUuid/agents` | Add agent to team |
| DELETE | `/teams/:teamUuid/agents/:agentUuid` | Remove agent |
| GET | `/teams/:teamUuid/agents` | List team agents |
| POST | `/teams/:teamUuid/invitations` | Create invite |
| GET | `/teams/:teamUuid/invitations` | List invites |
| DELETE | `/teams/:teamUuid/invitations/:id` | Revoke invite |
| POST | `/teams/join` | Join with invite code |

#### Kanban
| Method | Path | Description |
|--------|------|-------------|
| POST | `/teams/:teamUuid/kanban/tasks` | Create task |
| GET | `/teams/:teamUuid/kanban/tasks` | List tasks |
| PATCH | `/teams/:teamUuid/kanban/tasks/:taskUuid/status` | Update status |
| POST | `/teams/:teamUuid/kanban/tasks/:taskUuid/claim` | Claim task |
| GET | `/teams/:teamUuid/kanban/tasks/:taskUuid/context` | Get task context |
| GET | `/teams/:teamUuid/kanban/summary` | Board summary |

#### Messaging
| Method | Path | Description |
|--------|------|-------------|
| POST | `/teams/:teamUuid/messages` | Send message |
| GET | `/teams/:teamUuid/messages` | List messages |
| GET | `/teams/:teamUuid/messages/inbox/:agentUuid` | Agent inbox |
| PATCH | `/teams/:teamUuid/messages/:messageUuid/read` | Mark as read |

#### Workflows
| Method | Path | Description |
|--------|------|-------------|
| POST | `/workflows/execute` | Execute workflow |
| GET | `/workflows` | List workflow runs |
| GET | `/workflows/:runId` | Get run status |
| GET | `/workflows/:runId/result` | Get run output |

#### Templates
| Method | Path | Description |
|--------|------|-------------|
| POST | `/templates` | Create template |
| GET | `/templates` | List templates |
| GET | `/templates/:templateUuid` | Get template |
| PUT | `/templates/:templateUuid` | Update template |
| DELETE | `/templates/:templateUuid` | Delete template |
| POST | `/templates/:templateUuid/use` | Execute from template |

#### Notifications
| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications` | List notifications |
| GET | `/notifications/unread` | Get unread count |
| PATCH | `/notifications/:uuid/read` | Mark read |
| POST | `/notifications/read-all` | Mark all read |

#### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| POST | `/teams/:teamUuid/webhooks` | Create webhook |
| GET | `/teams/:teamUuid/webhooks` | List webhooks |
| PATCH | `/teams/:teamUuid/webhooks/:id` | Update webhook |
| DELETE | `/teams/:teamUuid/webhooks/:id` | Delete webhook |
| GET | `/teams/:teamUuid/webhooks/:id/deliveries` | Delivery history |

#### Approvals
| Method | Path | Description |
|--------|------|-------------|
| POST | `/teams/:teamUuid/approvals` | Create approval gate |
| GET | `/teams/:teamUuid/approvals` | List gates |
| GET | `/teams/:teamUuid/approvals/:id` | Get gate |
| POST | `/teams/:teamUuid/approvals/:id/respond` | Approve/reject |

#### Analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/teams/:teamUuid/overview` | Team overview stats |
| GET | `/analytics/teams/:teamUuid/tasks` | Task metrics |
| GET | `/analytics/teams/:teamUuid/agents` | Agent utilization |
| GET | `/analytics/teams/:teamUuid/timeseries` | Time-series data |
| GET | `/analytics/workflows` | Workflow metrics |

---

## 17. Configuration

### Environment Variables

MAOF is configured through environment variables. Create a `.env` file in the project root.

#### Server
| Variable | Default | Description |
|----------|---------|-------------|
| `MAOF_PORT` | 3000 | Server port |
| `MAOF_HOST` | 0.0.0.0 | Server host |
| `MAOF_NODE_ENV` | development | Environment (development / production / test) |
| `MAOF_LOG_LEVEL` | info | Log level (debug / info / warn / error) |

#### Database (PostgreSQL)
| Variable | Default | Description |
|----------|---------|-------------|
| `MAOF_DB_HOST` | localhost | PostgreSQL host |
| `MAOF_DB_PORT` | 5432 | PostgreSQL port |
| `MAOF_DB_NAME` | maof | Database name |
| `MAOF_DB_USER` | postgres | Database user |
| `MAOF_DB_PASSWORD` | — | Database password |
| `MAOF_DB_POOL_MIN` | 2 | Minimum connection pool size |
| `MAOF_DB_POOL_MAX` | 20 | Maximum connection pool size |

#### Redis
| Variable | Default | Description |
|----------|---------|-------------|
| `MAOF_REDIS_HOST` | localhost | Redis host |
| `MAOF_REDIS_PORT` | 6379 | Redis port |
| `MAOF_REDIS_PASSWORD` | — | Redis password (optional) |

#### Authentication
| Variable | Default | Description |
|----------|---------|-------------|
| `MAOF_JWT_SECRET` | — | **Required**. JWT signing secret (min 32 characters) |
| `MAOF_JWT_ACCESS_EXPIRES_IN` | 15m | Access token lifetime |
| `MAOF_JWT_REFRESH_EXPIRES_IN` | 7d | Refresh token lifetime |

#### Agent Dispatch
| Variable | Default | Description |
|----------|---------|-------------|
| `MAOF_AGENT_DISPATCH_MODE` | mock | How agent calls are handled (real / mock / builtin) |
| `MAOF_AGENT_TOKEN_KEY` | — | 64 hex chars for AES-256 encryption of agent tokens |
| `MAOF_AGENT_CALL_TIMEOUT_MS` | 30000 | Default timeout for agent HTTP calls |
| `MAOF_HEALTH_CHECK_INTERVAL_MS` | 300000 | Health check interval (5 min default) |

#### AI Providers
| Variable | Default | Description |
|----------|---------|-------------|
| `MAOF_OPENAI_API_KEY` | — | OpenAI API key (optional) |
| `MAOF_ANTHROPIC_API_KEY` | — | Anthropic API key (optional) |
| `MAOF_GOOGLE_AI_API_KEY` | — | Google AI API key (optional) |
| `MAOF_DEFAULT_AI_PROVIDER` | openai | Default provider for built-in agents |

#### CORS
| Variable | Default | Description |
|----------|---------|-------------|
| `MAOF_CORS_ORIGINS` | http://localhost:5173 | Allowed origins (comma-separated) |

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** 16+
- **Redis** 7+
- **pnpm** (package manager)

### Running Locally

```bash
# Install dependencies
pnpm install

# Start the API server
pnpm --filter api dev

# Start the dashboard (in another terminal)
pnpm --filter dashboard dev
```

The dashboard will be available at `http://localhost:5173` and the API at `http://localhost:3000`.

---

## 18. Security

### Password Security
- Passwords require a minimum of **8 characters**.
- Stored using **bcrypt** with 12 salt rounds (never in plaintext).
- Change your password anytime in **Settings > Danger Zone**.

### Token Security
- **Access tokens** expire after 15 minutes.
- **Refresh tokens** expire after 7 days and rotate on each use.
- **API tokens** are stored as SHA-256 hashes — the plaintext is only shown once at creation.

### Agent Token Encryption
- Agent auth tokens are encrypted with **AES-256-GCM** before storage.
- The encryption key (`MAOF_AGENT_TOKEN_KEY`) must be set in production.

### Team Isolation
- All data is scoped to teams. Users and agents can only access teams they belong to.
- Agents in different teams cannot communicate with each other.
- Each team has its own Kanban board, message history, and webhook configuration.

### Webhook Signing
- Every webhook delivery is signed with **HMAC-SHA256**.
- Always verify the `X-MAOF-Signature` header before processing webhook payloads.

### Best Practices
1. **Use strong, unique passwords** for your account.
2. **Set expiration dates** on API tokens.
3. **Revoke tokens** you no longer need.
4. **Verify webhook signatures** in your receiving service.
5. **Use HTTPS** in production for all agent endpoints.
6. **Keep your `MAOF_JWT_SECRET`** and `MAOF_AGENT_TOKEN_KEY` secure and unique per environment.

---

## 19. Troubleshooting

### Common Issues

#### "Session expired. Please sign in again."
Your access token expired and couldn't be refreshed. This usually means:
- Your refresh token also expired (after 7 days of inactivity).
- **Fix**: Sign in again.

#### Agent shows "Offline" but it's running
- MAOF pings agents every 5 minutes. Your agent may have come online between checks.
- **Fix**: Click **"Ping"** on the agent card for an immediate health check.
- Make sure your agent responds to `GET /health` with `{ "status": "healthy" }`.

#### Workflow stuck in "Queued"
- The workflow queue depends on Redis and the background worker.
- **Fix**: Ensure Redis is running. Check the API server logs for queue errors.

#### Drag-and-drop not working on Kanban
- The board requires a minimum 8-pixel drag distance to activate.
- **Fix**: Click and drag more deliberately. Touch devices are supported.

#### WebSocket shows "Offline"
- The WebSocket auto-reconnects with increasing delay (up to 30 seconds).
- **Fix**: Check your network connection. The dashboard will automatically reconnect.

#### "Team has reached its maximum agents"
- Each team has a configurable agent limit (default: 10).
- **Fix**: Remove unused agents from the team, or ask the team owner to increase the max.

#### API returns 401 but my token looks correct
- Access tokens expire after 15 minutes.
- **Fix**: The dashboard handles this automatically. For API calls, use the refresh endpoint to get new tokens.

#### Webhook deliveries failing
- Check the delivery history for error details.
- Ensure your webhook URL is accessible from the MAOF server.
- Webhook deliveries retry up to 5 times with exponential backoff.

---

*MAOF v0.1 — Multi-Agent Orchestration Framework*
