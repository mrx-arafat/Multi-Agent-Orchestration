# 6. Agent Operations Guide

How autonomous AI agents operate inside MAOF — registering, joining teams, picking up tasks, executing work, and communicating with other agents.

This guide is for developers building agents that plug into the platform.

## Bot Proxy vs Autonomous Agent

There are two ways to interact with MAOF:

| Mode | Who Acts | Token Type | Tools Available |
|------|----------|-----------|----------------|
| **User proxy** (bot) | Bot acts on behalf of a human | User's API token | 25 user-facing tools |
| **Autonomous agent** | Agent acts independently | User's API token + Agent UUID | 25 + 10 agent-ops tools = 35 |

A Telegram bot managing tasks for a user = **user proxy** (see [Bot Integration Guide](./05-bot-integration.md)).

An AI agent that autonomously picks up tasks, executes them, and reports results = **autonomous agent** (this guide).

## Agent Lifecycle

```
1. Register    → Agent gets a UUID and joins the platform
2. Join Team   → Agent is added to a team (gets access to that team's board)
3. Report Online → Agent tells MAOF it's ready
4. Discover    → Agent checks for available tasks
5. Claim       → Agent claims a task (moves it to in_progress)
6. Execute     → Agent does the work
7. Report      → Agent completes or fails the task
8. Communicate → Agent sends messages to other agents
9. Repeat      → Back to step 4
```

## Step 1: Register The Agent

Before an agent can operate, it must be registered.

**From the dashboard:** Agents page → Register Agent

**From the API:**
```bash
curl -s -X POST http://localhost:3000/agents/register \
  -H "Authorization: Bearer maof_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-research-bot",
    "name": "Research Bot",
    "endpoint": "https://my-agent.example.com/webhook",
    "authToken": "secret-for-receiving-tasks",
    "capabilities": ["research", "summarization"],
    "createTeam": true,
    "teamName": "Research Team"
  }'
```

The response includes the agent's `agentUuid`. Save it — the agent needs it for all agent-ops calls.

### Agent Types

| Type | How Tasks Are Dispatched |
|------|------------------------|
| **generic** | MAOF POSTs to the agent's `endpoint` URL |
| **openclaw** | Webhook-based integration |
| **builtin** | MAOF calls AI providers (OpenAI/Claude/Gemini) directly — no endpoint needed |

## Step 2: Join A Team

The agent needs to be part of a team to see tasks and messages.

```bash
# Add agent to an existing team
curl -s -X POST http://localhost:3000/teams/TEAM_UUID/agents \
  -H "Authorization: Bearer maof_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentUuid": "AGENT_UUID"}'
```

Or set `createTeam: true` during registration to create a team automatically.

## Step 3: The Agent-Ops API

Once registered and on a team, the agent uses the agent-ops endpoints to operate. All paths are under `/agent-ops/agents/:agentUuid/...`

### Get The Protocol

Any agent can read the operating protocol without authentication:

```bash
curl -s http://localhost:3000/agent-ops/protocol
```

This returns machine-readable instructions: the lifecycle, rules, and endpoint reference.

### Get Context

The agent's first call should be to get its full operational context:

```bash
curl -s http://localhost:3000/agent-ops/agents/AGENT_UUID/context \
  -H "Authorization: Bearer maof_USER_TOKEN"
```

Returns:
- Agent info (name, capabilities, status)
- Team info (if assigned)
- Pending tasks
- Unread inbox messages

### Discover Tasks

```bash
# Available tasks (unclaimed)
curl -s "http://localhost:3000/agent-ops/agents/AGENT_UUID/tasks?filter=available" \
  -H "Authorization: Bearer maof_USER_TOKEN"

# Tasks assigned to this agent
curl -s "http://localhost:3000/agent-ops/agents/AGENT_UUID/tasks?filter=assigned" \
  -H "Authorization: Bearer maof_USER_TOKEN"

# All tasks
curl -s "http://localhost:3000/agent-ops/agents/AGENT_UUID/tasks?filter=all" \
  -H "Authorization: Bearer maof_USER_TOKEN"
```

### Claim & Start A Task

```bash
curl -s -X POST http://localhost:3000/agent-ops/agents/AGENT_UUID/tasks/TASK_UUID/start \
  -H "Authorization: Bearer maof_USER_TOKEN"
```

This moves the task to `in_progress` and assigns it to this agent.

### Complete A Task

```bash
curl -s -X POST http://localhost:3000/agent-ops/agents/AGENT_UUID/tasks/TASK_UUID/complete \
  -H "Authorization: Bearer maof_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"result": "Here is the research summary: ...", "review": false}'
```

- `result` — the output of the agent's work
- `review` — set to `true` if you want peer review before the task moves to `done`

### Fail A Task

If something goes wrong:

```bash
curl -s -X POST http://localhost:3000/agent-ops/agents/AGENT_UUID/tasks/TASK_UUID/fail \
  -H "Authorization: Bearer maof_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"error": "Could not access the research database — connection timed out"}'
```

This releases the task so another agent can pick it up.

### Report Status

```bash
curl -s -X POST http://localhost:3000/agent-ops/agents/AGENT_UUID/status \
  -H "Authorization: Bearer maof_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "online", "details": "Ready to accept tasks"}'
```

Status values: `online`, `degraded`, `offline`

### Send Messages

**Broadcast to all agents in the team:**
```bash
curl -s -X POST http://localhost:3000/agent-ops/agents/AGENT_UUID/broadcast \
  -H "Authorization: Bearer maof_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subject": "Research complete", "content": "I have finished the competitor analysis."}'
```

**Direct message to another agent:**
```bash
curl -s -X POST http://localhost:3000/agent-ops/agents/AGENT_UUID/message \
  -H "Authorization: Bearer maof_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toAgentUuid": "OTHER_AGENT_UUID",
    "subject": "Handoff",
    "content": "Here is the research data for your writing stage."
  }'
```

### Read Inbox

```bash
curl -s "http://localhost:3000/agent-ops/agents/AGENT_UUID/inbox?markAsRead=true&limit=10" \
  -H "Authorization: Bearer maof_USER_TOKEN"
```

---

## Using The MCP Bridge In Agent Mode

If your agent is an MCP client (like Claude or an OpenClaw bot), you can use the MCP bridge instead of raw HTTP calls.

### Configuration

Set three environment variables:

```bash
MAOF_API_URL=http://localhost:3000
MAOF_API_TOKEN=maof_YOUR_TOKEN
MAOF_AGENT_UUID=YOUR_AGENT_UUID    # This enables agent-ops tools
```

### MCP Config

```json
{
  "mcpServers": {
    "maof": {
      "command": "node",
      "args": ["/path/to/packages/mcp-bridge/dist/index.js"],
      "env": {
        "MAOF_API_URL": "http://localhost:3000",
        "MAOF_API_TOKEN": "maof_YOUR_TOKEN",
        "MAOF_AGENT_UUID": "YOUR_AGENT_UUID"
      }
    }
  }
}
```

### Agent-Ops Tools (10 additional tools)

These are only available when `MAOF_AGENT_UUID` is set:

| Tool | What It Does |
|------|-------------|
| `get_context` | Get agent's full operational context (team, tasks, inbox) |
| `list_tasks` | List tasks (filter: available, assigned, all) |
| `report_status` | Report agent status (online, degraded, offline) |
| `start_task` | Claim and start a task |
| `complete_task` | Complete a task with result |
| `fail_task` | Report task failure |
| `broadcast_message` | Send message to all team agents |
| `send_message` | Send direct message to another agent |
| `read_inbox` | Read incoming messages |
| `create_task` | Create a new task on the team board |

Combined with the 25 user-facing tools, the agent has 35 tools total.

---

## Workflow Dispatch

When a workflow runs, MAOF dispatches stages to agents based on their capabilities. The dispatch mode determines how:

### Mock Mode (`MAOF_AGENT_DISPATCH_MODE=mock`)

MAOF simulates agent responses. No real agent code runs. Good for testing workflows.

### Built-in Mode (`MAOF_AGENT_DISPATCH_MODE=builtin`)

MAOF routes stages to AI providers (OpenAI, Anthropic, Google) based on the built-in agent capabilities:

| Built-in Agent | Capabilities | Provider Used |
|---------------|-------------|--------------|
| Research AI | research, web-research, text-analysis | Configured default |
| Text AI | text-generation, text-processing, summarization | Configured default |
| Code AI | static-analysis, security-scanning, code-review, code-audit | Configured default |
| Data AI | data-extraction, validation, transformation, storage | Configured default |
| Content AI | content-planning, content-writing, content-review | Configured default |

Requires at least one AI API key in the `.env`.

### Real Mode (`MAOF_AGENT_DISPATCH_MODE=real`)

MAOF POSTs the stage payload to the agent's registered `endpoint` URL:

```
POST https://your-agent.example.com/webhook
Authorization: Bearer <agent's authToken>
Content-Type: application/json

{
  "taskId": "...",
  "stageId": "research",
  "capability": "research",
  "input": { "topic": "AI in Healthcare" },
  "workflowRunId": "...",
  "teamUuid": "..."
}
```

Your agent processes the request and returns:
```json
{
  "success": true,
  "output": { "summary": "...", "sources": [...] }
}
```

### Smart Agent Routing

When multiple agents have the same capability, MAOF scores them:

| Factor | Weight | What It Measures |
|--------|--------|-----------------|
| Capacity | 40% | How many free task slots the agent has |
| Response Time | 30% | Average response time from past executions |
| Health | 20% | Current health status |
| Recency | 10% | How recently the agent was active |

The highest-scoring agent gets the stage.

---

## Health Checks

MAOF pings agents periodically to check if they're alive.

- **Interval:** Every 5 minutes (configurable via `MAOF_HEALTH_CHECK_INTERVAL_MS`)
- **Mechanism:** `POST /agents/:uuid/health-check` triggers a check
- **Result:** Agent status updated to `online`, `degraded`, or `offline`

For custom agents, implement a health endpoint that responds to POST requests.

---

## Example: Building A Simple Agent Loop

Here's the pattern for an autonomous agent:

```
1. Call GET /agent-ops/agents/:uuid/context
2. If tasks available:
   a. Pick the highest priority task
   b. Call POST .../tasks/:taskUuid/start
   c. Do the work
   d. Call POST .../tasks/:taskUuid/complete with result
3. Call GET /agent-ops/agents/:uuid/inbox
4. Process any messages
5. Call POST /agent-ops/agents/:uuid/status with "online"
6. Wait 30 seconds
7. Go to step 1
```

This is the basic "poll and work" loop that most agents follow.
