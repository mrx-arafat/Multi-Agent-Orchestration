/**
 * API token service — create, validate, revoke, and list API tokens.
 * Tokens provide machine-to-machine authentication separate from JWT.
 *
 * Token format: maof_<64 hex chars> (32 random bytes)
 * Storage: SHA-256 hash only — plaintext is never persisted.
 */
import { createHash, randomBytes } from 'crypto';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { apiTokens } from '../../db/schema/index.js';
import { users } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

const TOKEN_PREFIX = 'maof_';

/** Generates a cryptographically random API token. */
function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
}

/** SHA-256 hash a token for storage. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SafeApiToken {
  tokenId: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

function toSafeToken(token: typeof apiTokens.$inferSelect): SafeApiToken {
  return {
    tokenId: token.tokenId,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    scopes: token.scopes,
    lastUsedAt: token.lastUsedAt ?? null,
    expiresAt: token.expiresAt ?? null,
    createdAt: token.createdAt,
    revokedAt: token.revokedAt ?? null,
  };
}

/**
 * Creates a new API token for a user.
 * Returns the plaintext token (shown once) and the safe token metadata.
 */
export async function createApiToken(
  db: Database,
  params: {
    userUuid: string;
    name: string;
    scopes?: string[];
    expiresAt?: Date;
  },
): Promise<{ token: string; metadata: SafeApiToken }> {
  // Verify user exists
  const [user] = await db
    .select({ userUuid: users.userUuid })
    .from(users)
    .where(and(eq(users.userUuid, params.userUuid), isNull(users.deletedAt)))
    .limit(1);

  if (!user) {
    throw ApiError.notFound('User');
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const tokenPrefix = token.slice(0, TOKEN_PREFIX.length + 8); // "maof_" + first 8 hex chars

  const [created] = await db
    .insert(apiTokens)
    .values({
      userUuid: params.userUuid,
      name: params.name,
      tokenHash,
      tokenPrefix,
      scopes: params.scopes ?? [],
      expiresAt: params.expiresAt ?? null,
    })
    .returning();

  if (!created) throw ApiError.internal('Failed to create API token');

  return { token, metadata: toSafeToken(created) };
}

/**
 * Validates an API token string.
 * Returns the user's UUID and scopes if valid, or null if invalid/revoked/expired.
 * Updates lastUsedAt on successful validation.
 */
export async function validateApiToken(
  db: Database,
  token: string,
): Promise<{ userUuid: string; email: string; role: string; scopes: string[] } | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashToken(token);

  const [record] = await db
    .select({
      tokenId: apiTokens.tokenId,
      userUuid: apiTokens.userUuid,
      scopes: apiTokens.scopes,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);

  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  // Look up the user
  const [user] = await db
    .select({ userUuid: users.userUuid, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.userUuid, record.userUuid), isNull(users.deletedAt)))
    .limit(1);

  if (!user) return null;

  // Update lastUsedAt (best-effort, don't fail the request)
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.tokenId, record.tokenId))
    .catch(() => {});

  return {
    userUuid: user.userUuid,
    email: user.email,
    role: user.role,
    scopes: record.scopes,
  };
}

/**
 * Lists all API tokens for a user (active and revoked).
 */
export async function listApiTokens(
  db: Database,
  userUuid: string,
): Promise<SafeApiToken[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userUuid, userUuid))
    .orderBy(desc(apiTokens.createdAt));

  return rows.map(toSafeToken);
}

/**
 * Revokes an API token. Only the owning user can revoke their tokens.
 */
export async function revokeApiToken(
  db: Database,
  tokenId: string,
  requestingUserUuid: string,
): Promise<void> {
  const [token] = await db
    .select({ userUuid: apiTokens.userUuid, revokedAt: apiTokens.revokedAt })
    .from(apiTokens)
    .where(eq(apiTokens.tokenId, tokenId))
    .limit(1);

  if (!token) {
    throw ApiError.notFound('API token');
  }

  if (token.userUuid !== requestingUserUuid) {
    throw ApiError.forbidden('You can only revoke your own API tokens');
  }

  if (token.revokedAt) {
    throw ApiError.badRequest('Token is already revoked');
  }

  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(eq(apiTokens.tokenId, tokenId));
}
