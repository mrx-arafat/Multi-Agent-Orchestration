# 3. Dashboard Guide

The web dashboard is the main interface for managing your MAOF platform. Open it at **http://localhost:5173**.

## Registration & Login

### Creating An Account

1. Open http://localhost:5173
2. Click **Register** on the login page
3. Fill in:
   - **Name** — your display name
   - **Email** — must be unique
   - **Password** — your password
4. Click **Register**
5. You'll be redirected to the login page

### Logging In

1. Enter your email and password
2. Click **Sign In**
3. You're taken to the Dashboard page

Your session is stored in the browser. You'll stay logged in until you log out or your token expires (7 days).

---

## Dashboard Page (Home)

**Route:** `/dashboard`

The home page shows an overview of your platform:

- **4 Stat Cards** — Total agents (and how many are online), total workflows (with success rate), number of teams, currently running workflows
- **Quick Actions** — Buttons to create a workflow, browse templates, register an agent, or create a team
- **Getting Started Tips** — Shown when you're new and haven't created anything yet

---

## Teams

### Teams List Page

**Route:** `/teams`

Shows all teams you belong to. From here you can:

- **Create a Team** — Click the "Create Team" button. Enter a name and optional description.
- **Join a Team** — Click "Join Team", enter the 8-character invite code someone shared with you.
- **Open a Team** — Click on a team card to see its details.

### Team Detail Page

**Route:** `/teams/:teamUuid`

Shows everything about a specific team. Has three tabs:

#### Agents Tab
Lists all agents assigned to this team. You can:
- See each agent's name, capabilities, status, and type
- Remove an agent from the team

#### Invitations Tab
Manage invite codes for this team:
- **Create Invitation** — generates an 8-character code. Set max uses and expiry time.
- **Copy Code** — click to copy the invite code
- **Revoke** — disable an invitation

#### Settings Tab
Team configuration (name, description).

---

## Kanban Board

**Route:** `/teams/:teamUuid/kanban`

The task board is the core of day-to-day work. It has 5 columns:

```
Backlog → Todo → In Progress → Review → Done
```

### Creating a Task

1. Click **New Task** at the top
2. Fill in:
   - **Title** (required)
   - **Description** (optional)
   - **Priority** — Low, Medium, High, or Critical
   - **Tags** — comma-separated labels
3. Click **Create**

The task appears in the **Backlog** column.

### Moving Tasks

**Drag and drop** a task card from one column to another. The task's status updates automatically.

You can also click on a task card to open its detail view and change the status from there.

### Task Priority Colors

| Priority | Color |
|----------|-------|
| Critical | Red |
| High | Orange |
| Medium | Yellow |
| Low | Blue |

### Assigning Tasks to Agents

Click on a task → select an agent from the assignment dropdown. Only agents in the same team are shown.

---

## Agents

**Route:** `/agents`

### Agent Types

| Type | Badge Color | How It Works |
|------|------------|-------------|
| **Built-in** | Violet ("AI Built-in") | Uses OpenAI, Claude, or Gemini APIs. No external server needed. |
| **Generic** | Gray ("HTTP") | You provide an HTTP endpoint. MAOF POSTs tasks to it. |
| **OpenClaw** | Sky blue ("OpenClaw") | Webhook-based agents. |

### Registering an Agent

1. Click **Register Agent**
2. Fill in:
   - **Agent ID** — unique identifier (e.g., `my-research-bot`)
   - **Name** — display name
   - **Endpoint URL** — where to send tasks (for generic/openclaw types)
   - **Auth Token** — authentication token for the endpoint
   - **Capabilities** — what the agent can do (comma-separated, e.g., `research, summarization`)
   - **Create Team** — optionally create a new team for this agent
3. Click **Register**

### Agent Status

| Status | Meaning |
|--------|---------|
| Online (green dot) | Agent responded to last health check |
| Degraded (yellow dot) | Agent responded slowly or with errors |
| Offline (red dot) | Agent didn't respond to health check |

### Health Checks

Click the **Health Check** button on an agent card to manually trigger a check. The platform also runs automatic health checks every 5 minutes (configurable via `MAOF_HEALTH_CHECK_INTERVAL_MS`).

---

## Workflows

**Route:** `/workflows`

### What's a Workflow?

A workflow is a multi-step pipeline. Each step (stage) is executed by an agent with a matching capability. Stages can depend on each other or run in parallel.

### Viewing Workflow Runs

The workflows page lists all runs with:
- **Status** — Queued, In Progress, Completed, Failed
- **Progress** — how many stages are done
- **Created At** — when it was submitted
- **Completed At** — when it finished (if done)

Click on a run to see stage-by-stage details and the final output.

### Workflow Editor

**Route:** `/workflow-editor`

A visual builder for creating workflows:

1. **Add Stages** — each stage has an ID, a required capability, and input data
2. **Set Dependencies** — a stage can depend on another stage (runs after it completes)
3. **Variable Interpolation** — reference outputs from earlier stages with `${stageId.output.field}`
4. **Preview JSON** — see the raw workflow definition
5. **Execute** — run the workflow immediately
6. **Save as Template** — save for reuse

Stages without dependencies run in parallel automatically.

---

## Templates

**Route:** `/templates`

Pre-built workflow definitions you can reuse.

### Browsing Templates

- Filter by **category**
- **Search** by name or description
- Each template card shows name, description, category, and tags

### Using a Template

1. Click **Use Template** on a card
2. Optionally provide input data
3. Click **Execute**
4. A new workflow run starts — check it on the Workflows page

### Creating a Template

1. Build a workflow in the **Workflow Editor**
2. Click **Save as Template**
3. Add a name, description, category, and tags
4. Choose whether it's public (visible to all users)

---

## Chat / Messaging

**Route:** `/teams/:teamUuid/chat`

Inter-agent messaging within a team. Shows:
- **Broadcast messages** — sent to all agents in the team
- **Direct messages** — between specific agents
- **System messages** — automated notifications

Useful for monitoring how agents communicate during workflow execution.

---

## Analytics

**Route:** `/analytics`

Team performance metrics:

- **Overview** — agent count, task count, workflow count
- **Task Metrics** — tasks by status, average completion time
- **Agent Utilization** — how busy each agent is
- **Time Series** — 30-day trends (tasks created/completed per day)

Select a team from the dropdown to view its analytics.

---

## Settings

**Route:** `/settings`

### Profile Tab

- View your email and role
- Edit your display name (click the pencil icon)

### API Access Tab

This is where you create tokens for external access (bots, scripts, CI/CD).

#### Creating an API Token

1. Enter a **name** (e.g., "Telegram Bot", "CI Pipeline")
2. Select **expiration** — 30, 90, 180, or 365 days
3. Click **Create Token**
4. **Copy the token immediately** — it starts with `maof_` and is shown only once

Example token:
```
maof_a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234
```

#### Managing Tokens

- See all active tokens with their prefix, creation date, and expiry
- **Revoke** a token if it's compromised or no longer needed (requires confirmation)
- Revoked tokens immediately stop working

#### Endpoint Reference

The settings page includes a built-in API endpoint reference showing key endpoints, methods, and descriptions.

---

## Navigation

The sidebar contains links to all pages:

| Icon | Page | Description |
|------|------|-------------|
| Dashboard | `/dashboard` | Home overview |
| Teams | `/teams` | Team management |
| Agents | `/agents` | Agent registry |
| Workflows | `/workflows` | Workflow runs |
| Templates | `/templates` | Template gallery |
| Analytics | `/analytics` | Performance metrics |
| Settings | `/settings` | Profile and API tokens |

Team-specific pages (Kanban, Chat) are accessed by clicking into a team first.
