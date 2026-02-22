# 5. Bot Integration Guide

How to connect a Telegram bot (or any AI assistant) to the MAOF platform so it can manage teams, tasks, workflows, and agents on behalf of a user.

## How It Works

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────┐
│ Telegram  │────►│ Your Bot │────►│  MAOF API    │────►│ Database │
│   User    │◄────│ (AI/LLM) │◄────│  (Fastify)   │◄────│ + Redis  │
└──────────┘     └──────────┘     └──────────────┘     └──────────┘
                  Uses curl/HTTP
                  to call the API
```

The bot acts as a **user proxy** — it uses the user's API token to call the MAOF API on their behalf. The bot doesn't have its own identity on the platform. It's the user, talking through the bot.

## What You Need

1. **MAOF platform running** — see [Setup Guide](./02-setup-guide.md)
2. **A user account** — registered on the dashboard
3. **An API token** — created in Settings → API Access
4. **The API URL** — reachable from where the bot runs
5. **The bot** — any AI assistant with the ability to execute HTTP requests (curl, fetch, etc.)

---

## Step-by-Step Setup

### Step 1: Make The API Reachable

If your bot runs on the same machine as the API:
```
API URL: http://localhost:3000
```

If your bot runs on a different machine (VPS, cloud):
- You need to expose the API via a tunnel (ngrok, Cloudflare Tunnel) or deploy it to a public server
- See the [Setup Guide](./02-setup-guide.md#exposing-the-api-to-the-internet) for tunnel instructions

Example with ngrok:
```
API URL: https://abcd-1234.ngrok-free.app
```

### Step 2: Create A User Account

If you haven't already:

1. Open the dashboard (http://localhost:5173)
2. Register an account
3. Log in

Or via API:
```bash
# Register
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPassword","name":"Your Name"}'

# Login
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPassword"}'
```

### Step 3: Create An API Token

**From the dashboard:**

1. Go to Settings → API Access
2. Enter a name like "Telegram Bot"
3. Set expiration (90 days recommended)
4. Click Create Token
5. **Copy the token immediately** — it's shown only once

**From the API (using your JWT from login):**

```bash
curl -s -X POST http://localhost:3000/auth/api-tokens \
  -H "Authorization: Bearer YOUR_JWT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Telegram Bot","expiresInDays":90}'
```

The response includes the full token (starts with `maof_`). Save it.

### Step 4: Test The Connection

Verify the token works:

```bash
curl -s http://YOUR_API_URL/auth/me \
  -H "Authorization: Bearer maof_YOUR_TOKEN" \
  -H "ngrok-skip-browser-warning: 1"
```

You should see your user profile. If you get 401, the token is wrong or expired.

### Step 5: Tell The Bot

Send your bot the following message (adjust the URL and token):

```
You have access to the MAOF (Multi-Agent Orchestration Framework) platform.

API URL: https://YOUR-TUNNEL-URL.ngrok-free.app
API Token: maof_YOUR_TOKEN_HERE

Use curl via your exec/shell tool to call the API. Every request needs these headers:
  Authorization: Bearer maof_YOUR_TOKEN_HERE
  ngrok-skip-browser-warning: 1
  Content-Type: application/json  (for POST/PATCH/PUT requests)

Start by calling GET /auth/me to verify the connection.
```

The bot should now be able to call the API.

---

## Full System Prompt For The Bot

For the best experience, give the bot comprehensive knowledge of the platform. Copy and paste the following as the bot's system prompt or as a message:

```
You have access to the MAOF platform via HTTP API. You act on behalf of the user — managing their teams, tasks, agents, workflows, and notifications.

CONNECTION:
- API URL: https://YOUR-URL.ngrok-free.app
- API Token: maof_YOUR_TOKEN

Every HTTP request must include:
  -H "Authorization: Bearer maof_YOUR_TOKEN"
  -H "ngrok-skip-browser-warning: 1"
POST/PATCH/PUT requests also need:
  -H "Content-Type: application/json"

FIRST THING: Call GET /auth/me to verify the connection. Then GET /teams to see the user's teams.

RESPONSE FORMAT:
All responses are JSON: {"success": true, "data": {...}} or {"success": false, "error": {"code": "...", "message": "..."}}.

CORE ENDPOINTS:

Identity:
  GET /auth/me                                      → Current user profile
  GET /auth/api-tokens                              → List API tokens

Teams:
  GET /teams                                        → List teams
  POST /teams                                       → Create team (body: {name, description?, maxAgents?})
  GET /teams/:teamUuid                              → Team details
  GET /teams/:teamUuid/agents                       → List agents in team
  POST /teams/:teamUuid/agents                      → Add agent to team (body: {agentUuid})

Kanban Tasks:
  POST /teams/:teamUuid/kanban/tasks                → Create task (body: {title, description?, priority?, tags?, assignedAgentUuid?, dependsOn?, inputMapping?, outputSchema?, maxRetries?, timeoutMs?})
  GET /teams/:teamUuid/kanban/tasks                 → List tasks (?status=backlog|todo|in_progress|review|done&tag=x&page=1&limit=50)
  PATCH /teams/:teamUuid/kanban/tasks/:taskUuid/status → Update status (body: {status, result?, output?})
  POST /teams/:teamUuid/kanban/tasks/:taskUuid/claim   → Assign to agent (body: {agentUuid})
  GET /teams/:teamUuid/kanban/tasks/:taskUuid/context  → Get dependency context (upstream outputs + resolved inputs)
  GET /teams/:teamUuid/kanban/summary               → Task counts by status

Workflows:
  POST /workflows/execute                           → Run workflow (body: {workflow: {name, stages[]}, input?})
  GET /workflows                                    → List runs (?status=x&page=1&limit=20)
  GET /workflows/:runId                             → Run status/progress
  GET /workflows/:runId/result                      → Final output (404 if not done)

Agents:
  POST /agents/register                             → Register agent (body: {agentId, name, endpoint, authToken, capabilities?})
  GET /agents                                       → List agents (?capability=x&status=online&page=1&limit=20)
  GET /agents/:agentUuid                            → Agent details
  DELETE /agents/:agentUuid                         → Remove agent

Templates:
  GET /templates                                    → List templates (?category=x&search=x)
  POST /templates/:templateUuid/use                 → Run template (body: {input?})
  POST /templates                                   → Create template (body: {name, definition, description?, category?, isPublic?, tags?})

Notifications:
  GET /notifications                                → List notifications (?unreadOnly=true)
  POST /notifications/read-all                      → Mark all read

Webhooks:
  POST /teams/:teamUuid/webhooks                    → Register webhook (body: {url, events[], description?})
  GET /teams/:teamUuid/webhooks                     → List team webhooks
  PATCH /teams/:teamUuid/webhooks/:webhookUuid      → Update webhook (body: {url?, events?, active?, description?})
  DELETE /teams/:teamUuid/webhooks/:webhookUuid      → Delete webhook
  GET /teams/:teamUuid/webhooks/:webhookUuid/deliveries → Delivery history (?limit=20)

Cost Metrics:
  POST /metrics                                     → Record metric (body: {taskUuid?, agentUuid?, teamUuid?, tokensUsed?, costCents?, latencyMs?, provider?, model?})
  GET /teams/:teamUuid/metrics/cost                 → Team cost summary (?days=30)
  GET /teams/:teamUuid/metrics/agents               → Per-agent cost breakdown (?days=30)
  GET /teams/:teamUuid/metrics/daily                → Daily cost time-series (?days=30)
  GET /workflows/:runId/metrics                     → Workflow cost breakdown

WORKFLOW STAGES FORMAT:
Each stage in a workflow has:
  - id: unique identifier (string)
  - agentCapability: what agent type is needed (string)
  - input: data for the agent (object)
  - dependsOn: array of stage IDs this stage waits for (optional)

Stages without dependsOn run in parallel.

TASK DEPENDENCIES (Context Chaining):
Tasks can depend on other tasks via "dependsOn" (array of task UUIDs). Dependent tasks stay in backlog until all upstream tasks are done. Use "inputMapping" with templates like {{taskUuid.output.fieldName}} to pass data between tasks.
When moving a task to "done", include "output" (JSON object) alongside "result" (text) so downstream tasks can consume structured data.

BEHAVIOR:
1. Verify connection with GET /auth/me on first use
2. Cache teamUuid after calling GET /teams — most operations need it
3. Resolve names to UUIDs silently (don't ask the user for UUIDs)
4. Summarize responses in readable format — don't dump raw JSON
5. Confirm before destructive actions (delete, revoke)
6. Workflows are async — after execute, poll GET /workflows/:runId until status is "completed"
7. Priority values: low, medium, high, critical
8. Status values: backlog, todo, in_progress, review, done
9. When creating task chains, use dependsOn to wire dependencies and inputMapping to pass data
10. Use GET .../tasks/:taskUuid/context to inspect dependency graph before starting dependent tasks
```

---

## How The Bot Should Handle Common Requests

### "Show my tasks"

```
1. GET /teams → get teamUuid
2. GET /teams/:teamUuid/kanban/tasks → get tasks
3. Format as a readable list with title, status, priority, assignee
```

### "Create a task called X"

```
1. GET /teams → get teamUuid (use cached if available)
2. POST /teams/:teamUuid/kanban/tasks with {title: "X"}
3. Confirm: "Created task 'X' in backlog"
```

### "Move task X to done"

```
1. GET /teams/:teamUuid/kanban/tasks → find task by title
2. PATCH /teams/:teamUuid/kanban/tasks/:taskUuid/status with {status: "done"}
3. Confirm: "Moved 'X' to Done"
```

### "What's the board status?"

```
1. GET /teams/:teamUuid/kanban/summary
2. Format as a table: Backlog: N, Todo: N, In Progress: N, Review: N, Done: N
```

### "Run a workflow"

```
1. POST /workflows/execute with workflow definition
2. Save the runId
3. Confirm: "Workflow started (run ID: xxx). I'll check on it."
4. When asked: GET /workflows/:runId for status
5. When done: GET /workflows/:runId/result for output
```

### "List my agents"

```
1. GET /agents → get all agents
   OR
   GET /teams/:teamUuid/agents → get team agents
2. Format: name, type, capabilities, status
```

### "Any notifications?"

```
1. GET /notifications?unreadOnly=true
2. If none: "No unread notifications"
3. If some: list them, offer to mark all read
```

### "Create a task chain where A feeds into B"

```
1. GET /teams → get teamUuid
2. POST /teams/:teamUuid/kanban/tasks → create task A (e.g., research)
3. Note task A's UUID from the response
4. POST /teams/:teamUuid/kanban/tasks → create task B with:
   {
     "title": "Write article",
     "dependsOn": ["<task-A-uuid>"],
     "inputMapping": { "researchData": "{{<task-A-uuid>.output.findings}}" }
   }
5. Confirm: "Created task chain: 'Research' → 'Write article'. Task B will auto-start when A completes."
```

### "Set up a webhook for task notifications"

```
1. GET /teams → get teamUuid
2. POST /teams/:teamUuid/webhooks with:
   { "url": "https://user-server.com/webhook", "events": ["task:completed", "task:failed"] }
3. Save the secret from the response
4. Confirm: "Webhook registered. Deliveries will be signed with the secret. Save it for verification."
```

### "How much have my agents cost this month?"

```
1. GET /teams → get teamUuid
2. GET /teams/:teamUuid/metrics/cost?days=30
3. Format: "Total cost: $X.XX, Total tokens: N, Average latency: Nms, Executions: N"
4. Optionally: GET /teams/:teamUuid/metrics/agents for per-agent breakdown
```

### "Show webhook delivery history"

```
1. GET /teams/:teamUuid/webhooks → list webhooks
2. GET /teams/:teamUuid/webhooks/:webhookUuid/deliveries
3. Format as a table: event type, status, response code, attempts, timestamp
```

---

## Two Connection Methods

### Method A: HTTP / curl (Simplest)

The bot uses its shell/exec tool to run `curl` commands against the API. This is what we demonstrated above. Works with any bot that can execute commands.

**Pros:** No extra setup, works immediately, bot just needs `exec` access.

**Cons:** Bot has to construct curl commands for every call.

### Method B: MCP Bridge (Native Tool Integration)

The MCP bridge exposes the entire MAOF API as 25-35 native MCP tools. Instead of constructing curl commands, the bot calls tools like `teams_list`, `kanban_create_task`, etc.

**Pros:** Cleaner integration, typed parameters, better error handling.

**Cons:** Requires MCP-compatible bot and config file access.

#### MCP Bridge Setup

1. Build the bridge:
```bash
cd Multi-Agent-Orchestration
pnpm --filter @maof/mcp-bridge build
```

2. Add to your bot's MCP config (e.g., `openclaw.json` or `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "maof": {
      "command": "node",
      "args": ["/absolute/path/to/Multi-Agent-Orchestration/packages/mcp-bridge/dist/index.js"],
      "env": {
        "MAOF_API_URL": "http://localhost:3000",
        "MAOF_API_TOKEN": "maof_YOUR_TOKEN"
      }
    }
  }
}
```

3. The bot now has 25 tools available:

| Tool | What It Does |
|------|-------------|
| `whoami` | Get current user profile |
| `list_api_tokens` | List API tokens |
| `teams_list` | List teams |
| `teams_create` | Create a team |
| `teams_get` | Get team details |
| `teams_list_agents` | List agents in a team |
| `teams_add_agent` | Add agent to a team |
| `kanban_create_task` | Create a kanban task |
| `kanban_list_tasks` | List tasks (with filters) |
| `kanban_update_status` | Move a task between columns |
| `kanban_claim_task` | Assign a task to an agent |
| `kanban_summary` | Task counts by status |
| `workflow_execute` | Run a workflow |
| `workflow_list` | List workflow runs |
| `workflow_status` | Check workflow progress |
| `workflow_result` | Get workflow output |
| `agents_register` | Register a new agent |
| `agents_list` | List agents |
| `agents_get` | Get agent details |
| `agents_delete` | Remove an agent |
| `templates_list` | Browse templates |
| `templates_use` | Run a template |
| `templates_create` | Save a template |
| `notifications_list` | List notifications |
| `notifications_mark_all_read` | Clear all notifications |

If `MAOF_AGENT_UUID` is also set, 10 additional agent-ops tools are available (35 total). See [Agent Operations Guide](./06-agent-operations.md).

---

## Token Management

### Token Expiration

API tokens expire after the number of days you set when creating them. When a token expires:
- The bot gets 401 errors on every call
- Create a new token from the dashboard (Settings → API Access)
- Send the new token to the bot

### Token Revocation

If a token is compromised:
1. Go to Dashboard → Settings → API Access
2. Click Revoke on the compromised token
3. Create a new one
4. Update the bot with the new token

### Security

- **Never share your token publicly** (chat logs, screenshots, public repos)
- **Use one token per bot** — if you have multiple bots, create a token for each
- **Revoke unused tokens** — if you stop using a bot, revoke its token
- **The token has full access** to your account — anything you can do on the dashboard, the bot can do with the token

---

## Troubleshooting

### Bot gets "Connection refused"

The API isn't reachable from where the bot runs. If the bot is on a remote server:
- Use ngrok or Cloudflare Tunnel to expose the API
- Make sure the tunnel is running

### Bot gets 401 Unauthorized

- Token is wrong — double-check you copied the full `maof_...` string
- Token expired — create a new one from the dashboard
- Token revoked — create a new one

### Bot gets 404 Not Found

- Wrong endpoint path — check the [API Reference](./04-api-reference.md)
- Common mistake: using `/api/auth/me` instead of `/auth/me` (no `/api` prefix when calling the API directly)
- Missing `/status` suffix on task updates: must be `/kanban/tasks/:id/status`, not `/kanban/tasks/:id`

### Bot gets ngrok HTML page instead of JSON

Add the `ngrok-skip-browser-warning: 1` header to every request.

### Bot creates tasks in wrong team

The bot needs to resolve the correct `teamUuid`. Make sure it calls `GET /teams` first and picks the right one.
