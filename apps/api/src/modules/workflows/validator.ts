/**
 * Workflow definition validator.
 * Checks structural validity before persisting or executing.
 */
import { ApiError } from '../../types/index.js';

export interface StageDefinition {
  id: string;
  name: string;
  agentCapability: string;
  input?: Record<string, unknown>;
  dependencies?: string[];
  config?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  name: string;
  stages: StageDefinition[];
}

/**
 * Validates a workflow definition:
 * - Must have at least 1 stage
 * - All stage IDs must be unique
 * - All dependencies must reference valid stage IDs
 * - No circular dependencies (simple topological check)
 */
export function validateWorkflowDefinition(definition: WorkflowDefinition): void {
  const { stages } = definition;

  if (!stages || stages.length === 0) {
    throw ApiError.badRequest('Workflow must have at least one stage');
  }

  const stageIds = new Set(stages.map((s) => s.id));

  // Unique stage IDs
  if (stageIds.size !== stages.length) {
    throw ApiError.badRequest('Workflow stage IDs must be unique');
  }

  // All dependencies reference existing stages
  for (const stage of stages) {
    for (const dep of stage.dependencies ?? []) {
      if (!stageIds.has(dep)) {
        throw ApiError.badRequest(
          `Stage '${stage.id}' depends on unknown stage '${dep}'`,
        );
      }
      if (dep === stage.id) {
        throw ApiError.badRequest(`Stage '${stage.id}' cannot depend on itself`);
      }
    }
  }

  // Detect circular dependencies via topological sort (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const stage of stages) {
    inDegree.set(stage.id, stage.dependencies?.length ?? 0);
    adjacency.set(stage.id, []);
  }

  for (const stage of stages) {
    for (const dep of stage.dependencies ?? []) {
      adjacency.get(dep)!.push(stage.id);
    }
  }

  const queue = [...stageIds].filter((id) => inDegree.get(id) === 0);
  let processed = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    for (const dependent of adjacency.get(current) ?? []) {
      const deg = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, deg);
      if (deg === 0) queue.push(dependent);
    }
  }

  if (processed !== stages.length) {
    throw ApiError.badRequest('Workflow contains circular dependencies');
  }
}

/**
 * Returns stages sorted in execution order (topological sort).
 */
export function getExecutionOrder(stages: StageDefinition[]): StageDefinition[] {
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const stage of stages) {
    inDegree.set(stage.id, stage.dependencies?.length ?? 0);
    adjacency.set(stage.id, []);
  }

  for (const stage of stages) {
    for (const dep of stage.dependencies ?? []) {
      adjacency.get(dep)!.push(stage.id);
    }
  }

  const queue = stages.filter((s) => (inDegree.get(s.id) ?? 0) === 0).map((s) => s.id);
  const result: StageDefinition[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(stageMap.get(current)!);
    for (const dependent of adjacency.get(current) ?? []) {
      const deg = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, deg);
      if (deg === 0) queue.push(dependent);
    }
  }

  return result;
}
