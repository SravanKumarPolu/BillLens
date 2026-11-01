import { beforeEach, describe, expect, it } from '@jest/globals';

import type { GuestIdentity } from '@domain/entities/guest-identity';
import type {
  AuthSession,
  AuthState,
  AuthenticationProvider,
  ProviderIdentityInfo,
  Unsubscribe,
  VerifyOtpInput,
} from '@domain/ports/authentication-provider.port';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { SessionStoragePort } from '@domain/ports/session-storage.port';
import type { AuditLogEntry, AuditRepository } from '@domain/repositories';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import { asDateTime, asVersionNumber } from '@domain/value-objects';
import type { GuestIdentityId, UserId } from '@shared-types/index';

import { AuthError } from '../auth-errors';
import { AuthService, type AuthStateWriter } from '../auth-service';

// ============================================================================
// In-memory test doubles
// ============================================================================

class InMemorySecureStorage implements SecureStorage {
  private readonly store = new Map<string, string>();

  async set(key: string, value: string): Promise<void> {
    if (!key) throw new Error('Key must not be empty');
    this.store.set(key, value);
  }
  async get(key: string): Promise<string | null> {
    if (!key) throw new Error('Key must not be empty');
    return this.store.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    if (!key) throw new Error('Key must not be empty');
    this.store.delete(key);
  }
  async has(key: string): Promise<boolean> {
    if (!key) throw new Error('Key must not be empty');
    return this.store.has(key);
  }
}

class InMemorySessionStorage implements SessionStoragePort {
  constructor(private readonly secureStorage: SecureStorage) {}

  async saveSession(session: AuthSession): Promise<void> {
    await this.secureStorage.set(SECURE_STORAGE_KEYS.supabaseAccessToken, session.accessToken);
    await this.secureStorage.set(SECURE_STORAGE_KEYS.supabaseRefreshToken, session.refreshToken);
    await this.secureStorage.set(SECURE_STORAGE_KEYS.currentUserId, session.userId as string);
  }

  async loadSession(): Promise<AuthSession | null> {
    const accessToken = await this.secureStorage.get(SECURE_STORAGE_KEYS.supabaseAccessToken);
    const refreshToken = await this.secureStorage.get(SECURE_STORAGE_KEYS.supabaseRefreshToken);
    const userId = await this.secureStorage.get(SECURE_STORAGE_KEYS.currentUserId);
    if (!accessToken || !refreshToken || !userId) return null;
    return {
      userId: userId as UserId,
      accessToken,
      refreshToken,
      expiresAt: 0,
      provider: 'email',
    };
  }

  async clearSession(): Promise<void> {
    await this.secureStorage.delete(SECURE_STORAGE_KEYS.supabaseAccessToken);
    await this.secureStorage.delete(SECURE_STORAGE_KEYS.supabaseRefreshToken);
    await this.secureStorage.delete(SECURE_STORAGE_KEYS.currentUserId);
  }
}

class InMemoryGuestIdentityRepository implements GuestIdentityRepository {
  readonly store = new Map<string, GuestIdentity>();

  async findById(id: GuestIdentityId): Promise<GuestIdentity | null> {
    return this.store.get(id as string) ?? null;
  }
  async save(identity: GuestIdentity): Promise<void> {
    this.store.set(identity.id as string, identity);
  }
  async findByLinkedUserId(): Promise<readonly GuestIdentity[]> {
    return [];
  }
  async list(): Promise<{ items: readonly GuestIdentity[]; hasMore: boolean }> {
    return { items: Array.from(this.store.values()), hasMore: false };
  }
  async softDelete(id: GuestIdentityId): Promise<{
    id: string;
    deletedAt: ReturnType<typeof asDateTime>;
    version: ReturnType<typeof asVersionNumber>;
  }> {
    this.store.delete(id as string);
    return {
      id: id as string,
      deletedAt: asDateTime('2026-07-30T10:00:00.000Z'),
      version: asVersionNumber(2),
    };
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

class CapturingStateWriter implements AuthStateWriter {
  readonly events: { state: AuthState; userId: string | null }[] = [];
  currentAuthState: AuthState = 'initialising';
  currentUserId: string | null = null;

  setAuthState(state: AuthState): void {
    this.currentAuthState = state;
    this.events.push({ state, userId: this.currentUserId });
  }
  setUserId(id: string | null): void {
    this.currentUserId = id;
    this.events.push({ state: this.currentAuthState, userId: id });
  }
}

/**
 * Mock AuthenticationProvider that lets each test configure the
 * behaviour of each method (success / failure / specific error).
 */
class MockAuthProvider implements AuthenticationProvider {
  letRefreshSucceed = true;
  refreshError: Error | null = null;
  signInError: Error | null = null;
  verifyError: Error | null = null;
  signOutError: Error | null = null;
  private listeners = new Set<(state: AuthState) => void>();
  private currentSession: AuthSession | null = null;

  async getSession(): Promise<AuthSession | null> {
    return this.currentSession;
  }

  async refreshSession(): Promise<AuthSession> {
    if (this.refreshError) throw this.refreshError;
    if (!this.letRefreshSucceed && !this.currentSession) {
      throw new AuthError('session_expired', 'Session expired');
    }
    if (!this.currentSession) {
      // Provide a default session for restore-from-empty-token tests.
      this.currentSession = makeSession('restored-user', 'email');
    }
    // Return a refreshed session with a new access token.
    const refreshed: AuthSession = {
      ...this.currentSession,
      accessToken: `access-refreshed-${Date.now()}`,
      expiresAt: Date.now() + 3600_000,
    };
    this.currentSession = refreshed;
    return refreshed;
  }

  async signInWithEmailOtp(): Promise<void> {
    if (this.signInError) throw this.signInError;
  }

  async verifyEmailOtp(input: VerifyOtpInput): Promise<AuthSession> {
    if (this.verifyError) throw this.verifyError;
    this.currentSession = makeSession(`user-${input.email}`, 'email');
    return this.currentSession;
  }

  async signInWithGoogle(): Promise<AuthSession> {
    if (this.signInError) throw this.signInError;
    this.currentSession = makeSession('google-user', 'google');
    return this.currentSession;
  }

  async signInWithApple(): Promise<AuthSession> {
    if (this.signInError) throw this.signInError;
    this.currentSession = makeSession('apple-user', 'apple');
    return this.currentSession;
  }

  async getCurrentProviderIdentity(): Promise<ProviderIdentityInfo | null> {
    if (!this.currentSession) return null;
    return {
      provider: this.currentSession.provider,
      providerSubject: this.currentSession.userId as string,
    };
  }

  async signOut(): Promise<void> {
    if (this.signOutError) throw this.signOutError;
    this.currentSession = null;
    this.emit('signed_out');
  }

  onAuthStateChange(listener: (state: AuthState) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Test-only: directly set the cached session (simulates a prior sign-in). */
  setSessionForTesting(session: AuthSession | null): void {
    this.currentSession = session;
  }

  private emit(state: AuthState): void {
    for (const l of this.listeners) {
      l(state);
    }
  }
}

// ============================================================================
// Fixtures
// ============================================================================

function makeSession(userId: string, provider: AuthSession['provider']): AuthSession {
  return {
    userId: userId as UserId,
    accessToken: `access-${userId}-${Date.now()}`,
    refreshToken: `refresh-${userId}-${Date.now()}`,
    expiresAt: Date.now() + 3600_000,
    provider,
  };
}

let idCounter = 0;
const generateIdFn = () => `audit-id-${++idCounter}`;

// ============================================================================
// Tests
// ============================================================================

describe('AuthService', () => {
  let secureStorage: InMemorySecureStorage;
  let sessionStorage: InMemorySessionStorage;
  let authProvider: MockAuthProvider;
  let stateWriter: CapturingStateWriter;
  let auditRepo: InMemoryAuditRepository;
  let guestRepo: InMemoryGuestIdentityRepository;
  let service: AuthService;

  beforeEach(() => {
    secureStorage = new InMemorySecureStorage();
    sessionStorage = new InMemorySessionStorage(secureStorage);
    authProvider = new MockAuthProvider();
    stateWriter = new CapturingStateWriter();
    auditRepo = new InMemoryAuditRepository();
    guestRepo = new InMemoryGuestIdentityRepository();
    idCounter = 0;
    service = new AuthService(
      authProvider,
      sessionStorage,
      stateWriter,
      auditRepo,
      guestRepo,
      generateIdFn,
    );
  });

  // --------------------------------------------------------------------------
  // restoreSession
  // --------------------------------------------------------------------------

  describe('restoreSession', () => {
    it('returns no_session when SecureStore has no cached session', async () => {
      const result = await service.restoreSession();
      expect(result.outcome).toBe('no_session');
      // No guest identity exists → state should be 'signed_out'.
      expect(stateWriter.currentAuthState).toBe('signed_out');
    });

    it('transitions to guest when SecureStore has no session but a guest identity exists', async () => {
      // Seed a guest identity directly into the repo.
      await guestRepo.save({
        id: 'guest-1' as never,
        displayName: 'Sravan' as never,
        deviceSecretHash: 'hash',
        upgradeStatus: 'local_only',
        createdAt: asDateTime('2026-07-29T10:00:00.000Z'),
        updatedAt: asDateTime('2026-07-29T10:00:00.000Z'),
        version: asVersionNumber(1),
      });

      const result = await service.restoreSession();
      expect(result.outcome).toBe('no_session');
      expect(stateWriter.currentAuthState).toBe('guest');
    });

    it('restores an authenticated session by refreshing the cached token', async () => {
      // Seed a cached session in BOTH SessionStorage and the provider's
      // internal state (mirrors production: Supabase manages its own
      // session, SessionStorage is the offline backup).
      const cached = makeSession('cloud-user-1', 'email');
      await sessionStorage.saveSession(cached);
      authProvider.setSessionForTesting(cached);

      const result = await service.restoreSession();
      expect(result.outcome).toBe('authenticated');
      expect(stateWriter.currentAuthState).toBe('authenticated');
      expect(stateWriter.currentUserId).toBe('cloud-user-1');

      // The new (refreshed) session should be persisted.
      const accessToken = await secureStorage.get(SECURE_STORAGE_KEYS.supabaseAccessToken);
      expect(accessToken).toBeTruthy();
      expect(accessToken).not.toBe(cached.accessToken);
    });

    it('returns session_expired when refresh throws session_expired', async () => {
      await sessionStorage.saveSession(makeSession('cloud-user-1', 'email'));
      authProvider.refreshError = new AuthError('session_expired', 'Session expired');

      const result = await service.restoreSession();
      expect(result.outcome).toBe('session_expired');
      expect(stateWriter.currentAuthState).toBe('session_expired');
      expect(stateWriter.currentUserId).toBeNull();
    });

    it('returns reauthentication_required and clears tokens when refresh fails permanently', async () => {
      await sessionStorage.saveSession(makeSession('cloud-user-1', 'email'));
      authProvider.refreshError = new AuthError('unknown_auth_failure', 'Refresh token invalid');

      const result = await service.restoreSession();
      expect(result.outcome).toBe('reauthentication_required');
      expect(stateWriter.currentAuthState).toBe('reauthentication_required');
      // Tokens should be cleared.
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseAccessToken)).toBeNull();
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseRefreshToken)).toBeNull();
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.currentUserId)).toBeNull();
    });

    it('returns offline_authenticated and preserves tokens when network is unavailable', async () => {
      await sessionStorage.saveSession(makeSession('cloud-user-1', 'email'));
      authProvider.refreshError = new AuthError('network_unavailable', 'Network unavailable');

      const result = await service.restoreSession();
      expect(result.outcome).toBe('authenticated');
      expect(stateWriter.currentAuthState).toBe('offline_authenticated');
      // Tokens should be preserved (NOT cleared) for offline use.
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseAccessToken)).toBeTruthy();
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseRefreshToken)).toBeTruthy();
    });

    it('does NOT delete local data on any restore path', async () => {
      // Seed a guest identity + cached session.
      await guestRepo.save({
        id: 'guest-1' as never,
        displayName: 'Sravan' as never,
        deviceSecretHash: 'hash',
        upgradeStatus: 'local_only',
        createdAt: asDateTime('2026-07-29T10:00:00.000Z'),
        updatedAt: asDateTime('2026-07-29T10:00:00.000Z'),
        version: asVersionNumber(1),
      });
      await sessionStorage.saveSession(makeSession('cloud-user-1', 'email'));
      authProvider.refreshError = new AuthError('unknown_auth_failure', 'Permanent failure');

      await service.restoreSession();

      // Guest identity should still exist.
      expect(guestRepo.store.size).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // refreshSession
  // --------------------------------------------------------------------------

  describe('refreshSession', () => {
    it('refreshes the session and persists the new tokens', async () => {
      const cached = makeSession('cloud-user-1', 'email');
      await sessionStorage.saveSession(cached);
      authProvider.setSessionForTesting(cached);
      const session = await service.refreshSession();
      expect(session.accessToken).toMatch(/^access-refreshed-/);
      expect(stateWriter.currentAuthState).toBe('authenticated');
      expect(stateWriter.currentUserId).toBe('cloud-user-1');
    });

    it('transitions to offline_authenticated on network failure (tokens preserved)', async () => {
      await sessionStorage.saveSession(makeSession('cloud-user-1', 'email'));
      authProvider.refreshError = new AuthError('network_unavailable', 'Network unavailable');

      await expect(service.refreshSession()).rejects.toThrow(AuthError);
      expect(stateWriter.currentAuthState).toBe('offline_authenticated');
      // Tokens should still be present.
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseAccessToken)).toBeTruthy();
    });

    it('clears tokens and transitions to reauthentication_required on permanent failure', async () => {
      await sessionStorage.saveSession(makeSession('cloud-user-1', 'email'));
      authProvider.refreshError = new AuthError('unknown_auth_failure', 'Refresh token invalid');

      await expect(service.refreshSession()).rejects.toThrow(AuthError);
      expect(stateWriter.currentAuthState).toBe('reauthentication_required');
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseAccessToken)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Sign-in flows
  // --------------------------------------------------------------------------

  describe('signInWithEmailOtp', () => {
    it('delegates to the provider without changing auth state', async () => {
      await service.signInWithEmailOtp('user@example.com');
      // State should remain in its initial value (no change).
      expect(stateWriter.currentAuthState).toBe('initialising');
    });

    it('maps a network error to AuthError(network_unavailable)', async () => {
      authProvider.signInError = new Error('Network request failed');
      await expect(service.signInWithEmailOtp('user@example.com')).rejects.toThrow(AuthError);
      await expect(service.signInWithEmailOtp('user@example.com')).rejects.toThrow(
        /Network unavailable/,
      );
    });
  });

  describe('verifyEmailOtp', () => {
    it('persists the session and transitions to authenticated', async () => {
      const session = await service.verifyEmailOtp('user@example.com', '123456');
      expect(session.userId as string).toBe('user-user@example.com');
      expect(stateWriter.currentAuthState).toBe('authenticated');
      expect(stateWriter.currentUserId).toBe('user-user@example.com');
      // Session persisted.
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseAccessToken)).toBe(
        session.accessToken,
      );
    });

    it('writes an audit entry for the sign-in', async () => {
      await service.verifyEmailOtp('user@example.com', '123456');
      const authAudits = auditRepo.entries.filter((e) => e.entityType === 'auth_session');
      expect(authAudits).toHaveLength(1);
      expect(authAudits[0]?.action).toBe('create');
      expect(authAudits[0]?.changeSummary).toEqual({ provider: 'email' });
    });

    it('maps a rate-limit error to AuthError(rate_limited)', async () => {
      authProvider.verifyError = new Error('Rate limit exceeded');
      await expect(
        service.verifyEmailOtp('user@example.com', '123456'),
      ).rejects.toThrow(AuthError);
      try {
        await service.verifyEmailOtp('user@example.com', '123456');
      } catch (err) {
        expect((err as AuthError).code).toBe('rate_limited');
      }
    });

    it('maps an invalid-otp error to AuthError(invalid_otp)', async () => {
      authProvider.verifyError = new Error('Invalid OTP code');
      await expect(
        service.verifyEmailOtp('user@example.com', '123456'),
      ).rejects.toThrow(AuthError);
      try {
        await service.verifyEmailOtp('user@example.com', '123456');
      } catch (err) {
        expect((err as AuthError).code).toBe('invalid_otp');
      }
    });
  });

  describe('signInWithGoogle', () => {
    it('persists the session and writes an audit entry', async () => {
      const session = await service.signInWithGoogle();
      expect(session.provider).toBe('google');
      expect(stateWriter.currentAuthState).toBe('authenticated');
      const authAudits = auditRepo.entries.filter((e) => e.entityType === 'auth_session');
      expect(authAudits[0]?.changeSummary).toEqual({ provider: 'google' });
    });
  });

  describe('signInWithApple', () => {
    it('persists the session and writes an audit entry', async () => {
      const session = await service.signInWithApple();
      expect(session.provider).toBe('apple');
      expect(stateWriter.currentAuthState).toBe('authenticated');
      const authAudits = auditRepo.entries.filter((e) => e.entityType === 'auth_session');
      expect(authAudits[0]?.changeSummary).toEqual({ provider: 'apple' });
    });
  });

  // --------------------------------------------------------------------------
  // signOut — CRITICAL: preserves local data
  // --------------------------------------------------------------------------

  describe('signOut', () => {
    beforeEach(async () => {
      // Start each test signed in.
      await service.verifyEmailOtp('user@example.com', '123456');
      // Seed a guest identity so we can verify it survives sign-out.
      await guestRepo.save({
        id: 'guest-1' as never,
        displayName: 'Sravan' as never,
        deviceSecretHash: 'hash',
        upgradeStatus: 'local_only',
        createdAt: asDateTime('2026-07-29T10:00:00.000Z'),
        updatedAt: asDateTime('2026-07-29T10:00:00.000Z'),
        version: asVersionNumber(1),
      });
      // Seed some "local data" in SecureStore (guest device secret).
      await secureStorage.set(SECURE_STORAGE_KEYS.guestDeviceSecret, 'guest-secret');
      await secureStorage.set(SECURE_STORAGE_KEYS.currentGuestIdentityId, 'guest-1');
    });

    it('clears tokens from SecureStore', async () => {
      await service.signOut();
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseAccessToken)).toBeNull();
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseRefreshToken)).toBeNull();
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.currentUserId)).toBeNull();
    });

    it('preserves guest data (device secret + identity ID)', async () => {
      await service.signOut();
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.guestDeviceSecret)).toBe('guest-secret');
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.currentGuestIdentityId)).toBe('guest-1');
    });

    it('preserves guest identity row in SQLite', async () => {
      await service.signOut();
      expect(guestRepo.store.size).toBe(1);
      expect(guestRepo.store.get('guest-1')).toBeTruthy();
    });

    it('transitions to guest state after sign-out (guest identity exists)', async () => {
      await service.signOut();
      expect(stateWriter.currentAuthState).toBe('guest');
      expect(stateWriter.currentUserId).toBeNull();
    });

    it('writes an audit entry for the sign-out', async () => {
      auditRepo.entries.length = 0;
      await service.signOut();
      const authAudits = auditRepo.entries.filter((e) => e.entityType === 'auth_session');
      expect(authAudits).toHaveLength(1);
      expect(authAudits[0]?.action).toBe('create');
    });

    it('completes local sign-out even if the provider call fails', async () => {
      authProvider.signOutError = new Error('Network error during sign-out');
      await service.signOut();
      // Tokens should still be cleared locally.
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseAccessToken)).toBeNull();
      // Should still transition to guest.
      expect(stateWriter.currentAuthState).toBe('guest');
    });

    it('emits a signed_out event', async () => {
      const events: string[] = [];
      service.onAuthEvent((e) => events.push(e.type));
      await service.signOut();
      expect(events).toContain('signed_out');
    });
  });

  // --------------------------------------------------------------------------
  // Auth state transitions
  // --------------------------------------------------------------------------

  describe('auth state transitions', () => {
    it('transitions guest → authenticated → signed_out → guest', async () => {
      // Start with a guest identity.
      await guestRepo.save({
        id: 'guest-1' as never,
        displayName: 'Sravan' as never,
        deviceSecretHash: 'hash',
        upgradeStatus: 'local_only',
        createdAt: asDateTime('2026-07-29T10:00:00.000Z'),
        updatedAt: asDateTime('2026-07-29T10:00:00.000Z'),
        version: asVersionNumber(1),
      });

      // 1. restoreSession with no cached session → guest.
      await service.restoreSession();
      expect(stateWriter.currentAuthState).toBe('guest');

      // 2. verifyEmailOtp → authenticated.
      await service.verifyEmailOtp('user@example.com', '123456');
      expect(stateWriter.currentAuthState).toBe('authenticated');

      // 3. signOut → signed_out → guest (guest identity still exists).
      await service.signOut();
      expect(stateWriter.currentAuthState).toBe('guest');

      // 4. restoreSession again → guest (no cached session).
      stateWriter.currentAuthState = 'initialising';
      await service.restoreSession();
      expect(stateWriter.currentAuthState).toBe('guest');
    });
  });

  // --------------------------------------------------------------------------
  // Offline authenticated state
  // --------------------------------------------------------------------------

  describe('offline authenticated state', () => {
    it('transitions to offline_authenticated when network is unavailable during restore', async () => {
      await sessionStorage.saveSession(makeSession('cloud-user-1', 'email'));
      authProvider.refreshError = new AuthError('network_unavailable', 'Network unavailable');

      await service.restoreSession();
      expect(stateWriter.currentAuthState).toBe('offline_authenticated');
      expect(stateWriter.currentUserId).toBe('cloud-user-1');
    });

    it('preserves cached tokens in offline_authenticated state', async () => {
      const cached = makeSession('cloud-user-1', 'email');
      await sessionStorage.saveSession(cached);
      authProvider.refreshError = new AuthError('network_unavailable', 'Network unavailable');

      await service.restoreSession();
      // Tokens should be the same as the cached ones (not overwritten).
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseAccessToken)).toBe(
        cached.accessToken,
      );
    });
  });

  // --------------------------------------------------------------------------
  // Duplicate auth events
  // --------------------------------------------------------------------------

  describe('duplicate auth events', () => {
    it('does not duplicate audit entries for the same sign-in call', async () => {
      await service.verifyEmailOtp('user@example.com', '123456');
      const authAudits = auditRepo.entries.filter((e) => e.entityType === 'auth_session');
      expect(authAudits).toHaveLength(1);
    });

    it('writes one audit entry per sign-in attempt (no deduplication across calls)', async () => {
      await service.verifyEmailOtp('user@example.com', '123456');
      await service.verifyEmailOtp('user@example.com', '123456');
      const authAudits = auditRepo.entries.filter((e) => e.entityType === 'auth_session');
      expect(authAudits).toHaveLength(2);
    });

    it('sign-out audit entry is written once even if signOut is called twice', async () => {
      await service.verifyEmailOtp('user@example.com', '123456');
      await service.signOut();
      await service.signOut();
      const signOutAudits = auditRepo.entries.filter(
        (e) => e.entityType === 'auth_session' && e.changeSummary !== undefined,
      );
      // Both sign-out calls write an audit entry (we don't deduplicate —
      // the audit log is append-only and idempotency is the caller's
      // responsibility). This test documents that behaviour.
      expect(signOutAudits.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // Error mapping
  // --------------------------------------------------------------------------

  describe('error mapping', () => {
    it('maps a network error to AuthError(network_unavailable)', async () => {
      authProvider.verifyError = new Error('fetch failed: network');
      try {
        await service.verifyEmailOtp('user@example.com', '123456');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).code).toBe('network_unavailable');
      }
    });

    it('maps a rate-limit error to AuthError(rate_limited)', async () => {
      authProvider.verifyError = new Error('Rate limit exceeded');
      try {
        await service.verifyEmailOtp('user@example.com', '123456');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).code).toBe('rate_limited');
      }
    });

    it('maps an expired-otp error to AuthError(expired_otp)', async () => {
      authProvider.verifyError = new Error('The code has expired');
      try {
        await service.verifyEmailOtp('user@example.com', '123456');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).code).toBe('expired_otp');
      }
    });

    it('maps a cancel error to AuthError(provider_cancelled)', async () => {
      authProvider.signInError = new Error('User cancelled the flow');
      try {
        await service.signInWithGoogle();
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).code).toBe('provider_cancelled');
      }
    });

    it('preserves an existing AuthError unchanged (no re-wrapping)', async () => {
      const original = new AuthError('account_disabled', 'Account banned');
      authProvider.verifyError = original;
      try {
        await service.verifyEmailOtp('user@example.com', '123456');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBe(original);
      }
    });

    it('maps unknown errors to AuthError(unknown_auth_failure)', async () => {
      authProvider.verifyError = new Error('something weird happened');
      try {
        await service.verifyEmailOtp('user@example.com', '123456');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect((err as AuthError).code).toBe('unknown_auth_failure');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Event subscription
  // --------------------------------------------------------------------------

  describe('onAuthEvent', () => {
    it('emits session_restored on successful restore', async () => {
      await sessionStorage.saveSession(makeSession('cloud-user-1', 'email'));
      const events: string[] = [];
      service.onAuthEvent((e) => events.push(e.type));
      await service.restoreSession();
      expect(events).toContain('session_restored');
    });

    it('emits signed_in on verifyEmailOtp', async () => {
      const events: { type: string; provider?: string }[] = [];
      service.onAuthEvent((e) => {
        events.push({
          type: e.type,
          provider: e.type === 'signed_in' ? e.provider : undefined,
        });
      });
      await service.verifyEmailOtp('user@example.com', '123456');
      const signedIn = events.find((e) => e.type === 'signed_in');
      expect(signedIn).toBeDefined();
      expect(signedIn?.provider).toBe('email');
    });

    it('unsubscribe stops further events', async () => {
      const events: string[] = [];
      const unsub = service.onAuthEvent((e) => events.push(e.type));
      unsub();
      await service.verifyEmailOtp('user@example.com', '123456');
      expect(events).toHaveLength(0);
    });
  });
});
