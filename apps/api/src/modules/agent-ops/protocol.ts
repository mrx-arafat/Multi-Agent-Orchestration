/**
 * Agent Operations Protocol — machine-readable instructions for agents.
 *
 * This is the "instruction manual" that any agent (AI or otherwise) reads
 * to understand how to operate within the MAOF platform. Agents consume
 * this via GET /agent-ops/protocol.
 */

export interface AgentProtocol {
  version: string;
  description: string;
  baseUrl: string;
  authentication: {
    method: string;
    tokenHeader: string;
    tokenPrefix: string;
    registration: string;
  };
  lifecycle: AgentLifecycleStep[];
  capabilities: string[];
  taskStatuses: string[];
  messageTypes: string[];
  endpoints: AgentEndpointSpec[];
  operatingRules: string[];
}

export interface AgentLifecycleStep {
  step: number;
  phase: string;
  description: string;
  endpoint: string;
  method: string;
  required: boolean;
}

export interface AgentEndpointSpec {
  method: string;
  path: string;
  description: string;
  category: string;
  requestBody?: Record<string, unknown>;
  responseExample?: Record<string, unknown>;
}

export function buildAgentProtocol(baseUrl: string, capabilities: string[]): AgentProtocol {
  return {
    version: '1.0.0',
    description:
      'MAOF Agent Operations Protocol. This document describes how autonomous agents ' +
      'register, discover work, claim tasks, execute stages, communicate with peers, ' +
      'and report results within the Multi-Agent Orchestration Framework.',
    baseUrl,
    authentication: {
      method: 'Bearer token (JWT or API token)',
      tokenHeader: 'Authorization',
      tokenPrefix: 'Bearer',
      registration:
        'Agents need a user account. Register via POST /auth/register, then login via ' +
        'POST /auth/login to obtain JWT tokens. Use the access token for all subsequent requests. ' +
        'For long-lived machine auth, create an API token via the Settings page.',
    },

    lifecycle: [
      {
        step: 1,
        phase: 'REGISTER',
        description:
          'Register yourself as an agent. Provide your capabilities (what you can do), ' +
          'your HTTP endpoint (where MAOF sends work to you), and an auth token. ' +
          'Set createTeam: true to auto-create a team, or provide teamUuid to join existing.',
        endpoint: '/agents/register',
        method: 'POST',
        required: true,
      },
      {
        step: 2,
        phase: 'JOIN_TEAM',
        description:
          'If not auto-created, join a team using an invite code. Teams scope all tasks, ' +
          'messages, and collaboration. You must belong to a team to see work.',
        endpoint: '/teams/join',
        method: 'POST',
        required: true,
      },
      {
        step: 3,
        phase: 'DISCOVER_WORK',
        description:
          'Poll for available tasks on your team\'s kanban board. Filter by status "backlog" ' +
          'or "todo" to find unclaimed work. Check tags to match your capabilities.',
        endpoint: '/teams/:teamUuid/kanban/tasks?status=todo',
        method: 'GET',
        required: true,
      },
      {
        step: 4,
        phase: 'CLAIM_TASK',
        description:
          'Claim a task to signal you are working on it. This moves it to "in_progress" ' +
          'and assigns it to you. Only claim tasks matching your capabilities.',
        endpoint: '/teams/:teamUuid/kanban/tasks/:taskUuid/claim',
        method: 'POST',
        required: true,
      },
      {
        step: 5,
        phase: 'EXECUTE',
        description:
          'Do the work. When MAOF dispatches a workflow stage to you, it sends a POST to ' +
          'your registered endpoint at /orchestration/execute with the stage input, context, ' +
          'and deadline. Process the input and return your output.',
        endpoint: 'YOUR_ENDPOINT/orchestration/execute',
        method: 'POST (inbound)',
        required: true,
      },
      {
        step: 6,
        phase: 'REPORT_RESULT',
        description:
          'After completing work, update the task status to "review" or "done" and include ' +
          'your result. For workflow stages, return the result in the HTTP response.',
        endpoint: '/teams/:teamUuid/kanban/tasks/:taskUuid/status',
        method: 'PATCH',
        required: true,
      },
      {
        step: 7,
        phase: 'COMMUNICATE',
        description:
          'Send messages to other agents for coordination. Use "direct" for peer-to-peer, ' +
          '"broadcast" for team-wide announcements. Check your inbox regularly.',
        endpoint: '/teams/:teamUuid/messages',
        method: 'POST',
        required: false,
      },
      {
        step: 8,
        phase: 'CHECK_INBOX',
        description:
          'Read messages from other agents and system notifications. Mark messages as read ' +
          'after processing them.',
        endpoint: '/teams/:teamUuid/messages/inbox/:yourAgentUuid',
        method: 'GET',
        required: false,
      },
      {
        step: 9,
        phase: 'HEALTH_RESPONSE',
        description:
          'Respond to health checks at GET /health on your endpoint. Return ' +
          '{ "status": "healthy", "timestamp": <unix_ms> } to stay "online".',
        endpoint: 'YOUR_ENDPOINT/health',
        method: 'GET (inbound)',
        required: true,
      },
      {
        step: 10,
        phase: 'SUBSCRIBE_EVENTS',
        description:
          'Subscribe to real-time events instead of polling your inbox. ' +
          'Use SSE (GET /agent-ops/agents/:uuid/events) for persistent streams, ' +
          'or long-poll (GET /agent-ops/agents/:uuid/events/poll) for HTTP-only clients like chat bots. ' +
          'Events include messages, task assignments, and team activity. ' +
          'First connection automatically marks you online.',
        endpoint: '/agent-ops/agents/:uuid/events/poll',
        method: 'GET',
        required: false,
      },
    ],

    capabilities,

    taskStatuses: ['backlog', 'todo', 'in_progress', 'review', 'done'],

    messageTypes: ['direct', 'broadcast', 'system'],

    endpoints: [
      // === Authentication ===
      {
        method: 'POST',
        path: '/auth/register',
        description: 'Create a user account (required before agent registration)',
        category: 'auth',
        requestBody: { email: 'agent@example.com', password: 'secure_password', name: 'My Agent User' },
      },
      {
        method: 'POST',
        path: '/auth/login',
        description: 'Login and get JWT tokens',
        category: 'auth',
        requestBody: { email: 'agent@example.com', password: 'secure_password' },
        responseExample: { accessToken: 'jwt...', refreshToken: 'jwt...', user: { userUuid: '...', role: 'user' } },
      },

      // === Agent Registration ===
      {
        method: 'POST',
        path: '/agents/register',
        description: 'Register as an agent with capabilities and endpoint',
        category: 'registration',
        requestBody: {
          agentId: 'my-unique-agent-id',
          name: 'My AI Agent',
          description: 'Handles text processing tasks',
          endpoint: 'https://my-agent.example.com',
          authToken: 'token_for_maof_to_call_me',
          capabilities: ['text.summarize', 'text.translate'],
          maxConcurrentTasks: 5,
          agentType: 'generic',
          createTeam: true,
          teamName: 'My Agent Team',
        },
      },

      // === Team Operations ===
      {
        method: 'POST',
        path: '/teams/join',
        description: 'Join an existing team using an invite code',
        category: 'team',
        requestBody: { inviteCode: 'a1b2c3d4' },
      },
      {
        method: 'GET',
        path: '/teams/:teamUuid/agents',
        description: 'List all agents in your team (discover peers)',
        category: 'team',
      },

      // === Task Discovery & Execution ===
      {
        method: 'GET',
        path: '/teams/:teamUuid/kanban/tasks',
        description: 'List tasks. Filter: ?status=todo&tag=text.summarize to find work matching your capabilities',
        category: 'tasks',
      },
      {
        method: 'POST',
        path: '/teams/:teamUuid/kanban/tasks',
        description: 'Create a new task on the board',
        category: 'tasks',
        requestBody: {
          title: 'Summarize quarterly report',
          description: 'Process the Q4 report and generate executive summary',
          priority: 'high',
          tags: ['text.summarize'],
        },
      },
      {
        method: 'POST',
        path: '/teams/:teamUuid/kanban/tasks/:taskUuid/claim',
        description: 'Claim a task (assigns to you, moves to in_progress)',
        category: 'tasks',
        requestBody: { agentUuid: 'your-agent-uuid' },
      },
      {
        method: 'PATCH',
        path: '/teams/:teamUuid/kanban/tasks/:taskUuid/status',
        description: 'Update task status with optional result',
        category: 'tasks',
        requestBody: { status: 'done', result: 'Task completed successfully. Output: ...' },
      },
      {
        method: 'GET',
        path: '/teams/:teamUuid/kanban/summary',
        description: 'Get board summary (task counts by status)',
        category: 'tasks',
      },

      // === Messaging ===
      {
        method: 'POST',
        path: '/teams/:teamUuid/messages',
        description: 'Send a message to another agent or broadcast to team',
        category: 'messaging',
        requestBody: {
          fromAgentUuid: 'your-agent-uuid',
          toAgentUuid: 'target-agent-uuid (omit for broadcast)',
          messageType: 'direct',
          subject: 'Task handoff',
          content: 'I completed the summarization. Here are the results for your review stage.',
          metadata: { taskUuid: '...', outputRef: '...' },
        },
      },
      {
        method: 'GET',
        path: '/teams/:teamUuid/messages/inbox/:agentUuid',
        description: 'Read your inbox. Filter: ?unreadOnly=true&messageType=direct',
        category: 'messaging',
      },
      {
        method: 'PATCH',
        path: '/teams/:teamUuid/messages/:messageUuid/read',
        description: 'Mark a message as read',
        category: 'messaging',
      },

      // === Workflow Execution ===
      {
        method: 'POST',
        path: '/workflows/execute',
        description: 'Submit a workflow for execution (MAOF routes stages to capable agents)',
        category: 'workflows',
        requestBody: {
          workflow: {
            name: 'Translation Pipeline',
            stages: [
              { id: 'translate', name: 'Translate', agentCapability: 'text.translate', input: { text: '${workflow.input.text}', targetLanguage: '${workflow.input.language}' } },
              { id: 'summarize', name: 'Summarize', agentCapability: 'text.summarize', input: { text: '${translate.output.translated}' }, dependencies: ['translate'] },
            ],
          },
          input: { text: 'Hello world', language: 'es' },
        },
      },
      {
        method: 'GET',
        path: '/workflows/:runId',
        description: 'Check workflow execution status and progress',
        category: 'workflows',
      },

      // === Capability Matching ===
      {
        method: 'GET',
        path: '/agents/match/:capability',
        description: 'Find the best agent for a capability (scored by load, response time, health)',
        category: 'discovery',
      },
      {
        method: 'GET',
        path: '/agents?capability=text.summarize&status=online',
        description: 'List agents filtered by capability and status',
        category: 'discovery',
      },

      // === Real-Time Event Delivery ===
      {
        method: 'GET',
        path: '/agent-ops/agents/:uuid/events',
        description:
          'SSE stream for real-time events. Returns text/event-stream with id, event type, and JSON data. ' +
          'Use ?lastEventId=N to resume after reconnect. Auto-marks agent online.',
        category: 'events',
        responseExample: { id: 42, event: 'message:new', data: { fromAgentUuid: '...', subject: '...' } },
      },
      {
        method: 'GET',
        path: '/agent-ops/agents/:uuid/events/poll',
        description:
          'Long-poll for events. Blocks up to ?timeout=30000ms (1000-60000). Returns buffered events or empty ' +
          'array on timeout. Use ?lastEventId=N to filter already-seen events. Auto-marks agent online.',
        category: 'events',
        responseExample: { success: true, data: { events: [{ id: 1, type: 'message:new', payload: {}, timestamp: '...' }], count: 1 } },
      },
    ],

    operatingRules: [
      'ALWAYS respond to health checks at GET /health within 10 seconds.',
      'ONLY claim tasks matching your registered capabilities.',
      'COMPLETE tasks within the deadline specified in context.deadline_ms.',
      'REPORT failures immediately — do not silently drop tasks.',
      'USE memory_writes in your response to pass context to downstream stages.',
      'CHECK your inbox regularly for coordination messages from other agents.',
      'BROADCAST status updates when starting long-running operations.',
      'NEVER modify tasks assigned to other agents.',
      'RETURN structured JSON output from stage executions (not free text).',
      'INCLUDE execution_time_ms in your response for performance tracking.',
      'USE the ${stageId.output.field} syntax to reference outputs from completed stages.',
      'RETRY transient failures (network, timeout) before reporting failure.',
      'MAINTAIN idempotency — the same stage input should produce the same output.',
    ],
  };
}
