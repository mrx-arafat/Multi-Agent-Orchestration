/**
 * MAOF Workflow Types
 * Based on SRS Section 2.1, 2.2, 2.3, 5.2, 5.3, 6.2
 */

export type WorkflowStatus = 'queued' | 'in_progress' | 'completed' | 'failed';
export type StageStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

/**
 * Stage input source can reference previous stage output or user_input.
 */
export interface StageInput {
  source: string; // stage_id or "user_input"
  field: string;  // field path within the source output
}

/**
 * Single stage in a workflow definition.
 * Based on SRS FR-2.1 declarative YAML/JSON syntax.
 */
export interface WorkflowStageDefinition {
  id: string;
  agentCapability: string;
  input: StageInput | Record<string, string>; // Simple or interpolated inputs
  dependencies?: string[];
  timeoutMs?: number;
}

/**
 * Full workflow definition as provided by the user.
 * Based on SRS FR-2.1.
 */
export interface WorkflowDefinition {
  name: string;
  version: string;
  description?: string;
  stages: WorkflowStageDefinition[];
  output?: {
    stage: string;
    field: string;
  };
}

/**
 * Workflow execution request payload.
 */
export interface ExecuteWorkflowRequest {
  workflow: WorkflowDefinition;
  input: Record<string, unknown>;
}

/**
 * Response from POST /workflows/execute.
 */
export interface ExecuteWorkflowResponse {
  workflowRunId: string;
  status: 'queued';
  createdAt: string;
  estimatedCompletionMs?: number;
}

/**
 * Stage execution summary in workflow status response.
 */
export interface StageExecutionSummary {
  stageId: string;
  status: StageStatus;
  agentId?: string;
  startedAt?: string;
  completedAt?: string;
  executionTimeMs?: number;
  output?: Record<string, unknown>;
}

/**
 * Workflow run status response.
 */
export interface WorkflowRunStatus {
  workflowRunId: string;
  workflowName: string;
  status: WorkflowStatus;
  progress: {
    totalStages: number;
    completedStages: number;
    currentStage?: string;
  };
  stages: Record<string, StageExecutionSummary>;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

/**
 * Workflow result (final output).
 */
export interface WorkflowResult {
  workflowRunId: string;
  status: WorkflowStatus;
  output: Record<string, unknown>;
  executionTimeMs: number;
  stagesExecuted: number;
  success: boolean;
}

/**
 * Audit log entry for a stage execution.
 */
export interface AuditLogEntry {
  id: number;
  workflowRunId: string;
  stageId: string;
  agentId: string;
  action: 'execute' | 'retry' | 'fail';
  inputHash: string;
  outputHash: string;
  status: string;
  signature?: Record<string, string>;
  loggedAt: string;
}
