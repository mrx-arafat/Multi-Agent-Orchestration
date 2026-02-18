/**
 * MAOF Agent Types
 * Based on SRS Section 2.1 and 6.1
 */

export type AgentStatus = 'online' | 'degraded' | 'offline';

export interface Agent {
  agentUuid: string;
  agentId: string;
  name: string;
  capabilities: string[];
  endpoint: string;
  description?: string;
  maxConcurrentTasks: number;
  status: AgentStatus;
  lastHealthCheck?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterAgentRequest {
  agentId: string;
  name: string;
  capabilities: string[];
  endpoint: string;
  authToken: string;
  description?: string;
  maxConcurrentTasks?: number;
}

export interface RegisterAgentResponse {
  agentUuid: string;
  status: 'registered';
  createdAt: string;
  healthCheckIntervalSeconds: number;
}

export interface AgentHealthStatus {
  agentUuid: string;
  status: AgentStatus;
  lastCheck?: string;
  concurrentTasks: number;
  maxCapacity: number;
  responseTimeMs?: number;
}

export interface AgentListQuery {
  capability?: string;
  status?: AgentStatus;
  page?: number;
  limit?: number;
}
