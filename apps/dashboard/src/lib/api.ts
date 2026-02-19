/**
 * API client — fetch wrapper with JWT Bearer token injection.
 * Tokens are persisted to localStorage so sessions survive page reloads.
 */

const API_BASE = '/api';
const TOKEN_KEY = 'maof_access_token';
const REFRESH_KEY = 'maof_refresh_token';

let _accessToken: string | null = localStorage.getItem(TOKEN_KEY);
let _refreshToken: string | null = localStorage.getItem(REFRESH_KEY);

export function setTokens(accessToken: string, refreshToken: string): void {
  _accessToken = accessToken;
  _refreshToken = refreshToken;
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  _accessToken = null;
  _refreshToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isAuthenticated(): boolean {
  return _accessToken !== null;
}

export function getStoredAccessToken(): string | null {
  return _accessToken;
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

// ── Teams ───────────────────────────────────────────────────────────────────

export interface Team {
  teamUuid: string;
  name: string;
  description: string | null;
  ownerUserUuid: string;
  maxAgents: number;
  agentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export async function listTeams(): Promise<Team[]> {
  return request<Team[]>('/teams');
}

export async function getTeam(teamUuid: string): Promise<Team> {
  return request<Team>(`/teams/${teamUuid}`);
}

export async function createTeam(params: {
  name: string;
  description?: string;
  maxAgents?: number;
}): Promise<Team> {
  return request<Team>('/teams', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function addAgentToTeam(teamUuid: string, agentUuid: string): Promise<void> {
  await request<{ added: boolean }>(`/teams/${teamUuid}/agents`, {
    method: 'POST',
    body: JSON.stringify({ agentUuid }),
  });
}

export async function removeAgentFromTeam(teamUuid: string, agentUuid: string): Promise<void> {
  await request<{ removed: boolean }>(`/teams/${teamUuid}/agents/${agentUuid}`, {
    method: 'DELETE',
  });
}

export async function listTeamAgents(teamUuid: string): Promise<Agent[]> {
  return request<Agent[]>(`/teams/${teamUuid}/agents`);
}

export async function addTeamMember(
  teamUuid: string,
  userUuid: string,
  role: string = 'member',
): Promise<void> {
  await request<{ added: boolean }>(`/teams/${teamUuid}/members`, {
    method: 'POST',
    body: JSON.stringify({ userUuid, role }),
  });
}

// ── Kanban ──────────────────────────────────────────────────────────────────

export interface KanbanTask {
  taskUuid: string;
  teamUuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  tags: string[];
  assignedAgentUuid: string | null;
  createdByUserUuid: string;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanSummary {
  columns: { status: string; count: number }[];
  total: number;
}

export async function listKanbanTasks(
  teamUuid: string,
  params?: { status?: string; assignedAgentUuid?: string; priority?: string; page?: number; limit?: number },
): Promise<{ tasks: KanbanTask[]; meta: { total: number; page: number; limit: number; pages: number } }> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.assignedAgentUuid) query.set('assignedAgentUuid', params.assignedAgentUuid);
  if (params?.priority) query.set('priority', params.priority);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request(`/teams/${teamUuid}/kanban/tasks${qs ? `?${qs}` : ''}`);
}

export async function createKanbanTask(
  teamUuid: string,
  params: { title: string; description?: string; priority?: string; tags?: string[]; assignedAgentUuid?: string },
): Promise<KanbanTask> {
  return request<KanbanTask>(`/teams/${teamUuid}/kanban/tasks`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function claimKanbanTask(teamUuid: string, taskUuid: string, agentUuid: string): Promise<KanbanTask> {
  return request<KanbanTask>(`/teams/${teamUuid}/kanban/tasks/${taskUuid}/claim`, {
    method: 'POST',
    body: JSON.stringify({ agentUuid }),
  });
}

export async function updateKanbanTaskStatus(
  teamUuid: string,
  taskUuid: string,
  status: string,
): Promise<KanbanTask> {
  return request<KanbanTask>(`/teams/${teamUuid}/kanban/tasks/${taskUuid}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function getKanbanSummary(teamUuid: string): Promise<KanbanSummary> {
  return request<KanbanSummary>(`/teams/${teamUuid}/kanban/summary`);
}

// ── Messaging ──────────────────────────────────────────────────────────────

export interface Message {
  messageUuid: string;
  teamUuid: string;
  fromAgentUuid: string;
  toAgentUuid: string | null;
  messageType: string;
  subject: string | null;
  content: string;
  metadata: unknown;
  readAt: string | null;
  createdAt: string;
}

export async function sendMessage(
  teamUuid: string,
  params: { fromAgentUuid: string; toAgentUuid?: string; messageType?: string; subject?: string; content: string },
): Promise<Message> {
  return request<Message>(`/teams/${teamUuid}/messages`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function listTeamMessages(
  teamUuid: string,
  params?: { page?: number; limit?: number },
): Promise<{ messages: Message[]; meta: { total: number; page: number; limit: number; pages: number } }> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request(`/teams/${teamUuid}/messages${qs ? `?${qs}` : ''}`);
}

export async function listAgentInbox(
  teamUuid: string,
  agentUuid: string,
  params?: { page?: number; limit?: number },
): Promise<{ messages: Message[]; meta: { total: number; page: number; limit: number; pages: number } }> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request(`/teams/${teamUuid}/messages/inbox/${agentUuid}${qs ? `?${qs}` : ''}`);
}

export async function markMessageRead(teamUuid: string, messageUuid: string): Promise<void> {
  await request(`/teams/${teamUuid}/messages/${messageUuid}/read`, { method: 'PATCH' });
}

// ── Agent Registration ─────────────────────────────────────────────────────

export async function registerAgent(params: {
  agentId: string;
  name: string;
  description?: string;
  endpoint: string;
  authToken: string;
  capabilities?: string[];
  maxConcurrentTasks?: number;
  agentType?: string;
  createTeam?: boolean;
  teamName?: string;
  teamUuid?: string;
}): Promise<{ agent: Agent; team?: { teamUuid: string; name: string } }> {
  return request('/agents/register', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function deleteAgent(agentUuid: string): Promise<void> {
  await request(`/agents/${agentUuid}`, { method: 'DELETE' });
}

export async function getAgent(agentUuid: string): Promise<Agent> {
  return request<Agent>(`/agents/${agentUuid}`);
}

export async function triggerHealthCheck(agentUuid: string): Promise<{ status: string; latencyMs: number }> {
  return request(`/agents/${agentUuid}/health-check`, { method: 'POST' });
}

// ── Team Invitations ───────────────────────────────────────────────────────

export interface Invitation {
  invitationUuid: string;
  teamUuid: string;
  inviteCode: string;
  createdByUserUuid: string;
  role: string;
  maxUses: number;
  useCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export async function createInvitation(
  teamUuid: string,
  params?: { role?: string; maxUses?: number; expiresInHours?: number },
): Promise<Invitation> {
  return request<Invitation>(`/teams/${teamUuid}/invitations`, {
    method: 'POST',
    body: JSON.stringify(params ?? {}),
  });
}

export async function listInvitations(teamUuid: string): Promise<Invitation[]> {
  return request<Invitation[]>(`/teams/${teamUuid}/invitations`);
}

export async function revokeInvitation(teamUuid: string, invitationUuid: string): Promise<void> {
  await request(`/teams/${teamUuid}/invitations/${invitationUuid}`, { method: 'DELETE' });
}

export async function joinTeam(inviteCode: string): Promise<{ teamUuid: string; role: string }> {
  return request('/teams/join', {
    method: 'POST',
    body: JSON.stringify({ inviteCode }),
  });
}
