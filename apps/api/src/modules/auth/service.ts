/**
 * Auth service — user registration, login, token generation.
 * All password operations use bcrypt with 12 salt rounds.
 */
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

const BCRYPT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser {
  id: number;
  userUuid: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}

/**
 * Strips sensitive fields (passwordHash, deletedAt) from a user row.
 */
function toSafeUser(user: typeof users.$inferSelect): SafeUser {
  return {
    id: user.id,
    userUuid: user.userUuid,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}

/**
 * Registers a new user.
 * Throws ApiError(409) if email already exists.
 */
export async function registerUser(
  db: Database,
  email: string,
  password: string,
  name: string,
): Promise<SafeUser> {
  // Check for duplicate email
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    throw ApiError.conflict('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const [created] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name,
        role: 'user',
      })
      .returning();

    if (!created) throw ApiError.internal('Failed to create user');
    return toSafeUser(created);
  } catch (err) {
    // PostgreSQL unique constraint violation (23505) — concurrent duplicate insert
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
      throw ApiError.conflict('Email already registered');
    }
    throw err;
  }
}

/**
 * Validates credentials and returns the user.
 * Throws ApiError(401) on invalid credentials (generic — don't leak which field is wrong).
 */
export async function validateCredentials(
  db: Database,
  email: string,
  password: string,
): Promise<SafeUser> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user || user.deletedAt !== null) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  return toSafeUser(user);
}

/**
 * Fetches a user by UUID.
 * Throws ApiError(404) if not found.
 */
export async function getUserByUuid(db: Database, userUuid: string): Promise<SafeUser> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.userUuid, userUuid))
    .limit(1);

  if (!user || user.deletedAt !== null) {
    throw ApiError.notFound('User not found');
  }

  return toSafeUser(user);
}
