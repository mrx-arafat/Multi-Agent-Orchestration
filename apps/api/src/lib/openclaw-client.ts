/**
 * OpenClaw agent adapter — dispatches tasks to OpenClaw agents.
 *
 * OpenClaw agents are autonomous AI bots with full server access.
 * They communicate via webhooks (POST /hooks/agent) with Bearer token auth.
 * This adapter translates MAOF task dispatch into OpenClaw's webhook format.
 */

export interface OpenClawTaskPayload {
  /** The task to execute (human-readable instruction) */
  task: string;
  /** Structured context for the task */
  context: {
    workflowRunId: string;
    stageId: string;
    teamUuid: string;
    taskUuid?: string;
    previousStageOutputs?: Record<string, unknown>;
    agentMessages?: Array<{ from: string; content: string }>;
  };
  /** Callback URL for status updates */
  callbackUrl?: string;
  /** Maximum execution time in seconds */
  timeoutSeconds?: number;
}

export interface OpenClawResponse {
  /** Whether the task was accepted */
  accepted: boolean;
  /** Task execution ID from OpenClaw */
  executionId?: string;
  /** Immediate result (if synchronous) */
  result?: unknown;
  /** Error message if not accepted */
  error?: string;
}

/**
 * Dispatches a task to an OpenClaw agent via its webhook endpoint.
 * OpenClaw agents use POST /hooks/agent with Bearer token auth.
 */
export async function dispatchToOpenClaw(
  endpoint: string,
  authToken: string,
  payload: OpenClawTaskPayload,
  timeoutMs: number = 120_000,
): Promise<OpenClawResponse> {
  // OpenClaw uses /hooks/agent as webhook path
  const webhookUrl = endpoint.endsWith('/')
    ? `${endpoint}hooks/agent`
    : `${endpoint}/hooks/agent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-MAOF-Workflow-Run': payload.context.workflowRunId,
        'X-MAOF-Stage': payload.context.stageId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        accepted: false,
        error: `OpenClaw returned ${response.status}: ${body}`,
      };
    }

    const data = await response.json() as Record<string, unknown>;

    const executionId = data['executionId'] as string | undefined;
    return {
      accepted: true,
      ...(executionId ? { executionId } : {}),
      result: data['result'] ?? data,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { accepted: false, error: 'OpenClaw agent timed out' };
    }
    return {
      accepted: false,
      error: err instanceof Error ? err.message : 'Unknown error dispatching to OpenClaw',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends a health check ping to an OpenClaw agent.
 * OpenClaw responds on /hooks/agent with a simple ping payload.
 */
export async function pingOpenClaw(
  endpoint: string,
  authToken: string,
  timeoutMs: number = 10_000,
): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const webhookUrl = endpoint.endsWith('/')
    ? `${endpoint}hooks/agent`
    : `${endpoint}/hooks/agent`;

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ type: 'ping' }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;

    return {
      healthy: response.ok,
      latencyMs,
      ...(!response.ok ? { error: `HTTP ${response.status}` } : {}),
    };
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  } finally {
    clearTimeout(timer);
  }
}
