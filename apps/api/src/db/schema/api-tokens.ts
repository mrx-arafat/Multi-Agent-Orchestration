import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

/**
 * API tokens table — SRS Phase 2 (API token auth).
 * Bearer tokens for machine-to-machine access, separate from JWT user auth.
 * Tokens are stored as SHA-256 hashes (never plaintext).
 * Format: maof_<64 hex chars>
 */
export const apiTokens = pgTable('api_tokens', {
  id: serial('id').primaryKey(),
  tokenId: uuid('token_id').defaultRandom().notNull().unique(),
  userUuid: uuid('user_uuid').notNull(), // Owner of this token
  name: varchar('name', { length: 255 }).notNull(), // User-defined label
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(), // SHA-256
  tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(), // "maof_" + first 8 hex chars
  scopes: text('scopes').array().notNull().default([]), // Optional permission scopes
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'), // null = never expires
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'), // null = active
}, (table) => [
  index('idx_api_tokens_user_uuid').on(table.userUuid),
  index('idx_api_tokens_token_hash').on(table.tokenHash),
]);

export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;
