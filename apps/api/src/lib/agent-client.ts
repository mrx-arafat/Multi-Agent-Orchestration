/**
 * HTTP client for calling agent endpoints.
 * Implements the agent communication protocol from SRS FR-6.1.
 *
 * Request: POST {agent.endpoint}/orchestration/execute
 * Response: { status: "success", output: {...}, execution_time_ms: N }
 * Error:    { status: "error", code: "...", message: "...", retryable: boolean }
 */

export interface AgentRequest {
  workflow_run_id: string;
  stage_id: string;
  capability_required: string;
  input: Record<string, unknown>;
  context: {
    previous_stages: string[];
    user_id: string;
    deadline_ms: number;
  };
}

export interface AgentSuccessResponse {
  status: 'success';
  output: Record<string, unknown>;
  execution_time_ms: number;
  memory_writes?: Record<string, unknown>;
}

export interface AgentErrorResponse {
  status: 'error';
  code: string;
  message: string;
  retryable: boolean;
}

export type AgentResponse = AgentSuccessResponse | AgentErrorResponse;

export class AgentCallError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly agentId: string,
  ) {
    super(message);
    this.name = 'AgentCallError';
  }
}

/**
 * Calls an agent's /orchestration/execute endpoint.
 * Handles timeouts, network errors, and agent error responses.
 */
export async function callAgent(
  endpoint: string,
  authToken: string,
  request: AgentRequest,
  timeoutMs: number,
): Promise<AgentSuccessResponse> {
  const url = `${endpoint.replace(/\/+$/, '')}/orchestration/execute`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Workflow-Run-Id': request.workflow_run_id,
        'X-Stage-Id': request.stage_id,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Try to parse error body
      let errorBody: AgentErrorResponse | null = null;
      try {
        errorBody = await response.json() as AgentErrorResponse;
      } catch {
        // Response body not JSON
      }

      if (errorBody?.status === 'error') {
        throw new AgentCallError(
          errorBody.message || `Agent returned ${response.status}`,
          errorBody.code || 'AGENT_ERROR',
          errorBody.retryable ?? response.status >= 500,
          request.capability_required,
        );
      }

      throw new AgentCallError(
        `Agent returned HTTP ${response.status}`,
        response.status >= 500 ? 'AGENT_SERVER_ERROR' : 'AGENT_CLIENT_ERROR',
        response.status >= 500, // Server errors are retryable
        request.capability_required,
      );
    }

    const body = await response.json() as AgentResponse;

    if (body.status === 'error') {
      throw new AgentCallError(
        body.message,
        body.code,
        body.retryable,
        request.capability_required,
      );
    }

    return body as AgentSuccessResponse;
  } catch (err) {
    if (err instanceof AgentCallError) throw err;

    // AbortController timeout
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AgentCallError(
        `Agent call timed out after ${timeoutMs}ms`,
        'TIMEOUT',
        true,
        request.capability_required,
      );
    }

    // Network/connection errors are retryable
    throw new AgentCallError(
      `Failed to reach agent: ${err instanceof Error ? err.message : 'Unknown error'}`,
      'NETWORK_ERROR',
      true,
      request.capability_required,
    );
  } finally {
    clearTimeout(timeout);
  }
}
