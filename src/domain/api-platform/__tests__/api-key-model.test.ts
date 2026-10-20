/**
 * API key model tests.
 *
 * Phase 10 Prompt 94.
 */

import { describe, expect, it } from '@jest/globals';

import { STUB_SECRET_HASHER } from '../../security/secret-rotation';
import {
  API_KEY_ENTROPY_BYTES,
  API_KEY_PREFIX_DISPLAY_LENGTH,
  API_KEY_PREFIX_LIVE,
  API_KEY_PREFIX_TEST,
  STUB_RANDOM_BYTES,
  createApiKey,
  generateApiKey,
  isApiKeyExpired,
  touchApiKeyLastUsed,
  validateApiKeyFormat,
  type ApiKey,
} from '../api-key-model';

const NOW = '2026-07-15T12:00:00.000Z';
const FUTURE = '2027-07-15T12:00:00.000Z';

function deterministicRng(): (bytes: number) => string {
  let counter = 0;
  return (bytes: number) => {
    counter += 1;
    // Deterministic: produce a hex string of the right length using the counter.
    return (counter.toString(16) + '0'.repeat(bytes * 2)).slice(0, bytes * 2);
  };
}

describe('generateApiKey', () => {
  it('returns a plaintext key, hash, and prefix', () => {
    const result = generateApiKey({
      hasher: STUB_SECRET_HASHER,
      randomBytes: deterministicRng(),
    });
    expect(result.plaintext).toMatch(/^bl_live_[0-9a-f]{64}$/);
    expect(result.keyHash).toBe(STUB_SECRET_HASHER(result.plaintext));
    expect(result.keyHash).not.toBe(result.plaintext);
    expect(result.prefix).toHaveLength(API_KEY_PREFIX_DISPLAY_LENGTH);
  });

  it('uses bl_test_ prefix for test environment', () => {
    const result = generateApiKey({
      environment: 'test',
      hasher: STUB_SECRET_HASHER,
      randomBytes: deterministicRng(),
    });
    expect(result.plaintext.startsWith(API_KEY_PREFIX_TEST)).toBe(true);
  });

  it('uses bl_live_ prefix for live environment', () => {
    const result = generateApiKey({
      environment: 'live',
      hasher: STUB_SECRET_HASHER,
      randomBytes: deterministicRng(),
    });
    expect(result.plaintext.startsWith(API_KEY_PREFIX_LIVE)).toBe(true);
  });

  it('defaults to live environment', () => {
    const result = generateApiKey({
      hasher: STUB_SECRET_HASHER,
      randomBytes: deterministicRng(),
    });
    expect(result.plaintext.startsWith(API_KEY_PREFIX_LIVE)).toBe(true);
  });

  it('produces a key with the correct total length (8 + 64 = 72)', () => {
    const result = generateApiKey({
      hasher: STUB_SECRET_HASHER,
      randomBytes: deterministicRng(),
    });
    expect(result.plaintext).toHaveLength(8 + API_KEY_ENTROPY_BYTES * 2);
  });

  it('produces a different plaintext on each call (using STUB RNG)', () => {
    const a = generateApiKey({
      hasher: STUB_SECRET_HASHER,
      randomBytes: STUB_RANDOM_BYTES,
    });
    const b = generateApiKey({
      hasher: STUB_SECRET_HASHER,
      randomBytes: STUB_RANDOM_BYTES,
    });
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.keyHash).not.toBe(b.keyHash);
  });

  it('produces a frozen result object', () => {
    const result = generateApiKey({
      hasher: STUB_SECRET_HASHER,
      randomBytes: deterministicRng(),
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('throws on invalid environment', () => {
    expect(() =>
      generateApiKey({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        environment: 'staging' as any,
        hasher: STUB_SECRET_HASHER,
        randomBytes: deterministicRng(),
      }),
    ).toThrow("environment must be 'live' or 'test'");
  });

  it('throws when hasher is not a function', () => {
    expect(() =>
      generateApiKey({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hasher: 'not-a-function' as any,
        randomBytes: deterministicRng(),
      }),
    ).toThrow('hasher must be a SecretHasher function');
  });

  it('throws when rng returns wrong-length output', () => {
    const badRng = () => 'too-short';
    expect(() =>
      generateApiKey({
        hasher: STUB_SECRET_HASHER,
        randomBytes: badRng,
      }),
    ).toThrow(/randomBytes must return/);
  });
});

describe('validateApiKeyFormat', () => {
  it('returns true for a valid live key', () => {
    const result = generateApiKey({
      hasher: STUB_SECRET_HASHER,
      randomBytes: deterministicRng(),
    });
    expect(validateApiKeyFormat(result.plaintext)).toBe(true);
  });

  it('returns true for a valid test key', () => {
    const result = generateApiKey({
      environment: 'test',
      hasher: STUB_SECRET_HASHER,
      randomBytes: deterministicRng(),
    });
    expect(validateApiKeyFormat(result.plaintext)).toBe(true);
  });

  it('returns false for a key with a wrong prefix', () => {
    expect(validateApiKeyFormat('bl_staging_' + 'a'.repeat(64))).toBe(false);
  });

  it('returns false for a key with the wrong entropy length', () => {
    expect(validateApiKeyFormat('bl_live_' + 'a'.repeat(32))).toBe(false);
  });

  it('returns false for a key with non-hex chars', () => {
    expect(
      validateApiKeyFormat('bl_live_' + 'g'.repeat(64)),
    ).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(validateApiKeyFormat('')).toBe(false);
  });

  it('returns false for non-string input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validateApiKeyFormat(null as any)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validateApiKeyFormat(undefined as any)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validateApiKeyFormat(123 as any)).toBe(false);
  });
});

describe('isApiKeyExpired', () => {
  const baseKey: ApiKey = {
    id: 'key_1',
    name: 'CI key',
    prefix: 'bl_live_',
    keyHash: 'hash',
    scopes: ['read:expenses'],
    userId: 'user_abc',
    createdAt: NOW,
  };

  it('returns false for a key with no expiry', () => {
    expect(isApiKeyExpired(baseKey, FUTURE)).toBe(false);
  });

  it('returns false for a key that has not yet expired', () => {
    const key: ApiKey = { ...baseKey, expiresAt: FUTURE };
    expect(isApiKeyExpired(key, NOW)).toBe(false);
  });

  it('returns true for a key that has expired', () => {
    const key: ApiKey = { ...baseKey, expiresAt: NOW };
    expect(isApiKeyExpired(key, FUTURE)).toBe(true);
  });

  it('returns true at the exact expiry instant (fail closed)', () => {
    const key: ApiKey = { ...baseKey, expiresAt: NOW };
    expect(isApiKeyExpired(key, NOW)).toBe(true);
  });

  it('returns true for an unparseable expiry (fail closed)', () => {
    const key: ApiKey = { ...baseKey, expiresAt: 'not-a-date' };
    expect(isApiKeyExpired(key, NOW)).toBe(true);
  });

  it('returns true for an unparseable now (fail closed)', () => {
    const key: ApiKey = { ...baseKey, expiresAt: FUTURE };
    expect(isApiKeyExpired(key, 'not-a-date')).toBe(true);
  });
});

describe('createApiKey', () => {
  it('constructs an ApiKey from repository input', () => {
    const key = createApiKey({
      id: 'key_1',
      name: 'CI key',
      prefix: 'bl_live_',
      keyHash: 'hash',
      scopes: ['read:expenses'],
      userId: 'user_abc',
      createdAt: NOW,
    });
    expect(key.id).toBe('key_1');
    expect(key.scopes).toEqual(['read:expenses']);
  });

  it('returns a frozen object with frozen scopes', () => {
    const key = createApiKey({
      id: 'key_1',
      name: 'CI key',
      prefix: 'bl_live_',
      keyHash: 'hash',
      scopes: ['read:expenses'],
      userId: 'user_abc',
      createdAt: NOW,
    });
    expect(Object.isFrozen(key)).toBe(true);
    expect(Object.isFrozen(key.scopes)).toBe(true);
  });

  it('throws on a wrong-length prefix', () => {
    expect(() =>
      createApiKey({
        id: 'key_1',
        name: 'CI key',
        prefix: 'too-short',
        keyHash: 'hash',
        scopes: ['read:expenses'],
        userId: 'user_abc',
        createdAt: NOW,
      }),
    ).toThrow(/prefix must be/);
  });

  it('throws on empty keyHash', () => {
    expect(() =>
      createApiKey({
        id: 'key_1',
        name: 'CI key',
        prefix: 'bl_live_',
        keyHash: '',
        scopes: ['read:expenses'],
        userId: 'user_abc',
        createdAt: NOW,
      }),
    ).toThrow('keyHash must be a non-empty string');
  });

  it('throws on empty scopes', () => {
    expect(() =>
      createApiKey({
        id: 'key_1',
        name: 'CI key',
        prefix: 'bl_live_',
        keyHash: 'hash',
        scopes: [],
        userId: 'user_abc',
        createdAt: NOW,
      }),
    ).toThrow('scopes must contain at least one scope');
  });
});

describe('touchApiKeyLastUsed', () => {
  it('returns a copy of the key with lastUsedAt updated', () => {
    const key = createApiKey({
      id: 'key_1',
      name: 'CI key',
      prefix: 'bl_live_',
      keyHash: 'hash',
      scopes: ['read:expenses'],
      userId: 'user_abc',
      createdAt: NOW,
    });
    const touched = touchApiKeyLastUsed(key, FUTURE);
    expect(touched.lastUsedAt).toBe(FUTURE);
    expect(key.lastUsedAt).toBeUndefined();
    expect(Object.isFrozen(touched)).toBe(true);
  });

  it('throws on an invalid now', () => {
    const key = createApiKey({
      id: 'key_1',
      name: 'CI key',
      prefix: 'bl_live_',
      keyHash: 'hash',
      scopes: ['read:expenses'],
      userId: 'user_abc',
      createdAt: NOW,
    });
    expect(() => touchApiKeyLastUsed(key, 'not-a-date')).toThrow(
      'now must be a valid ISO date-time',
    );
  });
});
