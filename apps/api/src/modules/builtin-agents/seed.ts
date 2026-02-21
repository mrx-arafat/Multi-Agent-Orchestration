/**
 * Seeds built-in AI agents into the database on startup.
 * Each agent represents a group of related capabilities powered by AI providers.
 *
 * Built-in agents are identified by agent_type='builtin' and a deterministic agentId.
 * They don't have real endpoints — the worker handles them in-process.
 */
import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { agents } from '../../db/schema/index.js';
import { getConfiguredProviders } from '../../lib/ai-providers/index.js';
import { listBuiltinCapabilities } from './capability-prompts.js';

interface BuiltinAgentDef {
  agentId: string;
  name: string;
  description: string;
  capabilities: string[];
}

/**
 * Group capabilities into logical agent bundles.
 */
const BUILTIN_AGENTS: BuiltinAgentDef[] = [
  {
    agentId: 'builtin-text-ai',
    name: 'Text AI Agent',
    description: 'General-purpose text generation, processing, and summarization powered by AI.',
    capabilities: ['text-generation', 'text-processing', 'summarization'],
  },
  {
    agentId: 'builtin-research-ai',
    name: 'Research AI Agent',
    description: 'Research, analysis, and web research capabilities powered by AI.',
    capabilities: ['research', 'web-research', 'text-analysis'],
  },
  {
    agentId: 'builtin-content-ai',
    name: 'Content AI Agent',
    description: 'Content planning, writing, and review capabilities powered by AI.',
    capabilities: ['content-planning', 'content-writing', 'content-review'],
  },
  {
    agentId: 'builtin-code-ai',
    name: 'Code AI Agent',
    description: 'Static analysis, security scanning, code review, and auditing powered by AI.',
    capabilities: ['static-analysis', 'security-scanning', 'code-review', 'code-audit'],
  },
  {
    agentId: 'builtin-data-ai',
    name: 'Data AI Agent',
    description: 'Data extraction, validation, transformation, and loading powered by AI.',
    capabilities: ['data-extraction', 'data-validation', 'data-transformation', 'data-storage'],
  },
];

/**
 * Seed built-in agents. Idempotent — skips agents that already exist.
 * Updates capabilities and status of existing built-in agents.
 * Returns the number of newly created agents.
 */
export async function seedBuiltinAgents(db: Database): Promise<{ created: number; updated: number }> {
  const providers = getConfiguredProviders();
  const hasProviders = providers.length > 0;
  let created = 0;
  let updated = 0;

  for (const def of BUILTIN_AGENTS) {
    // Check if this builtin agent already exists (not soft-deleted)
    const [existing] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.agentId, def.agentId), isNull(agents.deletedAt)))
      .limit(1);

    if (existing) {
      // Update capabilities and status based on current provider availability
      await db
        .update(agents)
        .set({
          capabilities: def.capabilities,
          status: hasProviders ? 'online' : 'offline',
          description: def.description,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, existing.id));
      updated++;
    } else {
      // Create new built-in agent
      await db.insert(agents).values({
        agentId: def.agentId,
        name: def.name,
        description: def.description,
        capabilities: def.capabilities,
        endpoint: 'builtin://local', // Sentinel — not a real endpoint
        authTokenHash: 'builtin-no-auth', // Not used for builtin agents
        agentType: 'builtin',
        maxConcurrentTasks: 50, // Builtin agents limited only by API rate limits
        status: hasProviders ? 'online' : 'offline',
      });
      created++;
    }
  }

  return { created, updated };
}

/**
 * Get a summary of built-in agent status.
 */
export function getBuiltinAgentSummary(): {
  agents: BuiltinAgentDef[];
  allCapabilities: string[];
  configuredProviders: string[];
} {
  return {
    agents: BUILTIN_AGENTS,
    allCapabilities: listBuiltinCapabilities(),
    configuredProviders: getConfiguredProviders(),
  };
}
