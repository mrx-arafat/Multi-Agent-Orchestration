/**
 * API client — fetch wrapper with JWT Bearer token injection.
 * Tokens are stored in memory only (no localStorage) for security.
 * Refresh token rotation is handled server-side (Phase 2: httpOnly cookie).
 */

const API_BASE = '/api';

let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export function setTokens(accessToken: string, refreshToken: string): void {
  _accessToken = accessToken;
  _refreshToken = refreshToken;
}

export function clearTokens(): void {
  _accessToken = null;
  _refreshToken = null;
}

export function isAuthenticated(): boolean {
  return _accessToken !== null;
}

export interface ApiError {
  code: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json() as { success: boolean; data?: T; error?: ApiError };

  if (!data.success || !response.ok) {
    throw new ApiRequestError(
      response.status,
      data.error?.code ?? 'UNKNOWN_ERROR',
      data.error?.message ?? `HTTP ${response.status}`,
    );
  }

  return data.data as T;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface UserInfo {
  id: number;
  userUuid: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserInfo;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(
  email: string,
  password: string,
  name: string,
): Promise<UserInfo> {
  return request<UserInfo>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

export async function getCurrentUser(): Promise<UserInfo> {
  return request<UserInfo>('/auth/me');
}

// ── Agents ──────────────────────────────────────────────────────────────────

export interface Agent {
  agentUuid: string;
  agentId: string;
  name: string;
  description: string | null;
  endpoint: string;
  capabilities: string[];
  status: string;
  maxConcurrentTasks: number;
  createdAt: string;
}

export interface AgentListResponse {
  agents: Agent[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export async function listAgents(params?: {
  capability?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<AgentListResponse> {
  const query = new URLSearchParams();
  if (params?.capability) query.set('capability', params.capability);
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return request<AgentListResponse>(`/agents${qs ? `?${qs}` : ''}`);
}

// ── Workflows ────────────────────────────────────────────────────────────────

export interface WorkflowRun {
  workflowRunId: string;
  workflowName: string;
  status: string;
  progress: { total: number; completed: number; failed: number; current: string | null };
  createdAt: string;
  completedAt: string | null;
}

export async function executeWorkflow(
  workflow: unknown,
  input: Record<string, unknown>,
): Promise<{ workflowRunId: string; status: string }> {
  return request<{ workflowRunId: string; status: string }>('/workflows/execute', {
    method: 'POST',
    body: JSON.stringify({ workflow, input }),
  });
}

export interface WorkflowListResponse {
  runs: {
    workflowRunId: string;
    workflowName: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  }[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export async function listWorkflows(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<WorkflowListResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return request<WorkflowListResponse>(`/workflows${qs ? `?${qs}` : ''}`);
}

export async function getWorkflowStatus(runId: string): Promise<WorkflowRun> {
  return request<WorkflowRun>(`/workflows/${runId}`);
}
