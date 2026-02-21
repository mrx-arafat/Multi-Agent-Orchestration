/**
 * Thin HTTP client wrapping the MAOF API.
 * Uses native fetch (Node 20+). Config from environment variables.
 *
 * Dual mode:
 * - User mode: MAOF_API_URL + MAOF_API_TOKEN (required)
 * - Agent mode: + MAOF_AGENT_UUID (optional, enables agent-ops tools)
 */

export interface MaofConfig {
  apiUrl: string;
  apiToken: string;
  agentUuid?: string;
}

interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export function loadConfig(): MaofConfig {
  const apiUrl = process.env['MAOF_API_URL'];
  const apiToken = process.env['MAOF_API_TOKEN'];
  const agentUuid = process.env['MAOF_AGENT_UUID'] || undefined;

  const missing: string[] = [];
  if (!apiUrl) missing.push('MAOF_API_URL');
  if (!apiToken) missing.push('MAOF_API_TOKEN');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const cfg: MaofConfig = { apiUrl: apiUrl!, apiToken: apiToken! };
  if (agentUuid) cfg.agentUuid = agentUuid;
  return cfg;
}

export class MaofClient {
  private teamUuid: string | null = null;

  constructor(private config: MaofConfig) {}

  /** Whether MAOF_AGENT_UUID was provided (enables agent-ops tools). */
  get hasAgentUuid(): boolean {
    return this.config.agentUuid !== undefined;
  }

  /** Returns the agent UUID. Throws if not configured. */
  get agentUuid(): string {
    if (!this.config.agentUuid) {
      throw new Error('MAOF_AGENT_UUID is not configured — agent-ops tools are unavailable');
    }
    return this.config.agentUuid;
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async put<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  /** Cached team UUID lookup for agent-ops tools. */
  async getTeamUuid(): Promise<string> {
    if (this.teamUuid) return this.teamUuid;

    interface AgentContextResponse {
      agentUuid: string;
      teamUuid: string | null;
    }

    const ctx = await this.get<AgentContextResponse>(
      `/agent-ops/agents/${this.agentUuid}/context`,
    );
    if (!ctx.teamUuid) throw new Error('Agent is not assigned to a team');
    this.teamUuid = ctx.teamUuid;
    return this.teamUuid;
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiToken}`,
      Accept: 'application/json',
    };

    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.config.apiUrl}${path}`, init);
    return this.unwrap<T>(res);
  }

  private async unwrap<T>(res: Response): Promise<T> {
    const envelope = (await res.json()) as ApiEnvelope<T>;

    if (!res.ok || !envelope.success) {
      const msg = envelope.error?.message ?? `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return envelope.data as T;
  }
}
