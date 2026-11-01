import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  cancelAccountDeletion,
  completeAccountDeletion,
  createAccountDeletionRequest,
  isRecoveryWindowOpen,
  MAX_ACCOUNT_DELETION_RECOVERY_DAYS,
  MIN_ACCOUNT_DELETION_RECOVERY_DAYS,
  type AccountDeletionRequest,
} from '@domain/entities/account-deletion-request';
import { createGuestIdentity, type GuestIdentity } from '@domain/entities/guest-identity';
import { InvalidEntityError, InvalidStateTransitionError } from '@domain/errors';
import type { AuthSession, AuthenticationProvider } from '@domain/ports/authentication-provider.port';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { SessionStoragePort } from '@domain/ports/session-storage.port';
import type { AuditLogEntry, AuditRepository } from '@domain/repositories';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import { asDateTime, asVersionNumber } from '@domain/value-objects';
import type { GuestIdentityId, UserId } from '@shared-types/index';

import type { AccountDeletionRepository, LocalDataWiper } from '../account-deletion.port';
import { CancelAccountDeletionUseCase } from '../cancel-account-deletion.usecase';
import { GetAccountDeletionStatusUseCase } from '../cancel-account-deletion.usecase';
import { RequestAccountDeletionUseCase } from '../request-account-deletion.usecase';

// ============================================================================
// In-memory test doubles (mirrors guest-identity-usecases.test.ts style)
// ============================================================================

const FIXED_NOW = '2026-10-10T10:00:00.000Z';
const asUser = (id: string): UserId => id as UserId;
const asGuest = (id: string): GuestIdentityId => id as GuestIdentityId;

class InMemoryAuthSessionStorage implements SessionStoragePort {
  session: AuthSession | null = null;
  cleared = 0;

  async saveSession(session: AuthSession): Promise<void> {
    this.session = session;
  }
  async loadSession(): Promise<AuthSession | null> {
    return this.session;
  }
  async clearSession(): Promise<void> {
    this.cleared += 1;
    this.session = null;
  }
}

class InMemoryAuthProvider implements AuthenticationProvider {
  signedOut = 0;
  currentSession: AuthSession | null = null;

  async getSession(): Promise<AuthSession | null> {
    return this.currentSession;
  }
  async refreshSession(): Promise<AuthSession> {
    throw new Error('not implemented in test');
  }
  async signInWithEmailOtp(): Promise<void> {
    /* test stub */
  }
  async verifyEmailOtp(): Promise<AuthSession> {
    throw new Error('not implemented in test');
  }
  async signInWithGoogle(): Promise<AuthSession> {
    throw new Error('not implemented in test');
  }
  async signInWithApple(): Promise<AuthSession> {
    throw new Error('not implemented in test');
  }
  async getCurrentProviderIdentity() {
    return null;
  }
  async signOut(): Promise<void> {
    this.signedOut += 1;
    this.currentSession = null;
  }
  onAuthStateChange() {
    return () => undefined;
  }
}

class InMemoryDeletionRepository implements AccountDeletionRepository {
  readonly store = new Map<string, AccountDeletionRequest>();

  async save(request: AccountDeletionRequest): Promise<void> {
    this.store.set(request.id as string, request);
  }
  async findActiveByUser(userId: UserId): Promise<AccountDeletionRequest | null> {
    for (const r of this.store.values()) {
      if (r.userId === userId && r.status === 'scheduled') return r;
    }
    return null;
  }
  async findById(id: string): Promise<AccountDeletionRequest | null> {
    return this.store.get(id) ?? null;
  }
}

class InMemoryLocalWiper implements LocalDataWiper {
  wiped = 0;
  wipedStores: readonly string[] = [];

  async wipeAllLocalData(): Promise<{ wipedStores: readonly string[] }> {
    this.wiped += 1;
    this.wipedStores = ['sqlite', 'files', 'secure_store'];
    return { wipedStores: this.wipedStores };
  }
}

class InMemoryGuestRepo implements GuestIdentityRepository {
  readonly deleted: GuestIdentityId[] = [];
  private readonly identities = new Map<string, GuestIdentity>();

  seed(id: string): void {
    this.identities.set(
      id,
      createGuestIdentity({ id: asGuest(id), displayName: 'Test Guest', deviceSecretHash: 'h' }),
    );
  }
  async findById(id: GuestIdentityId): Promise<GuestIdentity | null> {
    return this.identities.get(id as string) ?? null;
  }
  async save(): Promise<void> {
    /* test stub */
  }
  async findByLinkedUserId(): Promise<readonly never[]> {
    return [];
  }
  async list() {
    return { items: [], hasMore: false };
  }
  async softDelete(id: GuestIdentityId) {
    this.deleted.push(id);
    this.identities.delete(id as string);
    return {
      id: id as string,
      deletedAt: asDateTime(FIXED_NOW),
      version: asVersionNumber(2),
    };
  }
}

class InMemoryAuditRepository implements AuditRepository {
  readonly entries: AuditLogEntry[] = [];

  async append(entry: Omit<AuditLogEntry, 'createdAt'>): Promise<AuditLogEntry> {
    const full: AuditLogEntry = {
      ...entry,
      createdAt: asDateTime(FIXED_NOW),
    };
    this.entries.push(full);
    return full;
  }
  async listByEntity(): Promise<readonly AuditLogEntry[]> {
    return this.entries;
  }
  async listByActor() {
    return { items: this.entries, hasMore: false };
  }
  async listByGroup() {
    return { items: this.entries, hasMore: false };
  }
}

class InMemorySecureStorage implements SecureStorage {
  private readonly store = new Map<string, string>();

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }
}

// ============================================================================
// Test factory
// ============================================================================

interface Harness {
  sut: RequestAccountDeletionUseCase;
  cancelSut: CancelAccountDeletionUseCase;
  statusSut: GetAccountDeletionStatusUseCase;
  authProvider: InMemoryAuthProvider;
  sessionStorage: InMemoryAuthSessionStorage;
  deletionRepo: InMemoryDeletionRepository;
  wiper: InMemoryLocalWiper;
  guestRepo: InMemoryGuestRepo;
  secureStorage: InMemorySecureStorage;
  auditRepo: InMemoryAuditRepository;
}

function makeHarness(opts?: { withSession?: boolean }): Harness {
  const authProvider = new InMemoryAuthProvider();
  const sessionStorage = new InMemoryAuthSessionStorage();
  const deletionRepo = new InMemoryDeletionRepository();
  const wiper = new InMemoryLocalWiper();
  const guestRepo = new InMemoryGuestRepo();
  const secureStorage = new InMemorySecureStorage();
  const auditRepo = new InMemoryAuditRepository();

  if (opts?.withSession) {
    authProvider.currentSession = {
      userId: asUser('user-1'),
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.parse(FIXED_NOW) + 3_600_000,
      provider: 'email',
    };
  }

  let seq = 0;
  const generateIdFn = () => `id-${++seq}`;

  const sut = new RequestAccountDeletionUseCase(
    authProvider,
    sessionStorage,
    deletionRepo,
    wiper,
    guestRepo,
    secureStorage,
    auditRepo,
    generateIdFn,
  );
  const cancelSut = new CancelAccountDeletionUseCase(deletionRepo, auditRepo, generateIdFn);
  const statusSut = new GetAccountDeletionStatusUseCase(deletionRepo);

  return {
    sut,
    cancelSut,
    statusSut,
    authProvider,
    sessionStorage,
    deletionRepo,
    wiper,
    guestRepo,
    secureStorage,
    auditRepo,
  };
}

// ============================================================================
// Domain entity guards (direct)
// ============================================================================

describe('account-deletion-request entity', () => {
  const base = {
    id: 'adr-1' as never,
    userId: asUser('user-1'),
    requestedAt: asDateTime(FIXED_NOW),
  };

  it('computes the recovery deadline from requestedAt + recoveryDays', () => {
    const req = createAccountDeletionRequest({ ...base, recoveryDays: 14 });
    expect(req.status).toBe('scheduled');
    expect(req.recoveryDeadlineAt).toBe('2026-10-24T10:00:00.000Z');
  });

  it('rejects recovery windows outside the supported bounds', () => {
    expect(() =>
      createAccountDeletionRequest({ ...base, recoveryDays: 0 }),
    ).toThrow(InvalidEntityError);
    expect(() =>
      createAccountDeletionRequest({ ...base, recoveryDays: MAX_ACCOUNT_DELETION_RECOVERY_DAYS + 1 }),
    ).toThrow(InvalidEntityError);
    expect(MIN_ACCOUNT_DELETION_RECOVERY_DAYS).toBe(1);
  });

  it('allows cancellation only inside the recovery window', () => {
    const req = createAccountDeletionRequest({ ...base, recoveryDays: 14 });
    const before = '2026-10-20T10:00:00.000Z';
    const after = '2026-11-01T10:00:00.000Z';

    expect(isRecoveryWindowOpen(req, asDateTime(before))).toBe(true);
    expect(isRecoveryWindowOpen(req, asDateTime(after))).toBe(false);

    const cancelled = cancelAccountDeletion(req, asDateTime(before));
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.version).toBe(req.version + 1);
    expect(() => cancelAccountDeletion(req, asDateTime(after))).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('completes only from scheduled state', () => {
    const req = createAccountDeletionRequest({ ...base });
    const done = completeAccountDeletion(req);
    expect(done.status).toBe('completed');
    expect(() => completeAccountDeletion(done)).toThrow(InvalidStateTransitionError);
  });
});

// ============================================================================
// RequestAccountDeletionUseCase
// ============================================================================

describe('RequestAccountDeletionUseCase — authenticated user', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness({ withSession: true });
  });

  it('refuses to run without explicit confirmation', async () => {
    await expect(
      h.sut.execute({ confirmed: false, now: asDateTime(FIXED_NOW) }),
    ).rejects.toThrow(InvalidEntityError);
    expect(h.deletionRepo.store.size).toBe(0);
  });

  it('schedules deletion, revokes sessions, preserves local data', async () => {
    const out = await h.sut.execute({ confirmed: true, now: asDateTime(FIXED_NOW) });

    expect(out.outcome).toBe('scheduled');
    if (out.outcome === 'scheduled') {
      expect(out.localDataWiped).toBe(false);
      expect(out.request.recoveryDeadlineAt).toBe('2026-10-24T10:00:00.000Z');
    }
    // Sessions revoked on the device AND provider side.
    expect(h.authProvider.signedOut).toBe(1);
    expect(h.sessionStorage.cleared).toBe(1);
    // Local data untouched during the recovery window.
    expect(h.wiper.wiped).toBe(0);
    // Audited without any token or financial content.
    const [auditEntry] = h.auditRepo.entries;
    expect(h.auditRepo.entries).toHaveLength(1);
    expect(auditEntry?.entityType).toBe('account_deletion_request');
    expect(JSON.stringify(auditEntry?.changeSummary)).not.toMatch(/token|access|refresh/i);
  });

  it('refuses a second scheduled deletion for the same user', async () => {
    await h.sut.execute({ confirmed: true, now: asDateTime(FIXED_NOW) });
    // Simulate the user signing back in during the recovery window.
    h.authProvider.currentSession = {
      userId: asUser('user-1'),
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.parse(FIXED_NOW) + 3_600_000,
      provider: 'email',
    };
    await expect(
      h.sut.execute({ confirmed: true, now: asDateTime(FIXED_NOW) }),
    ).rejects.toThrow(/already scheduled/);
  });
});

describe('RequestAccountDeletionUseCase — guest', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness({ withSession: false });
    h.secureStorage.set(SECURE_STORAGE_KEYS.currentGuestIdentityId, 'guest-1');
    h.guestRepo.seed('guest-1');
  });

  it('wipes local data immediately and deletes the guest identity', async () => {
    const out = await h.sut.execute({ confirmed: true, now: asDateTime(FIXED_NOW) });

    expect(out.outcome).toBe('completed_immediately');
    if (out.outcome === 'completed_immediately') {
      expect(out.localDataWiped).toBe(true);
      expect(out.wipedStores).toEqual(['sqlite', 'files', 'secure_store']);
    }
    expect(h.guestRepo.deleted).toEqual([asGuest('guest-1')]);
    expect(h.wiper.wiped).toBe(1);
    expect(h.auditRepo.entries).toHaveLength(1);
  });

  it('still requires explicit confirmation', async () => {
    await expect(
      h.sut.execute({ confirmed: false, now: asDateTime(FIXED_NOW) }),
    ).rejects.toThrow(InvalidEntityError);
    expect(h.wiper.wiped).toBe(0);
  });
});

// ============================================================================
// CancelAccountDeletionUseCase
// ============================================================================

describe('CancelAccountDeletionUseCase', () => {
  it('cancels a scheduled deletion inside the recovery window', async () => {
    const h = makeHarness({ withSession: true });
    const scheduled = await h.sut.execute({ confirmed: true, now: asDateTime(FIXED_NOW) });
    if (scheduled.outcome !== 'scheduled') throw new Error('expected scheduled outcome');

    const out = await h.cancelSut.execute({
      userId: asUser('user-1'),
      now: asDateTime('2026-10-15T10:00:00.000Z'),
    });

    expect(out.request.status).toBe('cancelled');
    const stored = await h.deletionRepo.findById(scheduled.request.id as string);
    expect(stored?.status).toBe('cancelled');
  });

  it('refuses cancellation after the recovery deadline', async () => {
    const h = makeHarness({ withSession: true });
    await h.sut.execute({
      confirmed: true,
      recoveryDays: 1,
      now: asDateTime(FIXED_NOW),
    });

    await expect(
      h.cancelSut.execute({
        userId: asUser('user-1'),
        now: asDateTime('2026-10-12T10:00:00.000Z'),
      }),
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it('throws when no deletion request exists', async () => {
    const h = makeHarness();
    await expect(
      h.cancelSut.execute({ userId: asUser('nobody') }),
    ).rejects.toThrow(InvalidEntityError);
  });
});

// ============================================================================
// GetAccountDeletionStatusUseCase
// ============================================================================

describe('GetAccountDeletionStatusUseCase', () => {
  it('reports no deletion when none scheduled', async () => {
    const h = makeHarness();
    const status = await h.statusSut.execute({ userId: asUser('user-1') });
    expect(status).toEqual({ hasScheduledDeletion: false, canCancel: false });
  });

  it('reports the deadline and cancellability for a scheduled deletion', async () => {
    const h = makeHarness({ withSession: true });
    await h.sut.execute({ confirmed: true, now: asDateTime(FIXED_NOW) });

    const status = await h.statusSut.execute({
      userId: asUser('user-1'),
      now: asDateTime('2026-10-11T10:00:00.000Z'),
    });
    expect(status.hasScheduledDeletion).toBe(true);
    expect(status.canCancel).toBe(true);
    expect(status.recoveryDeadlineAt).toBe('2026-10-24T10:00:00.000Z');
  });
});
