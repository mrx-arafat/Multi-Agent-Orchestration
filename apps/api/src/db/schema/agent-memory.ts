import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const memoryTypeEnum = pgEnum('memory_type', ['episodic', 'semantic', 'working']);

/**
 * Agent memory table — long-term context for agents.
 * Episodic: Past task summaries. Semantic: Facts/patterns. Working: Current context.
 */
export const agentMemory = pgTable('agent_memory', {
  id: serial('id').primaryKey(),
  memoryUuid: uuid('memory_uuid').defaultRandom().notNull().unique(),
  agentUuid: uuid('agent_uuid').notNull(),
  memoryType: memoryTypeEnum('memory_type').notNull(),
  category: varchar('category', { length: 255 }), // e.g., 'coding_style', 'api_knowledge'
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata'), // Flexible context (workflow IDs, tags, etc.)
  embedding: text('embedding'), // Stored as JSON array for semantic search
  importance: integer('importance').notNull().default(5), // 1-10 scale
  accessCount: integer('access_count').notNull().default(0),
  lastAccessedAt: timestamp('last_accessed_at'),
  expiresAt: timestamp('expires_at'), // Optional TTL
  workflowRunId: varchar('workflow_run_id', { length: 255 }), // Link to workflow
  teamUuid: uuid('team_uuid'), // Team scope
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_agent_memory_agent_uuid').on(table.agentUuid),
  index('idx_agent_memory_type').on(table.memoryType),
  index('idx_agent_memory_category').on(table.category),
  index('idx_agent_memory_team_uuid').on(table.teamUuid),
  index('idx_agent_memory_importance').on(table.importance),
  index('idx_agent_memory_created_at').on(table.createdAt),
]);

export type AgentMemoryRow = typeof agentMemory.$inferSelect;
export type NewAgentMemory = typeof agentMemory.$inferInsert;
