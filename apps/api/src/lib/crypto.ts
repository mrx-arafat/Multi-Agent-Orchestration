/**
 * AES-256-GCM encryption/decryption for sensitive data at rest.
 * Used to store agent auth tokens that MAOF needs to use when calling agents.
 *
 * Key: 32-byte hex string (MAOF_AGENT_TOKEN_KEY env var).
 * Format: iv:authTag:ciphertext (all hex-encoded).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (hex-encoded).
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes (64 hex characters)');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string encrypted with encrypt().
 * Input format: iv:authTag:ciphertext (hex-encoded).
 */
export function decrypt(encryptedData: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes (64 hex characters)');
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format (expected iv:authTag:ciphertext)');
  }

  const [ivHex, authTagHex, ciphertext] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
