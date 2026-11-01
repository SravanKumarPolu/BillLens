/**
 * OAuth 2.0 model — authorization code, refresh token, client credentials.
 *
 * Phase 10 Prompt 94: API and Developer Platform.
 *
 * CRITICAL SECURITY CONSTRAINTS:
 *   - Access tokens, refresh tokens, and authorization codes are stored as
 *     HASHES ONLY. The plaintext token is returned to the client exactly
 *     once (at issuance time) and is never persisted. The hash is computed
 *     via the injected `SecretHasher` (production: SHA-256; tests: a
 *     deterministic stub).
 *   - Redirect URIs MUST be validated against the client's pre-registered
 *     list. Open redirects are a class of OAuth vulnerability — we refuse
 *     any redirect URI that is not an exact match for a registered URI.
 *   - Tokens have a short lifetime (access: 1h, refresh: 30d, auth code:
 *     10min). The gateway consults `isTokenExpired` before honouring a
 *     token.
 *   - The `getExpiredScopes` helper narrows the granted scope set when a
 *     client asks for scopes that the OAuth client is no longer allowed
 *     to grant.
 *
 * This module is PURE: it computes decisions from inputs; it does not store
 * tokens, perform HTTP, or talk to a database.
 *
 * See `docs/api-developer-platform.md`.
 */

import type { SecretHasher } from '../security/secret-rotation';

import type { ApiScope } from './api-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GrantType =
  | 'authorization_code'
  | 'refresh_token'
  | 'client_credentials';

export interface OAuthClient {
  readonly id: string;
  readonly name: string;
  /** Pre-registered redirect URIs. Open redirects are refused. */
  readonly redirectUris: readonly string[];
  /** Scopes this client is allowed to request. */
  readonly scopes: readonly ApiScope[];
  /** Grant types this client is allowed to use. */
  readonly grantTypes: readonly GrantType[];
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface AccessToken {
  /**
   * Plaintext token. This field is present ONLY on the issuance response
   * sent back to the client. Persisted tokens MUST have `token` stripped
   * and `tokenHash` populated. Storage layers MUST reject an
   * `AccessToken` with a non-empty `token` field.
   */
  readonly token: string;
  /** SHA-256 hash of the plaintext token — the ONLY field persisted. */
  readonly tokenHash: string;
  readonly clientId: string;
  readonly userId: string;
  readonly scopes: readonly ApiScope[];
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface AuthorizationCode {
  readonly code: string;
  readonly codeHash: string;
  readonly clientId: string;
  readonly userId: string;
  readonly scopes: readonly ApiScope[];
  readonly redirectUri: string;
  readonly expiresAt: string;
}

// ---------------------------------------------------------------------------
// Constants — token lifetimes (seconds)
// ---------------------------------------------------------------------------

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const AUTHORIZATION_CODE_TTL_SECONDS = 60 * 10; // 10 minutes

// ---------------------------------------------------------------------------
// Redirect URI validation
// ---------------------------------------------------------------------------

/**
 * Returns true when `redirectUri` is an EXACT match for one of the client's
 * pre-registered redirect URIs.
 *
 * We refuse substring matches and we refuse URIs that differ only by query
 * string or fragment — these are common attack vectors:
 *   - `https://attacker.com/?client_redirect=https://app.example.com`
 *   - `https://app.example.com/callback/../attacker`
 *
 * Production should additionally enforce HTTPS-only redirect URIs (HTTP
 * is acceptable only for `http://localhost` during development).
 */
export function validateRedirectUri(
  client: OAuthClient,
  redirectUri: string,
): boolean {
  if (typeof redirectUri !== 'string' || redirectUri.length === 0) {
    return false;
  }
  return client.redirectUris.includes(redirectUri);
}

// ---------------------------------------------------------------------------
// Token expiration
// ---------------------------------------------------------------------------

/**
 * Returns true when `token.expiresAt` is at or before `now`.
 */
export function isTokenExpired(token: AccessToken, now: string): boolean {
  const nowMs = Date.parse(now);
  const expMs = Date.parse(token.expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expMs)) {
    // If either timestamp is unparseable, treat as expired (fail closed).
    return true;
  }
  return expMs <= nowMs;
}

/**
 * Returns true when an authorization code has expired.
 */
export function isAuthorizationCodeExpired(
  code: AuthorizationCode,
  now: string,
): boolean {
  const nowMs = Date.parse(now);
  const expMs = Date.parse(code.expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expMs)) {
    return true;
  }
  return expMs <= nowMs;
}

// ---------------------------------------------------------------------------
// Scope narrowing
// ---------------------------------------------------------------------------

/**
 * Returns the subset of `requested` scopes that are NOT allowed by the
 * client's `allowed` scope list. The OAuth server uses this to refuse the
 * requested scope (or, when downgrading is enabled, to silently narrow it).
 *
 * NOTE: BillLens refuses ungranted scopes rather than silently downgrading.
 * Silent downgrade is a known foot-gun (the client thinks it has access to
 * `write:expenses` and the request fails later with a 403).
 */
export function getExpiredScopes(
  requested: readonly ApiScope[],
  allowed: readonly ApiScope[],
): readonly ApiScope[] {
  const allowedSet = new Set(allowed);
  return Object.freeze(requested.filter((s) => !allowedSet.has(s)));
}

/**
 * Returns true when ALL `requested` scopes are present in `allowed`.
 */
export function areScopesAllowed(
  requested: readonly ApiScope[],
  allowed: readonly ApiScope[],
): boolean {
  return getExpiredScopes(requested, allowed).length === 0;
}

// ---------------------------------------------------------------------------
// Token / code construction (hash only — plaintext returned once)
// ---------------------------------------------------------------------------

export interface IssueAccessTokenInput {
  readonly clientId: string;
  readonly userId: string;
  readonly scopes: readonly ApiScope[];
  readonly plaintextToken: string;
  readonly now: string;
  readonly ttlSeconds?: number;
  readonly hasher: SecretHasher;
}

/**
 * Constructs an `AccessToken` from a freshly generated plaintext token.
 *
 * The plaintext token is included in the returned object SO THAT the
 * caller can hand it back to the client exactly once. The caller MUST
 * strip `token` before persisting — only `tokenHash` is persisted.
 */
export function issueAccessToken(input: IssueAccessTokenInput): AccessToken {
  if (typeof input.plaintextToken !== 'string' || input.plaintextToken.length === 0) {
    throw new Error('plaintextToken must be a non-empty string');
  }
  if (typeof input.hasher !== 'function') {
    throw new Error('hasher must be a SecretHasher function');
  }
  if (Number.isNaN(Date.parse(input.now))) {
    throw new Error('now must be a valid ISO date-time');
  }
  const ttl = input.ttlSeconds ?? ACCESS_TOKEN_TTL_SECONDS;
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error(`ttlSeconds must be positive, got ${ttl}`);
  }
  const createdAt = input.now;
  const expiresAt = new Date(
    Date.parse(input.now) + ttl * 1000,
  ).toISOString();
  const tokenHash = input.hasher(input.plaintextToken);
  if (typeof tokenHash !== 'string' || tokenHash.length === 0) {
    throw new Error('hasher returned an empty hash');
  }
  return Object.freeze({
    token: input.plaintextToken,
    tokenHash,
    clientId: input.clientId,
    userId: input.userId,
    scopes: Object.freeze([...input.scopes]),
    expiresAt,
    createdAt,
  });
}

export interface IssueAuthorizationCodeInput {
  readonly clientId: string;
  readonly userId: string;
  readonly scopes: readonly ApiScope[];
  readonly redirectUri: string;
  readonly plaintextCode: string;
  readonly now: string;
  readonly ttlSeconds?: number;
  readonly hasher: SecretHasher;
}

/**
 * Constructs an `AuthorizationCode` from a freshly generated plaintext code.
 * Same persistence rule as access tokens: persist `codeHash` only.
 */
export function issueAuthorizationCode(
  input: IssueAuthorizationCodeInput,
): AuthorizationCode {
  if (typeof input.plaintextCode !== 'string' || input.plaintextCode.length === 0) {
    throw new Error('plaintextCode must be a non-empty string');
  }
  if (typeof input.hasher !== 'function') {
    throw new Error('hasher must be a SecretHasher function');
  }
  if (Number.isNaN(Date.parse(input.now))) {
    throw new Error('now must be a valid ISO date-time');
  }
  const ttl = input.ttlSeconds ?? AUTHORIZATION_CODE_TTL_SECONDS;
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error(`ttlSeconds must be positive, got ${ttl}`);
  }
  const expiresAt = new Date(
    Date.parse(input.now) + ttl * 1000,
  ).toISOString();
  const codeHash = input.hasher(input.plaintextCode);
  if (typeof codeHash !== 'string' || codeHash.length === 0) {
    throw new Error('hasher returned an empty hash');
  }
  return Object.freeze({
    code: input.plaintextCode,
    codeHash,
    clientId: input.clientId,
    userId: input.userId,
    scopes: Object.freeze([...input.scopes]),
    redirectUri: input.redirectUri,
    expiresAt,
  });
}

// ---------------------------------------------------------------------------
// Grant-type validation
// ---------------------------------------------------------------------------

/**
 * Returns true when `client` is permitted to use `grantType`.
 */
export function isGrantTypeAllowed(
  client: OAuthClient,
  grantType: GrantType,
): boolean {
  return client.grantTypes.includes(grantType);
}

/**
 * Validates an OAuth client against a minimal sanity checklist. Returns a
 * list of violations (empty = valid).
 */
export function validateOAuthClient(client: OAuthClient): readonly string[] {
  const violations: string[] = [];
  if (typeof client.id !== 'string' || client.id.length === 0) {
    violations.push('client.id must be a non-empty string');
  }
  if (typeof client.name !== 'string' || client.name.length === 0) {
    violations.push('client.name must be a non-empty string');
  }
  if (!Array.isArray(client.redirectUris) || client.redirectUris.length === 0) {
    violations.push('client.redirectUris must contain at least one URI');
  } else {
    for (const uri of client.redirectUris) {
      try {
        // eslint-disable-next-line no-new
        new URL(uri);
      } catch {
        violations.push(`client.redirectUris contains an invalid URI: ${uri}`);
      }
    }
  }
  if (!Array.isArray(client.scopes) || client.scopes.length === 0) {
    violations.push('client.scopes must contain at least one scope');
  }
  if (!Array.isArray(client.grantTypes) || client.grantTypes.length === 0) {
    violations.push('client.grantTypes must contain at least one grant type');
  }
  if (Number.isNaN(Date.parse(client.createdAt))) {
    violations.push('client.createdAt must be a valid ISO date-time');
  }
  return Object.freeze(violations);
}
