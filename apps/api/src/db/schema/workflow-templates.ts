import { pgTable, serial, text, varchar, boolean, integer, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';

export const workflowTemplates = pgTable('workflow_templates', {
  id: serial('id').primaryKey(),
  templateUuid: uuid('template_uuid').defaultRandom().unique().notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }).notNull().default('general'),
  definition: jsonb('definition').notNull(),
  isPublic: boolean('is_public').notNull().default(true),
  createdByUserUuid: uuid('created_by_user_uuid'),
  usageCount: integer('usage_count').notNull().default(0),
  tags: text('tags').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
