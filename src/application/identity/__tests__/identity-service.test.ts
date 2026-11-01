import { beforeEach, describe, expect, it } from '@jest/globals';

import type { GuestIdentity } from '@domain/entities/guest-identity';
import { DeletedEntityError, InvalidEntityError } from '@domain/errors';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { AuditLogEntry, AuditRepository } from '@domain/repositories';
import { asDateTime, asVersionNumber } from '@domain/value-objects';
import type { GuestIdentityId, UserId } from '@shared-types/index';

import { IdentityService, type AuthProvider, type GuestIdentityRepository } from '../identity-service';

// ============================================================================
// In-memory test doubles
// ============================================================================

/**
 * In-memory SecureStorage test double for the application test.
 *
 * The infrastructure layer has its own InMemorySecureStorage (with
 * empty-key validation that mirrors expo-secure-store's behaviour) at
 * `src/infrastructure/security/__tests__/in-memory-secure-storage.ts`.
 * Application tests cannot import from infrastructure, so we inline a
 * minimal version here that satisfies the `SecureStorage` port.
 */
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

class InMemoryGuestIdentityRepository implements GuestIdentityRepository {
  readonly store = new Map<string, GuestIdentity>();

  async findById(id: GuestIdentityId): Promise<GuestIdentity | null> {
    return this.store.get(id as string) ?? null;
  }
  async save(identity: GuestIdentity): Promise<void> {
    this.store.set(identity.id as string, identity);
  }
  async findByLinkedUserId(userId: UserId): Promise<readonly GuestIdentity[]> {
    return Array.from(this.store.values()).filter((i) => i.linkedUserId === userId);
  }
  async list(): Promise<{ items: readonly GuestIdentity[]; hasMore: boolean }> {
    return { items: Array.from(this.store.values()), hasMore: false };
  }
  async softDelete(id: GuestIdentityId): Promise<{
    id: string;
    deletedAt: ReturnType<typeof asDateTime>;
    version: ReturnType<typeof asVersionNumber>;
  }> {
    return {
      id: id as string,
      deletedAt: asDateTime('2026-07-30T10:00:00.000Z'),
      version: asVersionNumber(2),
    };
  }
}

class MockAuthProvider implements AuthProvider {
  private currentUserId: UserId | null = null;

  async signInWithEmailOtp(): Promise<void> {
    // No-op in mock.
  }
  async verifyEmailOtp(_email: string, _code: string): Promise<{ userId: UserId }> {
    this.currentUserId = 'mock-cloud-user' as UserId;
    return { userId: this.currentUserId };
  }
  async signInWithGoogle(): Promise<{ userId: UserId }> {
    this.currentUserId = 'mock-google-user' as UserId;
    return { userId: this.currentUserId };
  }
  async signInWithApple(): Promise<{ userId: UserId }> {
    this.currentUserId = 'mock-apple-user' as UserId;
    return { userId: this.currentUserId };
  }
  async signOut(): Promise<void> {
    this.currentUserId = null;
  }
  async getCurrentUserId(): Promise<UserId | null> {
    return this.currentUserId;
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
  async listByEntity(entityType: string, entityId: string): Promise<readonly AuditLogEntry[]> {
    return this.entries.filter((e) => e.entityType === entityType && e.entityId === entityId);
  }
  async listByActor(): Promise<{ items: readonly AuditLogEntry[]; hasMore: boolean }> {
    return { items: this.entries, hasMore: false };
  }
  async listByGroup(): Promise<{ items: readonly AuditLogEntry[]; hasMore: boolean }> {
    return { items: this.entries, hasMore: false };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('IdentityService', () => {
  let guestRepo: InMemoryGuestIdentityRepository;
  let secureStorage: InMemorySecureStorage;
  let authProvider: MockAuthProvider;
  let auditRepo: InMemoryAuditRepository;
  let service: IdentityService;

  beforeEach(() => {
    guestRepo = new InMemoryGuestIdentityRepository();
    secureStorage = new InMemorySecureStorage();
    authProvider = new MockAuthProvider();
    auditRepo = new InMemoryAuditRepository();
    // Use a simple hash function for tests (NOT secure — production uses SHA-256)
    service = new IdentityService(
      guestRepo,
      secureStorage,
      authProvider,
      (input) => `hash(${input})`,
      () => 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      auditRepo,
    );
  });

  describe('createGuestIdentity', () => {
    it('creates a guest identity, stores secret in SecureStore, returns the secret', async () => {
      const result = await service.createGuestIdentity('Sravan');

      expect(result.identity.displayName).toBe('Sravan');
      expect(result.identity.upgradeStatus).toBe('local_only');
      expect(result.identity.version).toBe(1);
      expect(result.deviceSecret).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
      expect(result.identity.deviceSecretHash).toBe('hash(a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4)');

      // SecureStore should contain the device secret and the guest ID.
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.guestDeviceSecret)).toBe(
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      );
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.currentGuestIdentityId)).toBe(
        result.identity.id as string,
      );

      // Repository should have the identity.
      const found = await guestRepo.findById(result.identity.id);
      expect(found).toEqual(result.identity);
    });

    it('writes an audit entry for the create mutation', async () => {
      const result = await service.createGuestIdentity('Sravan');

      expect(auditRepo.entries).toHaveLength(1);
      const entry = auditRepo.entries[0];
      expect(entry?.entityType).toBe('guest_identity');
      expect(entry?.entityId).toBe(result.identity.id as string);
      expect(entry?.action).toBe('create');
      expect(entry?.newVersion).toBe(1);
    });
  });

  describe('loadCurrentIdentity', () => {
    it('returns none on first launch', async () => {
      const result = await service.loadCurrentIdentity();
      expect(result.type).toBe('none');
    });

    it('returns guest after creating a guest identity', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      const result = await service.loadCurrentIdentity();
      expect(result.type).toBe('guest');
      if (result.type === 'guest') {
        expect(result.identity.id).toBe(createResult.identity.id);
      }
    });

    it('returns cloud after upgrade completes', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      await authProvider.signInWithGoogle();
      await service.completeUpgrade(createResult.identity.id);
      const result = await service.loadCurrentIdentity();
      expect(result.type).toBe('cloud');
    });
  });

  describe('startUpgrade', () => {
    it('transitions guest from local_only to upgrade_pending', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      const result = await service.startUpgrade(createResult.identity.id);
      expect(result.identity.upgradeStatus).toBe('upgrade_pending');
      expect(result.identity.version).toBe(2);
      expect(result.pendingCloudUserId).toBeNull(); // not signed in yet
    });

    it('returns pendingCloudUserId if user already signed in', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await authProvider.signInWithGoogle();
      const result = await service.startUpgrade(createResult.identity.id);
      expect(result.pendingCloudUserId).toBe('mock-google-user');
    });

    it('throws if guest identity not found', async () => {
      await expect(
        service.startUpgrade('nonexistent' as GuestIdentityId),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('throws if guest already upgraded', async () => {
      // After completeUpgrade the guest identity is in 'upgraded' state.
      // The domain factory `startGuestUpgrade` only allows local_only
      // or upgrade_failed — calling startUpgrade on an upgraded identity
      // is rejected with InvalidEntityError (invalid state transition).
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      await authProvider.signInWithGoogle();
      await service.completeUpgrade(createResult.identity.id);
      await expect(
        service.startUpgrade(createResult.identity.id),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('writes an audit entry capturing previous + new version', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      auditRepo.entries.length = 0; // ignore create audit
      const result = await service.startUpgrade(createResult.identity.id);

      expect(auditRepo.entries).toHaveLength(1);
      const entry = auditRepo.entries[0];
      expect(entry?.entityType).toBe('guest_identity');
      expect(entry?.entityId).toBe(result.identity.id as string);
      expect(entry?.action).toBe('update');
      expect(entry?.previousVersion).toBe(1);
      expect(entry?.newVersion).toBe(2);
    });
  });

  describe('completeUpgrade', () => {
    it('transitions upgrade_pending → upgraded and stores cloud user ID', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      await authProvider.signInWithGoogle();
      const result = await service.completeUpgrade(createResult.identity.id);

      expect(result.identity.upgradeStatus).toBe('upgraded');
      expect(result.identity.linkedUserId).toBe('mock-google-user');
      expect(result.cloudUserId).toBe('mock-google-user');
      expect(result.identity.version).toBe(3);

      // SecureStore should now contain the cloud user ID.
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.currentUserId)).toBe('mock-google-user');

      // Device secret and guest identity id should be cleared.
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.guestDeviceSecret)).toBeNull();
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.currentGuestIdentityId)).toBeNull();
    });

    it('throws if no cloud user is signed in', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      // Don't sign in.
      await expect(
        service.completeUpgrade(createResult.identity.id),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('throws if device secret is missing from SecureStore', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      await authProvider.signInWithGoogle();
      // Simulate SecureStore corruption by deleting the secret.
      await secureStorage.delete(SECURE_STORAGE_KEYS.guestDeviceSecret);
      await expect(
        service.completeUpgrade(createResult.identity.id),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('throws if device secret hash does not match (corruption)', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      await authProvider.signInWithGoogle();
      // Simulate corruption: overwrite the secret with a different value.
      await secureStorage.set(SECURE_STORAGE_KEYS.guestDeviceSecret, 'wrong-secret');
      await expect(
        service.completeUpgrade(createResult.identity.id),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('throws if guest identity is in local_only status (must startUpgrade first)', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await authProvider.signInWithGoogle();
      await expect(
        service.completeUpgrade(createResult.identity.id),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('throws if guest identity is already linked to a different cloud account', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      // Manually set linkedUserId to a different account
      const identity = await guestRepo.findById(createResult.identity.id);
      if (identity) {
        await guestRepo.save({
          ...identity,
          upgradeStatus: 'upgrade_pending' as never,
          linkedUserId: 'different-user' as never,
        });
      }
      await authProvider.signInWithGoogle(); // mock-google-user (different from 'different-user')

      await expect(
        service.completeUpgrade(createResult.identity.id),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('writes an audit entry with the cloud user as actor', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      await authProvider.signInWithGoogle();
      auditRepo.entries.length = 0; // ignore prior audits
      await service.completeUpgrade(createResult.identity.id);

      expect(auditRepo.entries).toHaveLength(1);
      const entry = auditRepo.entries[0];
      expect(entry?.entityType).toBe('guest_identity');
      expect(entry?.action).toBe('update');
      expect(entry?.actorId).toBe('mock-google-user');
      expect(entry?.previousVersion).toBe(2);
      expect(entry?.newVersion).toBe(3);
    });
  });

  describe('markUpgradeFailed', () => {
    it('transitions upgrade_pending → upgrade_failed', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      const result = await service.markUpgradeFailed(createResult.identity.id, 'Network error');
      expect(result.upgradeStatus).toBe('upgrade_failed');
    });

    it('throws if already upgraded', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      await authProvider.signInWithGoogle();
      await service.completeUpgrade(createResult.identity.id);
      await expect(
        service.markUpgradeFailed(createResult.identity.id, 'reason'),
      ).rejects.toThrow(DeletedEntityError);
    });

    it('records the failure reason in the audit changeSummary', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      auditRepo.entries.length = 0; // ignore prior audits
      await service.markUpgradeFailed(createResult.identity.id, 'Network error');

      expect(auditRepo.entries).toHaveLength(1);
      const entry = auditRepo.entries[0];
      expect(entry?.action).toBe('update');
      expect(entry?.changeSummary).toEqual({ reason: 'Network error' });
    });
  });

  describe('signOutCloud', () => {
    it('clears cloud user ID from SecureStore and signs out auth provider', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      await authProvider.signInWithGoogle();
      await service.completeUpgrade(createResult.identity.id);

      expect(await secureStorage.get(SECURE_STORAGE_KEYS.currentUserId)).toBe('mock-google-user');
      await service.signOutCloud();
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.currentUserId)).toBeNull();
      expect(await authProvider.getCurrentUserId()).toBeNull();
    });
  });

  describe('upgrade is resumable (interrupted upgrade)', () => {
    it('can retry upgrade after failure', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      // Simulate failure (no cloud user signed in)
      await expect(
        service.completeUpgrade(createResult.identity.id),
      ).rejects.toThrow();
      await service.markUpgradeFailed(createResult.identity.id, 'No cloud user');

      // Retry: sign in first, then startUpgrade again, then completeUpgrade.
      await authProvider.signInWithGoogle();
      await service.startUpgrade(createResult.identity.id);
      const result = await service.completeUpgrade(createResult.identity.id);
      expect(result.identity.upgradeStatus).toBe('upgraded');
      expect(result.cloudUserId).toBe('mock-google-user');
    });
  });

  describe('audit trail', () => {
    it('accumulates audit entries across the full upgrade lifecycle', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      // create → 1 entry
      expect(auditRepo.entries).toHaveLength(1);

      await service.startUpgrade(createResult.identity.id);
      // startUpgrade → 1 more entry
      expect(auditRepo.entries).toHaveLength(2);

      await authProvider.signInWithGoogle();
      await service.completeUpgrade(createResult.identity.id);
      // completeUpgrade → 1 more entry
      expect(auditRepo.entries).toHaveLength(3);

      // All entries are for the same entity.
      for (const entry of auditRepo.entries) {
        expect(entry.entityType).toBe('guest_identity');
        expect(entry.entityId).toBe(createResult.identity.id as string);
      }

      // Versions progress 1 → 2 → 3.
      expect(auditRepo.entries[0]?.newVersion).toBe(1);
      expect(auditRepo.entries[1]?.previousVersion).toBe(1);
      expect(auditRepo.entries[1]?.newVersion).toBe(2);
      expect(auditRepo.entries[2]?.previousVersion).toBe(2);
      expect(auditRepo.entries[2]?.newVersion).toBe(3);
    });

    it('records failure reason in audit when markUpgradeFailed is called', async () => {
      const createResult = await service.createGuestIdentity('Sravan');
      await service.startUpgrade(createResult.identity.id);
      await service.markUpgradeFailed(createResult.identity.id, 'network timeout');

      const failedEntry = auditRepo.entries.find((e) => e.changeSummary !== undefined);
      expect(failedEntry).toBeDefined();
      expect(failedEntry?.changeSummary).toEqual({ reason: 'network timeout' });
    });
  });
});
