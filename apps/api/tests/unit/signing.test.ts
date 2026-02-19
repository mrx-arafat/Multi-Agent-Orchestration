/**
 * Unit tests for RSA signing/verification utilities (FR-5.2).
 */
import { describe, it, expect } from 'vitest';
import {
  generateSigningKeyPair,
  signPayload,
  verifySignature,
  deepSortKeys,
} from '../../src/lib/signing.js';

describe('generateSigningKeyPair', () => {
  it('should generate valid PEM key pair', () => {
    const { publicKey, privateKey } = generateSigningKeyPair();
    expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    expect(privateKey).toContain('-----END PRIVATE KEY-----');
    expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
    expect(publicKey).toContain('-----END PUBLIC KEY-----');
  });

  it('should generate unique key pairs on each call', () => {
    const pair1 = generateSigningKeyPair();
    const pair2 = generateSigningKeyPair();
    expect(pair1.privateKey).not.toBe(pair2.privateKey);
    expect(pair1.publicKey).not.toBe(pair2.publicKey);
  });
});

describe('signPayload + verifySignature', () => {
  const { publicKey, privateKey } = generateSigningKeyPair();

  it('should sign and verify a simple payload', () => {
    const data = { message: 'hello', count: 42 };
    const signature = signPayload(data, privateKey);
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);
    expect(verifySignature(data, signature, publicKey)).toBe(true);
  });

  it('should detect tampered payload', () => {
    const data = { workflowRunId: 'run-1', status: 'completed' };
    const signature = signPayload(data, privateKey);

    const tampered = { workflowRunId: 'run-1', status: 'failed' };
    expect(verifySignature(tampered, signature, publicKey)).toBe(false);
  });

  it('should detect tampered signature', () => {
    const data = { key: 'value' };
    const signature = signPayload(data, privateKey);

    // Flip a character in the signature
    const tampered = signature.slice(0, -1) + (signature.at(-1) === '0' ? '1' : '0');
    expect(verifySignature(data, tampered, publicKey)).toBe(false);
  });

  it('should reject verification with wrong public key', () => {
    const otherPair = generateSigningKeyPair();
    const data = { test: true };
    const signature = signPayload(data, privateKey);
    expect(verifySignature(data, signature, otherPair.publicKey)).toBe(false);
  });

  it('should produce deterministic signatures (same input → same signature)', () => {
    const data = { b: 2, a: 1 };
    const sig1 = signPayload(data, privateKey);
    const sig2 = signPayload(data, privateKey);
    expect(sig1).toBe(sig2);
  });

  it('should produce identical signatures regardless of key order', () => {
    const data1 = { z: 3, a: 1, m: 2 };
    const data2 = { a: 1, m: 2, z: 3 };
    const sig1 = signPayload(data1, privateKey);
    const sig2 = signPayload(data2, privateKey);
    expect(sig1).toBe(sig2);
  });

  it('should handle nested objects', () => {
    const data = { outer: { inner: { deep: 'value' } }, list: [1, 2, 3] };
    const signature = signPayload(data, privateKey);
    expect(verifySignature(data, signature, publicKey)).toBe(true);
  });

  it('should handle null and primitive values', () => {
    expect(verifySignature(null, signPayload(null, privateKey), publicKey)).toBe(true);
    expect(verifySignature('string', signPayload('string', privateKey), publicKey)).toBe(true);
    expect(verifySignature(42, signPayload(42, privateKey), publicKey)).toBe(true);
  });
});

describe('deepSortKeys', () => {
  it('should sort object keys alphabetically', () => {
    const result = deepSortKeys({ c: 3, a: 1, b: 2 });
    expect(Object.keys(result as Record<string, unknown>)).toEqual(['a', 'b', 'c']);
  });

  it('should sort nested object keys', () => {
    const result = deepSortKeys({ z: { b: 2, a: 1 } }) as Record<string, Record<string, unknown>>;
    expect(Object.keys(result['z']!)).toEqual(['a', 'b']);
  });

  it('should preserve array order', () => {
    const result = deepSortKeys([3, 1, 2]);
    expect(result).toEqual([3, 1, 2]);
  });

  it('should pass through primitives', () => {
    expect(deepSortKeys(null)).toBe(null);
    expect(deepSortKeys(42)).toBe(42);
    expect(deepSortKeys('hello')).toBe('hello');
    expect(deepSortKeys(true)).toBe(true);
  });
});
