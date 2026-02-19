/**
 * RSA-256 cryptographic signing for audit log entries (FR-5.2).
 * Uses Node.js built-in crypto — no external dependencies.
 */
import { createSign, createVerify, generateKeyPairSync } from 'crypto';

/**
 * Recursively sorts all object keys for deterministic JSON serialization.
 * Arrays preserve order; primitives pass through unchanged.
 */
export function deepSortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Generates an RSA-2048 key pair in PEM format.
 * For dev/test key generation only — production keys should be pre-generated.
 */
export function generateSigningKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/**
 * Signs a JSON-serializable payload with RS256.
 * Keys are recursively sorted for deterministic serialization.
 * Returns the signature as a hex string.
 */
export function signPayload(data: unknown, privateKeyPem: string): string {
  const normalized = JSON.stringify(deepSortKeys(data));
  const signer = createSign('RSA-SHA256');
  signer.update(normalized);
  signer.end();
  return signer.sign(privateKeyPem, 'hex');
}

/**
 * Verifies an RS256 signature against a JSON-serializable payload.
 * Returns true if the signature is valid.
 */
export function verifySignature(data: unknown, signatureHex: string, publicKeyPem: string): boolean {
  const normalized = JSON.stringify(deepSortKeys(data));
  const verifier = createVerify('RSA-SHA256');
  verifier.update(normalized);
  verifier.end();
  return verifier.verify(publicKeyPem, signatureHex, 'hex');
}
