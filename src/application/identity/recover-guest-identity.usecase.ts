import type { GuestIdentity } from '@domain/entities/guest-identity';
import { InvalidEntityError } from '@domain/errors';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import {
  asDateTime,
  asVersionNumber,
  nextVersionNumber,
  nowDateTime,
} from '@domain/value-objects';
import type { GuestIdentityId } from '@shared-types/index';

/**
 * RecoverGuestIdentityUseCase — repair a broken guest identity.
 *
 * The "broken" state is detected by `LoadCurrentIdentityUseCase` when
 * SQLite has a guest identity but SecureStore is missing the device
 * secret. This use case repairs the identity by:
 *
 *   1. Loading the identity from SQLite (does NOT delete local data).
 *   2. Confirming the secret is missing from SecureStore (broken state).
 *   3. Generating a NEW device secret (min 32 chars).
 *   4. Updating the identity's `deviceSecretHash` to match the new secret.
 *   5. Storing the new secret in SecureStore.
 *   6. Setting the `cloud_linking_blocked` flag — the identity was
 *      recovered via the emergency flow; cloud-linking requires a
 *      separate re-verification step (out of scope for this prompt)
 *      before it can proceed.
 *   7. Writing an audit entry.
 *   8. Returning the recovered identity.
 *
 * CRITICAL: this use case NEVER deletes local data. The user's groups,
 * drafts, receipts, and guest history are all preserved. Only the
 * device-secret hash is updated (because the old secret was lost).
 */

export interface RecoverGuestIdentityInput {
  readonly guestIdentityId: GuestIdentityId;
}

export interface RecoverGuestIdentityOutput {
  readonly identity: GuestIdentity;
  /** The new device secret. Caller may display once, then forget. */
  readonly deviceSecret: string;
  /** True if cloud-linking is blocked (always true after recovery). */
  readonly cloudLinkingBlocked: boolean;
}

export class RecoverGuestIdentityUseCase {
  constructor(
    private readonly guestRepo: GuestIdentityRepository,
    private readonly secureStorage: SecureStorage,
    private readonly auditRepo: AuditRepository,
    private readonly hashFn: (input: string) => string,
    private readonly generateSecretFn: () => string,
    private readonly generateIdFn: () => string,
  ) {}

  async execute(input: RecoverGuestIdentityInput): Promise<RecoverGuestIdentityOutput> {
    // 1. Load the identity from SQLite (do NOT delete local data).
    const current = await this.guestRepo.findById(input.guestIdentityId);
    if (!current) {
      throw new InvalidEntityError(
        `Guest identity ${input.guestIdentityId} not found`,
      );
    }

    // 2. Confirm the broken state (secret missing).
    const existingSecret = await this.secureStorage.get(
      SECURE_STORAGE_KEYS.guestDeviceSecret,
    );
    if (existingSecret) {
      // Secret exists — verify it matches the hash. If it matches, the
      // identity is NOT broken; nothing to recover.
      const existingHash = this.hashFn(existingSecret);
      if (existingHash === current.deviceSecretHash) {
        throw new InvalidEntityError(
          'Guest identity is not broken (device secret present and hash matches). Nothing to recover.',
        );
      }
      // Secret exists but hash mismatches — this is a different kind of
      // corruption. We still proceed with recovery (regenerate the
      // secret) because the current state is unusable for cloud-linking.
    }

    // 3. Generate a NEW device secret.
    const deviceSecret = this.generateSecretFn();
    if (!deviceSecret || deviceSecret.length < 32) {
      throw new InvalidEntityError(
        `Device secret must be at least 32 characters, got ${deviceSecret?.length ?? 0}`,
      );
    }
    const deviceSecretHash = this.hashFn(deviceSecret);

    // 4. Update the identity's deviceSecretHash.
    const now = nowDateTime();
    const updated: GuestIdentity = {
      ...current,
      deviceSecretHash,
      updatedAt: asDateTime(now),
      version: asVersionNumber(nextVersionNumber(current.version) as number),
    };

    // 5. Persist to SQLite + SecureStore.
    await this.guestRepo.save(updated);
    await this.secureStorage.set(SECURE_STORAGE_KEYS.guestDeviceSecret, deviceSecret);
    await this.secureStorage.set(SECURE_STORAGE_KEYS.currentGuestIdentityId, updated.id as string);

    // 6. Block cloud-linking until a separate re-verification flow clears
    //    the flag. This prevents an attacker who steals the device from
    //    recovering the identity and immediately linking to their cloud
    //    account.
    await this.secureStorage.set(SECURE_STORAGE_KEYS.guestCloudLinkingBlocked, 'true');

    // 7. Audit.
    await this.auditRepo.append({
      id: this.generateIdFn(),
      entityType: 'guest_identity',
      entityId: updated.id as string,
      action: 'update',
      actorId: undefined,
      previousVersion: current.version as number,
      newVersion: updated.version as number,
      changeSummary: { recovered: true, cloudLinkingBlocked: true },
    });

    return {
      identity: updated,
      deviceSecret,
      cloudLinkingBlocked: true,
    };
  }
}
