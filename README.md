# MAOF — Multi-Agent Orchestration Framework

A platform that lets you coordinate multiple AI agents (like ChatGPT, Claude, Gemini, or custom models) through automated workflows. Think of it as a "task manager" for AI — you define a pipeline of steps, and MAOF routes each step to the right AI agent, tracks progress, and logs everything.

## What Does This Actually Do?

Imagine you want to:
1. Take a document and have one AI **extract** key points
2. Then have another AI **translate** those points to Spanish
3. Then have a third AI **summarize** the translation

Instead of manually copying outputs between AI tools, MAOF handles the entire pipeline automatically. You submit one workflow, and it:
- Routes each step to an agent with the right capability
- Passes the output of one step as input to the next
- Tracks the status of every step in real-time
- Creates a tamper-evident audit trail of everything that happened

**Current Status:** This is the Phase 1 MVP skeleton. The workflow engine works with mock (simulated) agent responses. Real AI agent integration comes in Phase 2.

---

## Architecture Overview

```
                          +-------------------+
                          |    Dashboard      |  <-- What you see in the browser
                          |  (React + Vite)   |      Login, view agents, monitor workflows
                          |  localhost:5173    |
                          +--------+----------+
                                   |
                              HTTP requests
                                   |
                          +--------v----------+
                          |    API Server     |  <-- The brain of the system
                          |    (Fastify)      |      Handles auth, agents, workflows
                          |  localhost:3000    |
                          +---+----------+----+
                              |          |
                    +---------+          +----------+
                    |                               |
           +--------v--------+            +---------v--------+
           |   PostgreSQL    |            |     Redis        |
           |   (Database)    |            |   (Job Queue)    |
           |   port 5432     |            |   port 6379      |
           +-----------------+            +------------------+
           Stores users, agents,          Manages async workflow
           workflows, audit logs          execution via BullMQ
```

### The Three Parts

| Part | What It Does | Where It Lives |
|------|-------------|----------------|
| **API** (`apps/api/`) | Backend server — handles all logic, auth, database, job processing | `http://localhost:3000` |
| **Dashboard** (`apps/dashboard/`) | Web interface — login, view agents, monitor workflows | `http://localhost:5173` |
| **Shared Types** (`packages/shared/`) | TypeScript types shared between API and Dashboard | (build-time only) |

### How a Workflow Runs

```
1. You submit a workflow via the API (or dashboard in future)
        |
2. API validates it and saves to database (status: "queued")
        |
3. API puts a job on the Redis queue (BullMQ)
        |
4. The worker picks up the job and processes each stage:
        |
   For each stage:
     a. Create stage_execution record (status: "in_progress")
     b. Find an agent with the right capability
     c. Send the work to the agent (currently mocked)
     d. Save the output
     e. Log it to the audit trail with SHA-256 hashes
     f. Pass output to the next stage
        |
5. When all stages complete, workflow status becomes "completed"
        |
6. You can retrieve the final result anytime
```

---

## Prerequisites

You need these installed on your computer before starting:

### 1. Node.js (version 20 or higher)

Check if you have it:
```bash
node --version
# Should show v20.x.x or higher
```

If not installed: Download from [nodejs.org](https://nodejs.org/) (pick the LTS version).

### 2. pnpm (package manager)

Check if you have it:
```bash
pnpm --version
# Should show 9.x.x or higher
```

If not installed:
```bash
npm install -g pnpm
```

### 3. Docker and Docker Compose

Check if you have it:
```bash
docker --version
docker compose version
```

If not installed: Download [Docker Desktop](https://www.docker.com/products/docker-desktop/) for your operating system. Docker Compose comes bundled with Docker Desktop.

---

## Getting Started (Step by Step)

### Step 1: Clone the project

```bash
git clone https://github.com/mrx-arafat/Multi-Agent-Orchestration.git
cd Multi-Agent-Orchestration
```

### Step 2: Create your environment file

```bash
cp .env.example .env
```

This creates a `.env` file with all the configuration. The defaults work for local development — **you don't need to change anything** for a local setup.

> **Important:** If you ever deploy this to a real server, you MUST change `MAOF_JWT_SECRET` to a random string of at least 32 characters.

### Step 3: Start the databases

```bash
docker compose up -d
```

This starts two services in the background:
- **PostgreSQL** (database) on port 5432
- **Redis** (job queue) on port 6379

Verify they're running:
```bash
docker compose ps
```

You should see both `maof-postgres` and `maof-redis` with status "running" or "healthy".

### Step 4: Install dependencies

```bash
pnpm install
```

This downloads all the libraries the project needs. It may take a minute the first time.

### Step 5: Run database migrations

```bash
pnpm db:migrate
```

This creates all the database tables (users, agents, workflows, etc.).

### Step 6: Start the API server

```bash
pnpm dev
```

You should see:
```
Server listening at http://127.0.0.1:3000
🚀 MAOF API server started
```

### Step 7: Start the Dashboard (in a new terminal)

Open a **new terminal window/tab**, navigate to the project folder, and run:

```bash
cd Multi-Agent-Orchestration
pnpm --filter dashboard dev
```

You should see:
```
VITE v6.x.x ready in XXms
➜  Local: http://localhost:5173/
```

### Step 8: Open the Dashboard

Open your browser and go to: **http://localhost:5173**

You'll see a login page. Since this is a fresh setup, you need to create an account first.

---

## Using the Dashboard

### Create an Account

1. On the login page, click **"Create one"**
2. Fill in your name, email, and password (min 8 characters)
3. Click Register
4. You'll be redirected back to login — enter your credentials

### What You'll See

- **Overview** — Shows total agents, online agents, workflow runs, and failure rate
- **Agents** — Lists all registered AI agents with their capabilities and status
- **Workflows** — Shows all workflow runs with their status (queued, in progress, completed, failed)

---

## Using the API Directly

You can also interact with MAOF entirely through the API using `curl` or any HTTP client (Postman, Insomnia, etc.).

### 1. Create an Account

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword","name":"Your Name"}'
```

### 2. Login (get your token)

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}'
```

Copy the `accessToken` from the response. You'll need it for all other requests.

### 3. Register an AI Agent

```bash
curl -X POST http://localhost:3000/agents/register \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-summarizer",
    "name": "Text Summarizer",
    "endpoint": "http://localhost:9001/agent",
    "authToken": "agent-secret-key",
    "capabilities": ["summarization", "text-generation"]
  }'
```

### 4. Submit a Workflow

```bash
curl -X POST http://localhost:3000/workflows/execute \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "name": "my-first-pipeline",
      "stages": [
        {
          "id": "step-1",
          "name": "Extract Key Points",
          "agentCapability": "text-generation"
        },
        {
          "id": "step-2",
          "name": "Summarize Results",
          "agentCapability": "summarization",
          "dependencies": ["step-1"]
        }
      ]
    },
    "input": {
      "text": "Your input text goes here..."
    }
  }'
```

This returns a `workflowRunId`. Save it.

### 5. Check Workflow Status

```bash
curl http://localhost:3000/workflows/YOUR_WORKFLOW_RUN_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 6. Get the Result

```bash
curl http://localhost:3000/workflows/YOUR_WORKFLOW_RUN_ID/result \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 7. View the Audit Trail

```bash
curl http://localhost:3000/workflows/YOUR_WORKFLOW_RUN_ID/audit \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## All API Endpoints

| Method | Endpoint | Auth? | Description |
|--------|----------|-------|-------------|
| `GET` | `/health` | No | Health check — shows database and Redis status |
| `POST` | `/auth/register` | No | Create a new user account |
| `POST` | `/auth/login` | No | Login and get JWT tokens |
| `POST` | `/auth/refresh` | No | Get new tokens using a refresh token |
| `GET` | `/auth/me` | Yes | Get current user info |
| `POST` | `/agents/register` | Yes | Register a new AI agent |
| `GET` | `/agents` | Yes | List all agents (filter: `?capability=x&status=y`) |
| `GET` | `/agents/:uuid` | Yes | Get details of a specific agent |
| `DELETE` | `/agents/:uuid` | Yes | Remove an agent (only by the owner) |
| `POST` | `/workflows/execute` | Yes | Submit a new workflow for execution |
| `GET` | `/workflows` | Yes | List all your workflow runs (filter: `?status=completed`) |
| `GET` | `/workflows/:runId` | Yes | Get workflow status and progress |
| `GET` | `/workflows/:runId/result` | Yes | Get the final output of a completed workflow |
| `GET` | `/workflows/:runId/audit` | Yes | Get the audit trail for a workflow |

**Auth?** = Requires `Authorization: Bearer <token>` header.

---

## Project Structure

```
Multi-Agent-Orchestration/
│
├── apps/
│   ├── api/                          # Backend API
│   │   ├── src/
│   │   │   ├── app.ts                # App setup (plugins, routes)
│   │   │   ├── server.ts             # Server entry point
│   │   │   ├── config/               # Environment config + validation
│   │   │   ├── db/
│   │   │   │   ├── schema/           # Database table definitions
│   │   │   │   │   ├── users.ts      # Users table
│   │   │   │   │   ├── agents.ts     # AI agents table
│   │   │   │   │   ├── workflow-runs.ts
│   │   │   │   │   ├── stage-executions.ts
│   │   │   │   │   └── execution-logs.ts  # Audit log table
│   │   │   │   └── migrate.ts        # Database migration runner
│   │   │   ├── modules/
│   │   │   │   ├── auth/             # Authentication (register, login, JWT)
│   │   │   │   ├── agents/           # Agent management (CRUD)
│   │   │   │   ├── workflows/        # Workflow execution & tracking
│   │   │   │   └── audit/            # Audit trail
│   │   │   ├── plugins/              # Fastify plugins
│   │   │   │   ├── authenticate.ts   # JWT middleware
│   │   │   │   ├── database.ts       # PostgreSQL + Redis connection
│   │   │   │   ├── error-handler.ts  # Global error handling
│   │   │   │   ├── cors.ts           # CORS configuration
│   │   │   │   └── queue.ts          # BullMQ job queue
│   │   │   └── queue/
│   │   │       ├── workflow-queue.ts  # Queue definition
│   │   │       └── workflow-worker.ts # Worker that processes workflows
│   │   ├── tests/                    # Integration tests (44 tests)
│   │   ├── drizzle/                  # Database migration SQL files
│   │   └── drizzle.config.ts         # Drizzle ORM configuration
│   │
│   └── dashboard/                    # Frontend Web App
│       └── src/
│           ├── pages/
│           │   ├── LoginPage.tsx      # Login form
│           │   ├── DashboardPage.tsx  # Overview with stats
│           │   ├── AgentsPage.tsx     # Agent registry table
│           │   └── WorkflowsPage.tsx  # Workflow runs table
│           ├── components/
│           │   ├── Layout.tsx         # Sidebar navigation
│           │   └── ProtectedRoute.tsx # Auth guard
│           └── lib/
│               ├── api.ts            # API client (fetch wrapper)
│               └── auth-context.tsx   # Auth state management
│
├── packages/
│   └── shared/                       # Shared TypeScript types
│       └── src/types/                # API, Agent, Workflow, Auth types
│
├── docker-compose.yml                # PostgreSQL + Redis containers
├── .env.example                      # Environment variable template
└── package.json                      # Root scripts
```

---

## Common Commands

| Command | What It Does |
|---------|-------------|
| `pnpm dev` | Start the API server |
| `pnpm --filter dashboard dev` | Start the dashboard |
| `pnpm test` | Run all tests |
| `pnpm build` | Build all packages for production |
| `pnpm db:generate` | Generate new migration after schema changes |
| `pnpm db:migrate` | Apply pending database migrations |
| `pnpm docker:up` | Start PostgreSQL and Redis |
| `pnpm docker:down` | Stop PostgreSQL and Redis |
| `pnpm docker:logs` | View database/Redis logs |
| `pnpm lint` | Run ESLint code checks |
| `pnpm format` | Auto-format all code with Prettier |

---

## Stopping Everything

```bash
# Stop the API server: press Ctrl+C in its terminal

# Stop the dashboard: press Ctrl+C in its terminal

# Stop the databases:
docker compose down

# To also delete all data (start fresh):
docker compose down -v
```

---

## Troubleshooting

### "Port 3000 already in use"
Something else is using port 3000. Either stop that process or change `MAOF_PORT` in `.env`.

### "Port 5432 already in use"
You might have another PostgreSQL running. Stop it, or change the port in `docker-compose.yml`.

### "Cannot connect to database"
Make sure Docker is running and the containers are up:
```bash
docker compose ps
docker compose up -d
```

### "pnpm: command not found"
Install pnpm: `npm install -g pnpm`

### "docker: command not found"
Install Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/).

### Tests are failing
Make sure the test database exists and Docker containers are running:
```bash
docker compose up -d
pnpm db:migrate
pnpm test
```

### Dashboard shows "Failed to load data"
The API server must be running on port 3000 before you open the dashboard.

---

## Tech Stack

| Technology | Why We Use It |
|-----------|---------------|
| **Node.js** | JavaScript runtime — runs the server |
| **TypeScript** | Adds type safety to JavaScript — catches bugs before they run |
| **Fastify** | Web framework — handles HTTP requests (2x faster than Express) |
| **PostgreSQL** | Database — stores users, agents, workflows, audit logs |
| **Redis** | In-memory store — manages the job queue for async workflow execution |
| **BullMQ** | Job queue library — handles running workflows in the background |
| **Drizzle ORM** | Database toolkit — type-safe SQL queries without writing raw SQL |
| **React** | Frontend library — builds the dashboard UI |
| **Vite** | Build tool — serves and bundles the dashboard (extremely fast) |
| **Tailwind CSS** | CSS framework — utility classes for styling without writing CSS files |
| **Vitest** | Test runner — runs integration tests |
| **Docker** | Containerization — runs PostgreSQL and Redis without installing them directly |
| **JWT** | JSON Web Tokens — secure authentication (login sessions) |
| **bcrypt** | Password hashing — stores passwords securely (never as plain text) |
| **pnpm** | Package manager — installs dependencies (faster, uses less disk than npm) |

---

## What's Next (Roadmap)

| Phase | Features |
|-------|----------|
| **Phase 1** (current) | Project skeleton, auth, agent CRUD, workflow engine (mock), dashboard, audit trail |
| **Phase 2** | Real AI agent integration, agent health monitoring, retry logic, WebSocket live updates |
| **Phase 3** | Kubernetes deployment, distributed tracing, Prometheus metrics, rate limiting |
| **Phase 4** | gRPC support, parallel stage execution, multi-tenancy |

---

## Author

**Easin Arafat** — [@mrx-arafat](https://github.com/mrx-arafat)

## License

Apache-2.0
