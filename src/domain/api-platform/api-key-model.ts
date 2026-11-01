/**
 * API key model — long-lived credentials for server-to-server integrations.
 *
 * Phase 10 Prompt 94: API and Developer Platform.
 *
 * CRITICAL SECURITY CONSTRAINTS:
 *   - API keys are stored as HASHES ONLY. The plaintext key is returned
 *     to the developer exactly once (at creation time) and is never
 *     persisted. Storage layers MUST reject an `ApiKey` with a non-empty
 *     plaintext (we don't even include it in the type — see
 *     `generateApiKey()`).
 *   - The `prefix` field (first 8 chars of the plaintext) IS stored so
 *     the developer-portal UI can show a recognisable prefix like
 *     `bl_live_ab12…` without revealing the key.
 *   - Key format: `bl_<env>_<random>`
 *     - `bl_live_` for production keys
 *     - `bl_test_` for sandbox keys
 *     - 32 hex chars of entropy (128 bits)
 *   - Keys have an optional expiry. `isApiKeyExpired` is consulted by
 *     the gateway before honouring a key.
 *
 * This module is PURE: it computes decisions from inputs. Random
 * generation is delegated to an injected `RandomBytesGenerator` port
 * (production: `crypto.randomBytes`; tests: a deterministic stub).
 *
 * See `docs/api-developer-platform.md`.
 */

import type { SecretHasher } from '../security/secret-rotation';

import type { ApiScope } from './api-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKey {
  readonly id: string;
  readonly name: string;
  /** First 8 chars of the plaintext key — visible in the developer portal. */
  readonly prefix: string;
  /** SHA-256 hash of the plaintext key — the ONLY field persisted. */
  readonly keyHash: string;
  readonly scopes: readonly ApiScope[];
  readonly userId: string;
  readonly expiresAt?: string;
  readonly lastUsedAt?: string;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const API_KEY_PREFIX_LIVE = 'bl_live_';
export const API_KEY_PREFIX_TEST = 'bl_test_';
export const API_KEY_ENTROPY_BYTES = 32; // 256 bits → 64 hex chars
export const API_KEY_PREFIX_DISPLAY_LENGTH = 8;

/**
 * Random-bytes generator port. Returns a hex string of `bytes` entropy.
 * Production: `crypto.randomBytes(bytes).toString('hex')`.
 * Tests: a deterministic stub.
 */
export type RandomBytesGenerator = (bytes: number) => string;

/**
 * Reference stub RNG — uses `Math.random`. NOT cryptographically secure.
 * Production MUST inject a real RNG backed by `crypto.randomBytes`.
 */
export const STUB_RANDOM_BYTES: RandomBytesGenerator = (bytes: number): string => {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error(`bytes must be a positive integer, got ${bytes}`);
  }
  let out = '';
  for (let i = 0; i < bytes; i++) {
    out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  }
  return out;
};

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface GenerateApiKeyInput {
  readonly environment?: 'live' | 'test';
  readonly hasher: SecretHasher;
  readonly randomBytes?: RandomBytesGenerator;
}

/**
 * Generates a new API key.
 *
 * Returns an object containing the plaintext key (returned to the developer
 * EXACTLY ONCE — they MUST store it securely; BillLens does NOT keep it),
 * the SHA-256 hash (the ONLY thing BillLens persists), and the visible
 * prefix (so the developer-portal UI can show `bl_live_ab12…`).
 *
 * The plaintext key format is:
 *
 *   bl_live_<64 hex chars>     (production)
 *   bl_test_<64 hex chars>     (sandbox)
 *
 * Total length: 8 + 64 = 72 chars.
 */
export function generateApiKey(
  input: GenerateApiKeyInput,
): { plaintext: string; keyHash: string; prefix: string } {
  const environment = input.environment ?? 'live';
  if (environment !== 'live' && environment !== 'test') {
    throw new Error(`environment must be 'live' or 'test', got ${environment}`);
  }
  if (typeof input.hasher !== 'function') {
    throw new Error('hasher must be a SecretHasher function');
  }
  const rng = input.randomBytes ?? STUB_RANDOM_BYTES;
  if (typeof rng !== 'function') {
    throw new Error('randomBytes must be a function');
  }
  const entropy = rng(API_KEY_ENTROPY_BYTES);
  if (typeof entropy !== 'string' || entropy.length !== API_KEY_ENTROPY_BYTES * 2) {
    throw new Error(
      `randomBytes must return ${API_KEY_ENTROPY_BYTES * 2} hex chars, got length ${entropy?.length}`,
    );
  }
  const prefixLabel =
    environment === 'live' ? API_KEY_PREFIX_LIVE : API_KEY_PREFIX_TEST;
  const plaintext = `${prefixLabel}${entropy}`;
  const keyHash = input.hasher(plaintext);
  if (typeof keyHash !== 'string' || keyHash.length === 0) {
    throw new Error('hasher returned an empty hash');
  }
  const prefix = plaintext.slice(0, API_KEY_PREFIX_DISPLAY_LENGTH);
  return Object.freeze({ plaintext, keyHash, prefix });
}

// ---------------------------------------------------------------------------
// Format validation
// ---------------------------------------------------------------------------

const API_KEY_REGEX = /^bl_(live|test)_[0-9a-f]{64}$/;

/**
 * Returns true when `key` matches the BillLens API key format.
 *
 * This is a STRUCTURAL check only — it does not verify the hash against
 * stored keys (that requires a database lookup). The gateway calls this
 * before hashing + looking up the key, to fail fast on obviously
 * malformed input.
 */
export function validateApiKeyFormat(key: string): boolean {
  if (typeof key !== 'string') return false;
  return API_KEY_REGEX.test(key);
}

// ---------------------------------------------------------------------------
// Expiration
// ---------------------------------------------------------------------------

/**
 * Returns true when `key.expiresAt` is at or before `now`.
 *
 * Keys with NO `expiresAt` field never expire (this is allowed for
 * long-lived server-to-server integrations — they are revoked manually
 * when no longer needed).
 */
export function isApiKeyExpired(key: ApiKey, now: string): boolean {
  if (key.expiresAt === undefined) return false;
  const nowMs = Date.parse(now);
  const expMs = Date.parse(key.expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expMs)) {
    // Unparseable expiry — fail closed.
    return true;
  }
  return expMs <= nowMs;
}

// ---------------------------------------------------------------------------
// Construction (for repository hydration)
// ---------------------------------------------------------------------------

export interface ApiKeyInput {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly keyHash: string;
  readonly scopes: readonly ApiScope[];
  readonly userId: string;
  readonly expiresAt?: string;
  readonly lastUsedAt?: string;
  readonly createdAt: string;
}

/**
 * Constructs an `ApiKey` from repository input. Validates the hash is
 * non-empty and the prefix matches the expected length.
 */
export function createApiKey(input: ApiKeyInput): ApiKey {
  if (typeof input.id !== 'string' || input.id.length === 0) {
    throw new Error('id must be a non-empty string');
  }
  if (typeof input.name !== 'string' || input.name.length === 0) {
    throw new Error('name must be a non-empty string');
  }
  if (
    typeof input.prefix !== 'string' ||
    input.prefix.length !== API_KEY_PREFIX_DISPLAY_LENGTH
  ) {
    throw new Error(
      `prefix must be ${API_KEY_PREFIX_DISPLAY_LENGTH} chars, got "${input.prefix}"`,
    );
  }
  if (typeof input.keyHash !== 'string' || input.keyHash.length === 0) {
    throw new Error('keyHash must be a non-empty string');
  }
  if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
    throw new Error('scopes must contain at least one scope');
  }
  if (typeof input.userId !== 'string' || input.userId.length === 0) {
    throw new Error('userId must be a non-empty string');
  }
  if (Number.isNaN(Date.parse(input.createdAt))) {
    throw new Error('createdAt must be a valid ISO date-time');
  }
  return Object.freeze({
    id: input.id,
    name: input.name,
    prefix: input.prefix,
    keyHash: input.keyHash,
    scopes: Object.freeze([...input.scopes]),
    userId: input.userId,
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    ...(input.lastUsedAt !== undefined ? { lastUsedAt: input.lastUsedAt } : {}),
    createdAt: input.createdAt,
  });
}

/**
 * Returns a copy of the key with `lastUsedAt` updated. Used by the gateway
 * to record the most recent use of the key (for the developer-portal
 * "last used" column and for stale-key detection).
 */
export function touchApiKeyLastUsed(
  key: ApiKey,
  now: string,
): ApiKey {
  if (Number.isNaN(Date.parse(now))) {
    throw new Error('now must be a valid ISO date-time');
  }
  return Object.freeze({ ...key, lastUsedAt: now });
}
