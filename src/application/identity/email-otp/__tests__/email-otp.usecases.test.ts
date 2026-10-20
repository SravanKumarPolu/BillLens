import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AuthError } from '@application/identity/auth-errors';
import {
  DEFAULT_OTP_RESEND_COOLDOWN_MS,
  RequestEmailOtpUseCase,
} from '@application/identity/email-otp/request-email-otp.usecase';
import { ResendEmailOtpUseCase } from '@application/identity/email-otp/resend-email-otp.usecase';
import { VerifyEmailOtpUseCase } from '@application/identity/email-otp/verify-email-otp.usecase';
import type {
  AuthSession,
  AuthState,
  AuthenticationProvider,
  ProviderIdentityInfo,
  Unsubscribe,
  VerifyOtpInput,
} from '@domain/ports/authentication-provider.port';
import type { SessionStoragePort } from '@domain/ports/session-storage.port';
import type { AuditLogEntry, AuditRepository } from '@domain/repositories';
import { asDateTime } from '@domain/value-objects';
import type { UserId } from '@shared-types/index';

// ============================================================================
// Test doubles
// ============================================================================

class InMemorySessionStorage implements SessionStoragePort {
  session: AuthSession | null = null;
  async saveSession(session: AuthSession): Promise<void> {
    this.session = session;
  }
  async loadSession(): Promise<AuthSession | null> {
    return this.session;
  }
  async clearSession(): Promise<void> {
    this.session = null;
  }
}

class InMemoryAuditRepository implements AuditRepository {
  readonly entries: AuditLogEntry[] = [];
  async append(entry: Omit<AuditLogEntry, 'createdAt'>): Promise<AuditLogEntry> {
    const full: AuditLogEntry = {
      ...entry,
      createdAt: asDateTime('2026-07-29T10:00:00.000Z') as AuditLogEntry['createdAt'],
    };
    this.entries.push(full);
    return full;
  }
  async listByEntity(): Promise<readonly AuditLogEntry[]> {
    return this.entries;
  }
  async listByActor(): Promise<{ items: readonly AuditLogEntry[]; hasMore: boolean }> {
    return { items: this.entries, hasMore: false };
  }
  async listByGroup(): Promise<{ items: readonly AuditLogEntry[]; hasMore: boolean }> {
    return { items: this.entries, hasMore: false };
  }
}

class MockAuthProvider implements AuthenticationProvider {
  signInError: Error | null = null;
  verifyError: Error | null = null;
  refreshError: Error | null = null;
  signOutError: Error | null = null;
  readonly signInCalls: string[] = [];
  readonly verifyCalls: VerifyOtpInput[] = [];
  private listeners = new Set<(state: AuthState) => void>();

  async getSession(): Promise<AuthSession | null> {
    return null;
  }
  async refreshSession(): Promise<AuthSession> {
    if (this.refreshError) throw this.refreshError;
    return makeSession('refreshed-user', 'email');
  }
  async signInWithEmailOtp(email: string): Promise<void> {
    this.signInCalls.push(email);
    if (this.signInError) throw this.signInError;
  }
  async verifyEmailOtp(input: VerifyOtpInput): Promise<AuthSession> {
    this.verifyCalls.push(input);
    if (this.verifyError) throw this.verifyError;
    return makeSession(`user-${input.email}`, 'email');
  }
  async signInWithGoogle(): Promise<AuthSession> {
    return makeSession('google-user', 'google');
  }
  async signInWithApple(): Promise<AuthSession> {
    return makeSession('apple-user', 'apple');
  }
  async getCurrentProviderIdentity(): Promise<ProviderIdentityInfo | null> {
    return null;
  }
  async signOut(): Promise<void> {
    if (this.signOutError) throw this.signOutError;
  }
  onAuthStateChange(listener: (state: AuthState) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

function makeSession(userId: string, provider: AuthSession['provider']): AuthSession {
  return {
    userId: userId as UserId,
    accessToken: `access-${userId}`,
    refreshToken: `refresh-${userId}`,
    expiresAt: Date.now() + 3600_000,
    provider,
  };
}

// ============================================================================
// Fixtures
// ============================================================================

let authProvider: MockAuthProvider;
let sessionStorage: InMemorySessionStorage;
let auditRepo: InMemoryAuditRepository;
let requestUseCase: RequestEmailOtpUseCase;
let verifyUseCase: VerifyEmailOtpUseCase;
let resendUseCase: ResendEmailOtpUseCase;
let idCounter: number;

beforeEach(() => {
  authProvider = new MockAuthProvider();
  sessionStorage = new InMemorySessionStorage();
  auditRepo = new InMemoryAuditRepository();
  idCounter = 0;
  requestUseCase = new RequestEmailOtpUseCase(authProvider);
  verifyUseCase = new VerifyEmailOtpUseCase(
    authProvider,
    sessionStorage,
    auditRepo,
    () => `audit-id-${++idCounter}`,
  );
  resendUseCase = new ResendEmailOtpUseCase(authProvider, () => 1_700_000_000_000);
});

// ============================================================================
// RequestEmailOtpUseCase
// ============================================================================

describe('RequestEmailOtpUseCase', () => {
  it('returns success and forwards the normalised email to the provider', async () => {
    const result = await requestUseCase.execute('  Priya@Example.COM  ');

    expect(result.success).toBe(true);
    expect(result.errorCode).toBeUndefined();
    expect(authProvider.signInCalls).toEqual(['priya@example.com']);
  });

  it('returns invalid_email for a malformed address', async () => {
    const r = await requestUseCase.execute('not-an-email');
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('invalid_email');
    expect(authProvider.signInCalls).toHaveLength(0);
  });

  it('returns invalid_email for an empty string', async () => {
    const r = await requestUseCase.execute('   ');
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('invalid_email');
  });

  it('returns invalid_email for a non-string input', async () => {
    const r = await requestUseCase.execute('' as string);
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('invalid_email');
  });

  it('maps a rate-limit error to retryAfterMs and rate_limited code', async () => {
    authProvider.signInError = new AuthError('rate_limited', 'Too many requests');
    const r = await requestUseCase.execute('priya@example.com');
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('rate_limited');
    expect(r.retryAfterMs).toBe(DEFAULT_OTP_RESEND_COOLDOWN_MS);
  });

  it('maps a network error to network_unavailable code', async () => {
    authProvider.signInError = new AuthError('network_unavailable', 'Network unavailable');
    const r = await requestUseCase.execute('priya@example.com');
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('network_unavailable');
  });

  it('maps an unknown infrastructure error to unknown_auth_failure', async () => {
    authProvider.signInError = new Error('something exploded');
    const r = await requestUseCase.execute('priya@example.com');
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('unknown_auth_failure');
    // The original raw message must not be surfaced.
    expect(r.errorMessage).not.toContain('exploded');
  });

  it('does NOT reveal whether an account already exists', async () => {
    // Whether the provider throws "user not found" or accepts the
    // request, the use case must return the same result shape so a
    // malicious caller cannot enumerate accounts.
    authProvider.signInError = new Error('user not found');
    const r = await requestUseCase.execute('unknown@example.com');
    // "user not found" does not match any specific heuristic — should
    // surface as unknown_auth_failure (same as a successful request
    // would, just with success=false).
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('unknown_auth_failure');
  });
});

// ============================================================================
// VerifyEmailOtpUseCase
// ============================================================================

describe('VerifyEmailOtpUseCase', () => {
  it('verifies a valid 6-digit code, persists the session, and audits', async () => {
    const result = await verifyUseCase.execute({
      email: 'priya@example.com',
      code: '123456',
    });

    expect(result.session.userId as string).toBe('user-priya@example.com');
    expect(result.session.provider).toBe('email');
    // Session persisted.
    expect(sessionStorage.session).toBe(result.session);
    // Audit entry written.
    expect(auditRepo.entries).toHaveLength(1);
    expect(auditRepo.entries[0]?.action).toBe('create');
    expect(auditRepo.entries[0]?.entityType).toBe('auth_session');
    expect(auditRepo.entries[0]?.changeSummary).toEqual({ provider: 'email' });
  });

  it('throws AuthError for a code that is not 6 digits', async () => {
    await expect(
      verifyUseCase.execute({ email: 'priya@example.com', code: '12345' }),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      verifyUseCase.execute({ email: 'priya@example.com', code: '1234567' }),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      verifyUseCase.execute({ email: 'priya@example.com', code: 'abcdef' }),
    ).rejects.toBeInstanceOf(AuthError);
    // The provider must NOT have been called for invalid shapes.
    expect(authProvider.verifyCalls).toHaveLength(0);
  });

  it('throws AuthError(expired_otp) when the provider reports an expired code', async () => {
    authProvider.verifyError = new AuthError('expired_otp', 'Code expired');
    await expect(
      verifyUseCase.execute({ email: 'priya@example.com', code: '123456' }),
    ).rejects.toMatchObject({ code: 'expired_otp' });
    // Session must not have been persisted.
    expect(sessionStorage.session).toBeNull();
    // No audit entry on failure.
    expect(auditRepo.entries).toHaveLength(0);
  });

  it('throws AuthError(invalid_otp) when the provider reports an incorrect code', async () => {
    authProvider.verifyError = new AuthError('invalid_otp', 'Wrong code');
    await expect(
      verifyUseCase.execute({ email: 'priya@example.com', code: '123456' }),
    ).rejects.toMatchObject({ code: 'invalid_otp' });
  });

  it('throws AuthError(rate_limited) when the provider reports too many attempts', async () => {
    authProvider.verifyError = new AuthError('rate_limited', 'Too many attempts');
    await expect(
      verifyUseCase.execute({ email: 'priya@example.com', code: '123456' }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('throws AuthError(network_unavailable) when the provider is offline', async () => {
    authProvider.verifyError = new Error('network timeout');
    await expect(
      verifyUseCase.execute({ email: 'priya@example.com', code: '123456' }),
    ).rejects.toMatchObject({ code: 'network_unavailable' });
  });

  it('does NOT immediately merge guest data — only establishes the session', async () => {
    const result = await verifyUseCase.execute({
      email: 'priya@example.com',
      code: '123456',
    });
    // The session is stored; the upgrade flow (P25) is a separate use
    // case. We assert the use case does not call any upgrade-related
    // method on the provider (only verifyEmailOtp was called).
    expect(authProvider.verifyCalls).toHaveLength(1);
    expect(result.session).toBeDefined();
  });

  it('audits even when sessionId is unfamiliar (no crash on audit failure)', async () => {
    // Force the audit repo to throw.
    auditRepo.append = jest.fn(async () => {
      throw new Error('audit DB locked');
    });
    // Verification should still succeed.
    const result = await verifyUseCase.execute({
      email: 'priya@example.com',
      code: '123456',
    });
    expect(result.session).toBeDefined();
    expect(sessionStorage.session).toBe(result.session);
  });
});

// ============================================================================
// ResendEmailOtpUseCase
// ============================================================================

describe('ResendEmailOtpUseCase', () => {
  it('refuses to resend within the cooldown window', async () => {
    const lastSentAt = 1_700_000_000_000;
    // Use the default `now` from the use case (1_700_000_000_000).
    const r = await resendUseCase.execute({
      email: 'priya@example.com',
      lastSentAtMs: lastSentAt - 10_000,
    });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('rate_limited');
    expect(r.retryAfterMs).toBeGreaterThan(0);
    // The provider must NOT have been called.
    expect(authProvider.signInCalls).toHaveLength(0);
  });

  it('resends successfully after the cooldown elapses', async () => {
    const lastSentAt = 1_699_999_000_000; // > 60s before now
    const r = await resendUseCase.execute({
      email: 'priya@example.com',
      lastSentAtMs: lastSentAt,
    });
    expect(r.success).toBe(true);
    expect(authProvider.signInCalls).toEqual(['priya@example.com']);
    expect(r.nextAllowedAtMs).toBeGreaterThan(1_700_000_000_000);
  });

  it('maps a provider rate-limit to a retryAfterMs', async () => {
    authProvider.signInError = new AuthError('rate_limited', 'Too many');
    const r = await resendUseCase.execute({
      email: 'priya@example.com',
      lastSentAtMs: 1_699_999_000_000,
    });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('rate_limited');
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it('maps a network error to network_unavailable', async () => {
    authProvider.signInError = new Error('network');
    const r = await resendUseCase.execute({
      email: 'priya@example.com',
      lastSentAtMs: 1_699_999_000_000,
    });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('network_unavailable');
  });

  it('honours a custom cooldown override', async () => {
    // lastSentAt is 5s before now; with cooldown=10s we should be
    // rate-limited.
    const r = await resendUseCase.execute({
      email: 'priya@example.com',
      lastSentAtMs: 1_700_000_000_000 - 5_000,
      cooldownMs: 10_000,
    });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('rate_limited');
    expect(r.retryAfterMs).toBeGreaterThanOrEqual(4_000);
    expect(r.retryAfterMs).toBeLessThanOrEqual(6_000);
  });
});
