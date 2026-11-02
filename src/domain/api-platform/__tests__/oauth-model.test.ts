/**
 * OAuth model tests.
 *
 * Phase 10 Prompt 94.
 */

import { describe, expect, it } from '@jest/globals';

import { STUB_SECRET_HASHER } from '../../security/secret-rotation';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_TTL_SECONDS,
  areScopesAllowed,
  getExpiredScopes,
  isAuthorizationCodeExpired,
  isGrantTypeAllowed,
  isTokenExpired,
  issueAccessToken,
  issueAuthorizationCode,
  validateOAuthClient,
  validateRedirectUri,
  type AccessToken,
  type AuthorizationCode,
  type OAuthClient,
} from '../oauth-model';

const NOW = '2026-07-15T12:00:00.000Z';
const ONE_HOUR_LATER = '2026-07-15T13:00:00.000Z';

const VALID_CLIENT: OAuthClient = {
  id: 'client_123',
  name: 'Test App',
  redirectUris: ['https://app.example.com/callback'],
  scopes: ['read:groups', 'write:groups', 'read:expenses'],
  grantTypes: ['authorization_code', 'refresh_token'],
  createdAt: NOW,
  createdBy: 'user_abc',
};

describe('validateRedirectUri', () => {
  it('accepts an exact-match redirect URI', () => {
    expect(
      validateRedirectUri(VALID_CLIENT, 'https://app.example.com/callback'),
    ).toBe(true);
  });

  it('rejects a substring match (open-redirect defence)', () => {
    expect(
      validateRedirectUri(
        VALID_CLIENT,
        'https://attacker.com/?https://app.example.com/callback',
      ),
    ).toBe(false);
  });

  it('rejects a URI differing only by query string', () => {
    expect(
      validateRedirectUri(VALID_CLIENT, 'https://app.example.com/callback?state=xyz'),
    ).toBe(false);
  });

  it('rejects a URI differing only by fragment', () => {
    expect(
      validateRedirectUri(VALID_CLIENT, 'https://app.example.com/callback#fragment'),
    ).toBe(false);
  });

  it('rejects an empty redirectUri', () => {
    expect(validateRedirectUri(VALID_CLIENT, '')).toBe(false);
  });

  it('rejects when client has no registered URIs', () => {
    expect(
      validateRedirectUri(
        { ...VALID_CLIENT, redirectUris: [] },
        'https://app.example.com/callback',
      ),
    ).toBe(false);
  });
});

describe('isTokenExpired', () => {
  const token: AccessToken = {
    token: '',
    tokenHash: 'hash',
    clientId: 'client_123',
    userId: 'user_abc',
    scopes: ['read:groups'],
    expiresAt: ONE_HOUR_LATER,
    createdAt: NOW,
  };

  it('returns false for a token that expires in the future', () => {
    expect(isTokenExpired(token, NOW)).toBe(false);
  });

  it('returns true for a token that expired in the past', () => {
    expect(isTokenExpired(token, '2026-07-16T12:00:00.000Z')).toBe(true);
  });

  it('returns true at the exact expiry instant (fail closed)', () => {
    expect(isTokenExpired(token, ONE_HOUR_LATER)).toBe(true);
  });

  it('returns true for an unparseable expiry (fail closed)', () => {
    expect(
      isTokenExpired({ ...token, expiresAt: 'not-a-date' }, NOW),
    ).toBe(true);
  });

  it('returns true for an unparseable now (fail closed)', () => {
    expect(isTokenExpired(token, 'not-a-date')).toBe(true);
  });
});

describe('isAuthorizationCodeExpired', () => {
  const code: AuthorizationCode = {
    code: '',
    codeHash: 'hash',
    clientId: 'client_123',
    userId: 'user_abc',
    scopes: ['read:groups'],
    redirectUri: 'https://app.example.com/callback',
    expiresAt: ONE_HOUR_LATER,
  };

  it('returns false for a code that has not expired', () => {
    expect(isAuthorizationCodeExpired(code, NOW)).toBe(false);
  });

  it('returns true for an expired code', () => {
    expect(isAuthorizationCodeExpired(code, ONE_HOUR_LATER)).toBe(true);
  });
});

describe('getExpiredScopes / areScopesAllowed', () => {
  it('returns empty list when all requested scopes are allowed', () => {
    expect(
      getExpiredScopes(['read:groups', 'read:expenses'], VALID_CLIENT.scopes),
    ).toEqual([]);
  });

  it('returns scopes not in the allowed list', () => {
    const expired = getExpiredScopes(
      ['read:groups', 'write:settlements', 'export:data'],
      VALID_CLIENT.scopes,
    );
    expect(expired).toEqual(['write:settlements', 'export:data']);
  });

  it('returns the full list when none are allowed', () => {
    expect(
      getExpiredScopes(['webhooks:manage'], VALID_CLIENT.scopes),
    ).toEqual(['webhooks:manage']);
  });

  it('areScopesAllowed returns true when all are allowed', () => {
    expect(
      areScopesAllowed(['read:groups'], VALID_CLIENT.scopes),
    ).toBe(true);
  });

  it('areScopesAllowed returns false when any is not allowed', () => {
    expect(
      areScopesAllowed(
        ['read:groups', 'write:settlements'],
        VALID_CLIENT.scopes,
      ),
    ).toBe(false);
  });

  it('returns a frozen array', () => {
    const result = getExpiredScopes(
      ['write:settlements'],
      VALID_CLIENT.scopes,
    );
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe('isGrantTypeAllowed', () => {
  it('returns true for an allowed grant type', () => {
    expect(isGrantTypeAllowed(VALID_CLIENT, 'authorization_code')).toBe(true);
  });

  it('returns false for a disallowed grant type', () => {
    expect(isGrantTypeAllowed(VALID_CLIENT, 'client_credentials')).toBe(false);
  });
});

describe('issueAccessToken', () => {
  it('returns a token with the plaintext present (for one-time return)', () => {
    const token = issueAccessToken({
      clientId: 'client_123',
      userId: 'user_abc',
      scopes: ['read:groups'],
      plaintextToken: 'opaque-token-value',
      now: NOW,
      hasher: STUB_SECRET_HASHER,
    });
    expect(token.token).toBe('opaque-token-value');
    expect(token.tokenHash).toBe(STUB_SECRET_HASHER('opaque-token-value'));
    expect(token.tokenHash).not.toBe('opaque-token-value');
  });

  it('sets expiresAt to now + ACCESS_TOKEN_TTL_SECONDS by default', () => {
    const token = issueAccessToken({
      clientId: 'client_123',
      userId: 'user_abc',
      scopes: ['read:groups'],
      plaintextToken: 'opaque-token-value',
      now: NOW,
      hasher: STUB_SECRET_HASHER,
    });
    expect(token.expiresAt).toBe(ONE_HOUR_LATER);
    expect(token.createdAt).toBe(NOW);
  });

  it('honours a custom TTL', () => {
    const token = issueAccessToken({
      clientId: 'client_123',
      userId: 'user_abc',
      scopes: ['read:groups'],
      plaintextToken: 'opaque-token-value',
      now: NOW,
      ttlSeconds: 60,
      hasher: STUB_SECRET_HASHER,
    });
    expect(token.expiresAt).toBe('2026-07-15T12:01:00.000Z');
  });

  it('returns a frozen object with frozen scopes', () => {
    const token = issueAccessToken({
      clientId: 'client_123',
      userId: 'user_abc',
      scopes: ['read:groups'],
      plaintextToken: 'opaque-token-value',
      now: NOW,
      hasher: STUB_SECRET_HASHER,
    });
    expect(Object.isFrozen(token)).toBe(true);
    expect(Object.isFrozen(token.scopes)).toBe(true);
  });

  it('throws on empty plaintextToken', () => {
    expect(() =>
      issueAccessToken({
        clientId: 'client_123',
        userId: 'user_abc',
        scopes: ['read:groups'],
        plaintextToken: '',
        now: NOW,
        hasher: STUB_SECRET_HASHER,
      }),
    ).toThrow('plaintextToken must be a non-empty string');
  });

  it('throws when hasher is not a function', () => {
    expect(() =>
      issueAccessToken({
        clientId: 'client_123',
        userId: 'user_abc',
        scopes: ['read:groups'],
        plaintextToken: 'opaque-token-value',
        now: NOW,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hasher: 'not-a-function' as any,
      }),
    ).toThrow('hasher must be a SecretHasher function');
  });

  it('throws on invalid now', () => {
    expect(() =>
      issueAccessToken({
        clientId: 'client_123',
        userId: 'user_abc',
        scopes: ['read:groups'],
        plaintextToken: 'opaque-token-value',
        now: 'not-a-date',
        hasher: STUB_SECRET_HASHER,
      }),
    ).toThrow('now must be a valid ISO date-time');
  });

  it('throws on non-positive TTL', () => {
    expect(() =>
      issueAccessToken({
        clientId: 'client_123',
        userId: 'user_abc',
        scopes: ['read:groups'],
        plaintextToken: 'opaque-token-value',
        now: NOW,
        ttlSeconds: 0,
        hasher: STUB_SECRET_HASHER,
      }),
    ).toThrow('ttlSeconds must be positive');
  });

  it('respects ACCESS_TOKEN_TTL_SECONDS constant', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(3600);
    expect(AUTHORIZATION_CODE_TTL_SECONDS).toBe(600);
  });
});

describe('issueAuthorizationCode', () => {
  it('returns a code with the plaintext present', () => {
    const code = issueAuthorizationCode({
      clientId: 'client_123',
      userId: 'user_abc',
      scopes: ['read:groups'],
      redirectUri: 'https://app.example.com/callback',
      plaintextCode: 'auth-code-123',
      now: NOW,
      hasher: STUB_SECRET_HASHER,
    });
    expect(code.code).toBe('auth-code-123');
    expect(code.codeHash).toBe(STUB_SECRET_HASHER('auth-code-123'));
    expect(code.codeHash).not.toBe('auth-code-123');
    expect(code.expiresAt).toBe('2026-07-15T12:10:00.000Z');
  });

  it('throws on empty plaintextCode', () => {
    expect(() =>
      issueAuthorizationCode({
        clientId: 'client_123',
        userId: 'user_abc',
        scopes: ['read:groups'],
        redirectUri: 'https://app.example.com/callback',
        plaintextCode: '',
        now: NOW,
        hasher: STUB_SECRET_HASHER,
      }),
    ).toThrow('plaintextCode must be a non-empty string');
  });
});

describe('validateOAuthClient', () => {
  it('returns no violations for a valid client', () => {
    expect(validateOAuthClient(VALID_CLIENT)).toEqual([]);
  });

  it('flags a missing id', () => {
    const violations = validateOAuthClient({ ...VALID_CLIENT, id: '' });
    expect(violations).toContain('client.id must be a non-empty string');
  });

  it('flags a missing name', () => {
    const violations = validateOAuthClient({ ...VALID_CLIENT, name: '' });
    expect(violations).toContain('client.name must be a non-empty string');
  });

  it('flags empty redirectUris', () => {
    const violations = validateOAuthClient({
      ...VALID_CLIENT,
      redirectUris: [],
    });
    expect(violations).toContain(
      'client.redirectUris must contain at least one URI',
    );
  });

  it('flags an invalid redirectUri', () => {
    const violations = validateOAuthClient({
      ...VALID_CLIENT,
      redirectUris: ['not-a-url'],
    });
    expect(violations.some((v) => v.startsWith('client.redirectUris contains'))).toBe(true);
  });

  it('flags empty scopes', () => {
    const violations = validateOAuthClient({
      ...VALID_CLIENT,
      scopes: [],
    });
    expect(violations).toContain(
      'client.scopes must contain at least one scope',
    );
  });

  it('flags empty grantTypes', () => {
    const violations = validateOAuthClient({
      ...VALID_CLIENT,
      grantTypes: [],
    });
    expect(violations).toContain(
      'client.grantTypes must contain at least one grant type',
    );
  });

  it('flags an invalid createdAt', () => {
    const violations = validateOAuthClient({
      ...VALID_CLIENT,
      createdAt: 'not-a-date',
    });
    expect(violations).toContain(
      'client.createdAt must be a valid ISO date-time',
    );
  });
});
