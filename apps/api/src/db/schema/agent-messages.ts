import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  jsonb,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const messageTypeEnum = pgEnum('message_type', [
  'direct',     // One agent to another
  'broadcast',  // One agent to all agents in a workflow
  'system',     // System-generated (status updates, errors)
]);

/**
 * Agent messages table — inter-agent communication.
 * Enables agents to communicate during workflow execution.
 * Messages are scoped to a workflow run and delivered as context
 * to the recipient agent's next stage execution.
 */
export const agentMessages = pgTable('agent_messages', {
  id: serial('id').primaryKey(),
  messageUuid: uuid('message_uuid').defaultRandom().notNull().unique(),
  teamUuid: uuid('team_uuid').notNull(), // Team scope — isolation boundary
  workflowRunId: varchar('workflow_run_id', { length: 255 }), // Optional workflow context
  fromAgentUuid: uuid('from_agent_uuid'), // null for system messages
  toAgentUuid: uuid('to_agent_uuid'), // null for broadcast messages
  messageType: messageTypeEnum('message_type').notNull().default('direct'),
  subject: varchar('subject', { length: 500 }),
  content: text('content').notNull(),
  metadata: jsonb('metadata'), // Structured data attached to the message
  readAt: timestamp('read_at'), // When the recipient agent consumed this
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_agent_messages_team_uuid').on(table.teamUuid),
  index('idx_agent_messages_to_agent').on(table.toAgentUuid),
  index('idx_agent_messages_from_agent').on(table.fromAgentUuid),
]);

export type AgentMessage = typeof agentMessages.$inferSelect;
export type NewAgentMessage = typeof agentMessages.$inferInsert;
