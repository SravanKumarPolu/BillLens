import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import type { GuestIdentityId } from '@shared-types/index';

/**
 * ValidateGuestIdentityUseCase — verify a guest identity is usable.
 *
 * Checks:
 *   1. Guest identity exists in SQLite.
 *   2. SecureStore has the device secret.
 *   3. The hash of the SecureStore secret matches the stored hash.
 *
 * Returns `{ valid: boolean, reason?: string }`. The reason is a stable
 * machine-readable string (kebab-case) so the UI can map it to a
 * human-readable message without parsing free-text.
 *
 * This use case is READ-ONLY — it never mutates data. If the identity
 * is invalid, the caller should invoke `RecoverGuestIdentityUseCase`
 * (which preserves local data and generates a new secret).
 */

export interface ValidateGuestIdentityInput {
  readonly guestIdentityId: GuestIdentityId;
}

export interface ValidateGuestIdentityOutput {
  readonly valid: boolean;
  readonly reason?: 'not-found' | 'missing-secret' | 'hash-mismatch';
}

export class ValidateGuestIdentityUseCase {
  constructor(
    private readonly guestRepo: GuestIdentityRepository,
    private readonly secureStorage: SecureStorage,
    private readonly hashFn: (input: string) => string,
  ) {}

  async execute(input: ValidateGuestIdentityInput): Promise<ValidateGuestIdentityOutput> {
    // 1. Identity exists in SQLite.
    let identity: Awaited<ReturnType<GuestIdentityRepository['findById']>>;
    try {
      identity = await this.guestRepo.findById(input.guestIdentityId);
    } catch {
      return { valid: false, reason: 'not-found' };
    }
    if (!identity) {
      return { valid: false, reason: 'not-found' };
    }

    // 2. SecureStore has the device secret.
    const deviceSecret = await this.secureStorage.get(
      SECURE_STORAGE_KEYS.guestDeviceSecret,
    );
    if (!deviceSecret) {
      return { valid: false, reason: 'missing-secret' };
    }

    // 3. Hash matches.
    const computedHash = this.hashFn(deviceSecret);
    if (computedHash !== identity.deviceSecretHash) {
      return { valid: false, reason: 'hash-mismatch' };
    }

    return { valid: true };
  }
}
