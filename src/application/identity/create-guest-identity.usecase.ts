import {
  asGuestIdentityId,
  createGuestIdentity as createGuestIdentityEntity,
  type GuestIdentity,
} from '@domain/entities/guest-identity';
import { InvalidEntityError } from '@domain/errors';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import { asDisplayName } from '@domain/value-objects';
import type { GuestIdentityId } from '@shared-types/index';

/**
 * CreateGuestIdentityUseCase — durable guest identity creation.
 *
 * This is the Phase 3 replacement for `IdentityService.createGuestIdentity`.
 * It is a single-purpose use case with explicit inputs and outputs, making
 * it easier to test, compose, and evolve without touching the legacy
 * IdentityService.
 *
 * Flow:
 *   1. Validate the display name (1–80 chars after trim).
 *   2. Generate a device-scoped secret (min 32 chars = 128 bits entropy).
 *   3. Hash the secret (non-reversible) for SQLite storage.
 *   4. Refuse to create a second guest identity if one already exists.
 *   5. Persist the identity to SQLite.
 *   6. Store the raw secret + identity ID in SecureStore.
 *   7. Write an audit entry.
 *   8. Return the identity + the raw secret (caller may display once).
 *
 * CRITICAL: the raw secret is stored ONLY in SecureStore (encrypted). The
 * SQLite row holds only the hash. The secret is never logged.
 */

export interface CreateGuestIdentityInput {
  readonly displayName: string;
}

export interface CreateGuestIdentityOutput {
  readonly identity: GuestIdentity;
  /** The raw device secret. Caller may display once, then forget. */
  readonly deviceSecret: string;
}

export class CreateGuestIdentityUseCase {
  constructor(
    private readonly guestRepo: GuestIdentityRepository,
    private readonly secureStorage: SecureStorage,
    private readonly auditRepo: AuditRepository,
    private readonly hashFn: (input: string) => string | Promise<string>,
    private readonly generateSecretFn: () => string,
    private readonly generateIdFn: () => string,
  ) {}

  async execute(input: CreateGuestIdentityInput): Promise<CreateGuestIdentityOutput> {
    // 1. Validate display name (throws EmptyValueError / InvalidEntityError).
    asDisplayName(input.displayName);

    // 2. Generate device secret.
    const deviceSecret = this.generateSecretFn();
    if (!deviceSecret || deviceSecret.length < 32) {
      throw new InvalidEntityError(
        `Device secret must be at least 32 characters, got ${deviceSecret?.length ?? 0}`,
      );
    }
    const deviceSecretHash = await this.hashFn(deviceSecret);

    // 3. Refuse to create a second guest identity.
    const existingId = await this.secureStorage.get(
      SECURE_STORAGE_KEYS.currentGuestIdentityId,
    );
    if (existingId) {
      const existing = await this.guestRepo.findById(existingId as GuestIdentityId);
      if (existing) {
        throw new InvalidEntityError(
          'Guest identity already exists. Call LoadCurrentIdentityUseCase instead.',
        );
      }
    }

    // 4. Create the identity entity (throws on invalid display name).
    const id = asGuestIdentityId(this.generateIdFn());
    const identity = createGuestIdentityEntity({
      id,
      displayName: input.displayName,
      deviceSecretHash,
    });

    // 5. Persist to SQLite.
    await this.guestRepo.save(identity);

    // 6. Store secret + identity ID in SecureStore.
    await this.secureStorage.set(SECURE_STORAGE_KEYS.guestDeviceSecret, deviceSecret);
    await this.secureStorage.set(SECURE_STORAGE_KEYS.currentGuestIdentityId, id as string);

    // 7. Audit.
    await this.auditRepo.append({
      id: this.generateIdFn(),
      entityType: 'guest_identity',
      entityId: id as string,
      action: 'create',
      actorId: undefined,
      newVersion: identity.version as number,
    });

    return { identity, deviceSecret };
  }
}
