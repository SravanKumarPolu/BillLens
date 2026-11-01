import { beforeEach, describe, expect, it } from '@jest/globals';

import type { GuestIdentity } from '@domain/entities/guest-identity';
import { InvalidEntityError } from '@domain/errors';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { AuditLogEntry, AuditRepository } from '@domain/repositories';
import type { DeviceInstallation, DeviceInstallationRepository } from '@domain/repositories';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import { asDateTime, asVersionNumber } from '@domain/value-objects';
import type { GuestIdentityId, UserId } from '@shared-types/index';

import { CreateGuestIdentityUseCase } from '../create-guest-identity.usecase';
import { DeviceInstallationService } from '../device-installation-service';
import { LoadCurrentIdentityUseCase } from '../load-current-identity.usecase';
import { RecoverGuestIdentityUseCase } from '../recover-guest-identity.usecase';
import { UpdateGuestDisplayNameUseCase } from '../update-guest-display-name.usecase';
import { ValidateGuestIdentityUseCase } from '../validate-guest-identity.usecase';

// ============================================================================
// In-memory test doubles (mirrors identity-service.test.ts conventions)
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

class InMemoryGuestIdentityRepository implements GuestIdentityRepository {
  readonly store = new Map<string, GuestIdentity>();
  letFindByIdThrow = false;

  async findById(id: GuestIdentityId): Promise<GuestIdentity | null> {
    if (this.letFindByIdThrow) {
      throw new Error('Simulated SQLite corruption');
    }
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

class InMemoryDeviceInstallationRepository implements DeviceInstallationRepository {
  readonly store = new Map<string, DeviceInstallation>();

  async findById(id: string): Promise<DeviceInstallation | null> {
    return this.store.get(id) ?? null;
  }
  async findByProfileId(profileId: UserId): Promise<readonly DeviceInstallation[]> {
    return Array.from(this.store.values()).filter((i) => i.profileId === profileId);
  }
  async findByPushToken(token: string): Promise<DeviceInstallation | null> {
    return Array.from(this.store.values()).find((i) => i.pushToken === token) ?? null;
  }
  async save(installation: DeviceInstallation): Promise<void> {
    this.store.set(installation.id, installation);
  }
  async updateLastSeen(id: string, lastSeenAt: ReturnType<typeof asDateTime>): Promise<void> {
    const existing = this.store.get(id);
    if (existing) {
      this.store.set(id, { ...existing, lastSeenAt, updatedAt: lastSeenAt });
    }
  }
  async softDelete(): Promise<{ id: string; deletedAt: ReturnType<typeof asDateTime>; version: ReturnType<typeof asVersionNumber> }> {
    return {
      id: 'deleted',
      deletedAt: asDateTime('2026-07-30T10:00:00.000Z'),
      version: asVersionNumber(2),
    };
  }
  async list(): Promise<{ items: readonly DeviceInstallation[]; hasMore: boolean }> {
    return { items: Array.from(this.store.values()), hasMore: false };
  }
}

// ============================================================================
// Fixtures
// ============================================================================

const TEST_SECRET = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const hashFn = (input: string) => `hash(${input})`;
const generateSecretFn = () => TEST_SECRET;
let idCounter = 0;
const generateIdFn = () => `id-${++idCounter}`;

// ============================================================================
// Tests
// ============================================================================

describe('Guest identity use cases', () => {
  let guestRepo: InMemoryGuestIdentityRepository;
  let secureStorage: InMemorySecureStorage;
  let auditRepo: InMemoryAuditRepository;

  beforeEach(() => {
    guestRepo = new InMemoryGuestIdentityRepository();
    secureStorage = new InMemorySecureStorage();
    auditRepo = new InMemoryAuditRepository();
    idCounter = 0;
  });

  // --------------------------------------------------------------------------
  // CreateGuestIdentityUseCase
  // --------------------------------------------------------------------------

  describe('CreateGuestIdentityUseCase', () => {
    let useCase: CreateGuestIdentityUseCase;

    beforeEach(() => {
      useCase = new CreateGuestIdentityUseCase(
        guestRepo,
        secureStorage,
        auditRepo,
        hashFn,
        generateSecretFn,
        generateIdFn,
      );
    });

    it('creates a guest identity, stores secret in SecureStore, returns the secret', async () => {
      const result = await useCase.execute({ displayName: 'Sravan' });

      expect(result.identity.displayName).toBe('Sravan');
      expect(result.identity.upgradeStatus).toBe('local_only');
      expect(result.identity.version as number).toBe(1);
      expect(result.deviceSecret).toBe(TEST_SECRET);
      expect(result.identity.deviceSecretHash).toBe(`hash(${TEST_SECRET})`);

      // SecureStore should contain the device secret and the guest ID.
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.guestDeviceSecret)).toBe(TEST_SECRET);
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.currentGuestIdentityId)).toBe(
        result.identity.id as string,
      );

      // Repository should have the identity.
      const found = await guestRepo.findById(result.identity.id);
      expect(found).toEqual(result.identity);
    });

    it('writes an audit entry for the create mutation', async () => {
      const result = await useCase.execute({ displayName: 'Sravan' });

      expect(auditRepo.entries).toHaveLength(1);
      const entry = auditRepo.entries[0];
      expect(entry?.entityType).toBe('guest_identity');
      expect(entry?.entityId).toBe(result.identity.id as string);
      expect(entry?.action).toBe('create');
      expect(entry?.newVersion).toBe(1);
    });

    it('rejects duplicate guest identity creation', async () => {
      await useCase.execute({ displayName: 'Sravan' });

      await expect(useCase.execute({ displayName: 'Second' })).rejects.toThrow(
        InvalidEntityError,
      );
      await expect(useCase.execute({ displayName: 'Second' })).rejects.toThrow(
        /already exists/i,
      );
    });

    it('rejects an empty display name', async () => {
      await expect(useCase.execute({ displayName: '   ' })).rejects.toThrow();
    });

    it('rejects a display name longer than 80 characters', async () => {
      const longName = 'x'.repeat(81);
      await expect(useCase.execute({ displayName: longName })).rejects.toThrow();
    });

    it('trims the display name before storing', async () => {
      const result = await useCase.execute({ displayName: '  Sravan  ' });
      expect(result.identity.displayName as string).toBe('Sravan');
    });

    it('rejects a device secret shorter than 32 characters', async () => {
      const weakUseCase = new CreateGuestIdentityUseCase(
        guestRepo,
        secureStorage,
        auditRepo,
        hashFn,
        () => 'short',
        generateIdFn,
      );
      await expect(weakUseCase.execute({ displayName: 'Sravan' })).rejects.toThrow(
        InvalidEntityError,
      );
    });
  });

  // --------------------------------------------------------------------------
  // LoadCurrentIdentityUseCase
  // --------------------------------------------------------------------------

  describe('LoadCurrentIdentityUseCase', () => {
    let createUseCase: CreateGuestIdentityUseCase;
    let loadUseCase: LoadCurrentIdentityUseCase;

    beforeEach(() => {
      createUseCase = new CreateGuestIdentityUseCase(
        guestRepo,
        secureStorage,
        auditRepo,
        hashFn,
        generateSecretFn,
        generateIdFn,
      );
      loadUseCase = new LoadCurrentIdentityUseCase(guestRepo, secureStorage);
    });

    it('returns none on first launch', async () => {
      const result = await loadUseCase.execute();
      expect(result.type).toBe('none');
    });

    it('returns guest after creating a guest identity', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      const result = await loadUseCase.execute();
      expect(result.type).toBe('guest');
      if (result.type === 'guest') {
        expect(result.identity.id).toBe(createResult.identity.id);
      }
    });

    it('returns cloud when SecureStore has a current user ID', async () => {
      await secureStorage.set(SECURE_STORAGE_KEYS.currentUserId, 'cloud-user-1');
      const result = await loadUseCase.execute();
      expect(result.type).toBe('cloud');
      if (result.type === 'cloud') {
        expect(result.userId as string).toBe('cloud-user-1');
      }
    });

    it('returns broken (missing-secret) when SQLite has identity but SecureStore lost the secret', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      // Simulate SecureStore losing the secret.
      await secureStorage.delete(SECURE_STORAGE_KEYS.guestDeviceSecret);

      const result = await loadUseCase.execute();
      expect(result.type).toBe('broken');
      if (result.type === 'broken') {
        expect(result.reason).toBe('missing-secret');
        expect(result.partialIdentity?.id).toBe(createResult.identity.id);
      }
    });

    it('returns broken (missing-identity) when SecureStore references a non-existent identity', async () => {
      await secureStorage.set(
        SECURE_STORAGE_KEYS.currentGuestIdentityId,
        'nonexistent-id',
      );
      const result = await loadUseCase.execute();
      expect(result.type).toBe('broken');
      if (result.type === 'broken') {
        expect(result.reason).toBe('missing-identity');
      }
    });

    it('returns broken (corrupt-identity) when findById throws', async () => {
      await secureStorage.set(
        SECURE_STORAGE_KEYS.currentGuestIdentityId,
        'some-id',
      );
      guestRepo.letFindByIdThrow = true;
      const result = await loadUseCase.execute();
      expect(result.type).toBe('broken');
      if (result.type === 'broken') {
        expect(result.reason).toBe('corrupt-identity');
      }
    });

    it('does NOT delete local data in the broken state', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      await secureStorage.delete(SECURE_STORAGE_KEYS.guestDeviceSecret);

      await loadUseCase.execute();

      // SQLite row should still exist.
      const stillThere = await guestRepo.findById(createResult.identity.id);
      expect(stillThere).not.toBeNull();
      // SecureStore should still have the identity ID (only the secret is missing).
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.currentGuestIdentityId)).toBe(
        createResult.identity.id as string,
      );
    });
  });

  // --------------------------------------------------------------------------
  // UpdateGuestDisplayNameUseCase
  // --------------------------------------------------------------------------

  describe('UpdateGuestDisplayNameUseCase', () => {
    let createUseCase: CreateGuestIdentityUseCase;
    let updateUseCase: UpdateGuestDisplayNameUseCase;

    beforeEach(() => {
      createUseCase = new CreateGuestIdentityUseCase(
        guestRepo,
        secureStorage,
        auditRepo,
        hashFn,
        generateSecretFn,
        generateIdFn,
      );
      updateUseCase = new UpdateGuestDisplayNameUseCase(
        guestRepo,
        auditRepo,
        generateIdFn,
      );
    });

    it('updates the display name and increments the version', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      const updated = await updateUseCase.execute({
        guestIdentityId: createResult.identity.id,
        displayName: 'Sravan Updated',
      });

      expect(updated.displayName as string).toBe('Sravan Updated');
      expect(updated.version as number).toBe(2);
      expect(updated.id).toBe(createResult.identity.id);
    });

    it('writes an audit entry capturing the version transition', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      auditRepo.entries.length = 0;
      const updated = await updateUseCase.execute({
        guestIdentityId: createResult.identity.id,
        displayName: 'New Name',
      });

      expect(auditRepo.entries).toHaveLength(1);
      const entry = auditRepo.entries[0];
      expect(entry?.action).toBe('update');
      expect(entry?.previousVersion).toBe(1);
      expect(entry?.newVersion).toBe(updated.version as number);
    });

    it('rejects an empty display name', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      await expect(
        updateUseCase.execute({
          guestIdentityId: createResult.identity.id,
          displayName: '',
        }),
      ).rejects.toThrow();
    });

    it('rejects a display name longer than 80 characters', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      await expect(
        updateUseCase.execute({
          guestIdentityId: createResult.identity.id,
          displayName: 'x'.repeat(81),
        }),
      ).rejects.toThrow();
    });

    it('throws if the guest identity does not exist', async () => {
      await expect(
        updateUseCase.execute({
          guestIdentityId: 'nonexistent' as GuestIdentityId,
          displayName: 'Name',
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('respects expectedVersion for optimistic concurrency', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      await expect(
        updateUseCase.execute({
          guestIdentityId: createResult.identity.id,
          displayName: 'New',
          expectedVersion: 99,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });

  // --------------------------------------------------------------------------
  // RecoverGuestIdentityUseCase
  // --------------------------------------------------------------------------

  describe('RecoverGuestIdentityUseCase', () => {
    let createUseCase: CreateGuestIdentityUseCase;
    let recoverUseCase: RecoverGuestIdentityUseCase;

    beforeEach(() => {
      createUseCase = new CreateGuestIdentityUseCase(
        guestRepo,
        secureStorage,
        auditRepo,
        hashFn,
        generateSecretFn,
        generateIdFn,
      );
      recoverUseCase = new RecoverGuestIdentityUseCase(
        guestRepo,
        secureStorage,
        auditRepo,
        hashFn,
        generateSecretFn,
        generateIdFn,
      );
    });

    it('recovers from broken state by generating a new device secret', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      // Simulate the broken state.
      await secureStorage.delete(SECURE_STORAGE_KEYS.guestDeviceSecret);

      const result = await recoverUseCase.execute({
        guestIdentityId: createResult.identity.id,
      });

      expect(result.deviceSecret).toBe(TEST_SECRET);
      expect(result.identity.deviceSecretHash).toBe(`hash(${TEST_SECRET})`);
      expect(result.identity.version as number).toBe(2);
      expect(result.cloudLinkingBlocked).toBe(true);

      // SecureStore should now have the new secret.
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.guestDeviceSecret)).toBe(TEST_SECRET);
      // Cloud-linking flag should be set.
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.guestCloudLinkingBlocked)).toBe('true');
    });

    it('does NOT delete local data during recovery', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      await secureStorage.delete(SECURE_STORAGE_KEYS.guestDeviceSecret);

      await recoverUseCase.execute({
        guestIdentityId: createResult.identity.id,
      });

      // The SQLite row should still exist (with updated hash + version).
      const stillThere = await guestRepo.findById(createResult.identity.id);
      expect(stillThere).not.toBeNull();
      expect(stillThere?.version as number).toBe(2);
      // The display name should be preserved.
      expect(stillThere?.displayName as string).toBe('Sravan');
    });

    it('writes an audit entry for the recovery', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      await secureStorage.delete(SECURE_STORAGE_KEYS.guestDeviceSecret);
      auditRepo.entries.length = 0;

      await recoverUseCase.execute({
        guestIdentityId: createResult.identity.id,
      });

      expect(auditRepo.entries).toHaveLength(1);
      const entry = auditRepo.entries[0];
      expect(entry?.action).toBe('update');
      expect(entry?.changeSummary).toEqual({ recovered: true, cloudLinkingBlocked: true });
    });

    it('throws if the guest identity does not exist', async () => {
      await expect(
        recoverUseCase.execute({
          guestIdentityId: 'nonexistent' as GuestIdentityId,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('throws if the identity is not broken (secret present and matches)', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      // Don't delete the secret — identity is healthy.
      await expect(
        recoverUseCase.execute({
          guestIdentityId: createResult.identity.id,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('recovers when secret exists but hash mismatches (corruption)', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      // Overwrite the secret with a wrong value (hash will mismatch).
      await secureStorage.set(SECURE_STORAGE_KEYS.guestDeviceSecret, 'wrong-secret-value-123456');

      const result = await recoverUseCase.execute({
        guestIdentityId: createResult.identity.id,
      });

      expect(result.identity.deviceSecretHash).toBe(`hash(${TEST_SECRET})`);
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.guestDeviceSecret)).toBe(TEST_SECRET);
    });
  });

  // --------------------------------------------------------------------------
  // ValidateGuestIdentityUseCase
  // --------------------------------------------------------------------------

  describe('ValidateGuestIdentityUseCase', () => {
    let createUseCase: CreateGuestIdentityUseCase;
    let validateUseCase: ValidateGuestIdentityUseCase;

    beforeEach(() => {
      createUseCase = new CreateGuestIdentityUseCase(
        guestRepo,
        secureStorage,
        auditRepo,
        hashFn,
        generateSecretFn,
        generateIdFn,
      );
      validateUseCase = new ValidateGuestIdentityUseCase(guestRepo, secureStorage, hashFn);
    });

    it('returns valid=true for a healthy identity', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      const result = await validateUseCase.execute({
        guestIdentityId: createResult.identity.id,
      });
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('returns reason=missing-secret when SecureStore lost the secret', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      await secureStorage.delete(SECURE_STORAGE_KEYS.guestDeviceSecret);

      const result = await validateUseCase.execute({
        guestIdentityId: createResult.identity.id,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing-secret');
    });

    it('returns reason=hash-mismatch when the secret does not match the hash', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      await secureStorage.set(
        SECURE_STORAGE_KEYS.guestDeviceSecret,
        'wrong-secret-value-123456',
      );

      const result = await validateUseCase.execute({
        guestIdentityId: createResult.identity.id,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('hash-mismatch');
    });

    it('returns reason=not-found when the identity does not exist', async () => {
      const result = await validateUseCase.execute({
        guestIdentityId: 'nonexistent' as GuestIdentityId,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not-found');
    });

    it('is read-only — does not mutate SecureStore or SQLite', async () => {
      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      const secretBefore = await secureStorage.get(SECURE_STORAGE_KEYS.guestDeviceSecret);
      const identityBefore = await guestRepo.findById(createResult.identity.id);

      await validateUseCase.execute({
        guestIdentityId: createResult.identity.id,
      });

      const secretAfter = await secureStorage.get(SECURE_STORAGE_KEYS.guestDeviceSecret);
      const identityAfter = await guestRepo.findById(createResult.identity.id);
      expect(secretAfter).toBe(secretBefore);
      expect(identityAfter).toEqual(identityBefore);
    });
  });

  // --------------------------------------------------------------------------
  // Offline startup
  // --------------------------------------------------------------------------

  describe('offline startup', () => {
    it('load + validate work without any network calls', async () => {
      const createUseCase = new CreateGuestIdentityUseCase(
        guestRepo,
        secureStorage,
        auditRepo,
        hashFn,
        generateSecretFn,
        generateIdFn,
      );
      const loadUseCase = new LoadCurrentIdentityUseCase(guestRepo, secureStorage);
      const validateUseCase = new ValidateGuestIdentityUseCase(guestRepo, secureStorage, hashFn);

      const createResult = await createUseCase.execute({ displayName: 'Offline' });
      const loaded = await loadUseCase.execute();
      const validated = await validateUseCase.execute({
        guestIdentityId: createResult.identity.id,
      });

      expect(loaded.type).toBe('guest');
      expect(validated.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Corrupt identity record handling
  // --------------------------------------------------------------------------

  describe('corrupt identity record handling', () => {
    it('load returns broken (corrupt-identity) when findById throws', async () => {
      await secureStorage.set(
        SECURE_STORAGE_KEYS.currentGuestIdentityId,
        'corrupt-id',
      );
      guestRepo.letFindByIdThrow = true;
      const loadUseCase = new LoadCurrentIdentityUseCase(guestRepo, secureStorage);
      const result = await loadUseCase.execute();
      expect(result.type).toBe('broken');
      if (result.type === 'broken') {
        expect(result.reason).toBe('corrupt-identity');
      }
    });

    it('validate returns reason=not-found when findById throws', async () => {
      guestRepo.letFindByIdThrow = true;
      const validateUseCase = new ValidateGuestIdentityUseCase(guestRepo, secureStorage, hashFn);
      const result = await validateUseCase.execute({
        guestIdentityId: 'corrupt-id' as GuestIdentityId,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('not-found');
    });

    it('does NOT delete local data on corruption — recovery is non-destructive', async () => {
      const createUseCase = new CreateGuestIdentityUseCase(
        guestRepo,
        secureStorage,
        auditRepo,
        hashFn,
        generateSecretFn,
        generateIdFn,
      );
      const recoverUseCase = new RecoverGuestIdentityUseCase(
        guestRepo,
        secureStorage,
        auditRepo,
        hashFn,
        generateSecretFn,
        generateIdFn,
      );

      const createResult = await createUseCase.execute({ displayName: 'Sravan' });
      await secureStorage.delete(SECURE_STORAGE_KEYS.guestDeviceSecret);

      // Even after multiple load attempts (broken state), local data persists.
      const loadUseCase = new LoadCurrentIdentityUseCase(guestRepo, secureStorage);
      await loadUseCase.execute();
      await loadUseCase.execute();

      const stillThere = await guestRepo.findById(createResult.identity.id);
      expect(stillThere).not.toBeNull();

      // Recovery repairs without data loss.
      const recovered = await recoverUseCase.execute({
        guestIdentityId: createResult.identity.id,
      });
      expect(recovered.identity.displayName as string).toBe('Sravan');
    });
  });

  // --------------------------------------------------------------------------
  // DeviceInstallationService
  // --------------------------------------------------------------------------

  describe('DeviceInstallationService', () => {
    let installationRepo: InMemoryDeviceInstallationRepository;
    let service: DeviceInstallationService;

    beforeEach(() => {
      installationRepo = new InMemoryDeviceInstallationRepository();
      service = new DeviceInstallationService(
        installationRepo,
        secureStorage,
        auditRepo,
        generateIdFn,
      );
    });

    it('creates a device installation on first launch and stores the ID in SecureStore', async () => {
      const result = await service.ensureInstallation({
        profileId: 'guest-1' as UserId,
        platform: 'ios',
        deviceName: 'iPhone 15',
        appVersion: '0.1.0',
      });

      expect(result.created).toBe(true);
      expect(result.installationId).toBeTruthy();
      expect(await secureStorage.get(SECURE_STORAGE_KEYS.deviceInstallationId)).toBe(
        result.installationId,
      );

      const installation = await installationRepo.findById(result.installationId);
      expect(installation).not.toBeNull();
      expect(installation?.platform).toBe('ios');
      expect(installation?.profileId as string).toBe('guest-1');
    });

    it('updates lastSeen on subsequent launches (does not create a new record)', async () => {
      const first = await service.ensureInstallation({
        profileId: 'guest-1' as UserId,
        platform: 'ios',
      });
      const second = await service.ensureInstallation({
        profileId: 'guest-1' as UserId,
        platform: 'ios',
      });

      expect(second.created).toBe(false);
      expect(second.installationId).toBe(first.installationId);
      expect(installationRepo.store.size).toBe(1);
    });

    it('updates profileId when the active profile changes', async () => {
      await service.ensureInstallation({
        profileId: 'guest-1' as UserId,
        platform: 'ios',
      });
      const second = await service.ensureInstallation({
        profileId: 'cloud-user-1' as UserId,
        platform: 'ios',
      });

      const installation = await installationRepo.findById(second.installationId);
      expect(installation?.profileId as string).toBe('cloud-user-1');
    });

    it('writes an audit entry on first creation', async () => {
      auditRepo.entries.length = 0;
      await service.ensureInstallation({
        profileId: 'guest-1' as UserId,
        platform: 'android',
      });
      expect(auditRepo.entries).toHaveLength(1);
      const entry = auditRepo.entries[0];
      expect(entry?.entityType).toBe('device_installation');
      expect(entry?.action).toBe('create');
    });

    it('getInstallationId returns null on first launch', async () => {
      expect(await service.getInstallationId()).toBeNull();
    });

    it('getInstallationId returns the stored ID after ensureInstallation', async () => {
      const result = await service.ensureInstallation({
        profileId: 'guest-1' as UserId,
        platform: 'ios',
      });
      expect(await service.getInstallationId()).toBe(result.installationId);
    });
  });
});
