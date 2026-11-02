import type { GuestIdentity } from '@domain/entities/guest-identity';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import type { GuestIdentityId, UserId } from '@shared-types/index';

/**
 * LoadCurrentIdentityUseCase — determine the current identity on launch.
 *
 * Replaces `IdentityService.loadCurrentIdentity` with a richer result type
 * that includes a `broken` state. The broken state occurs when SQLite has
 * a guest identity but SecureStore is missing the device secret — i.e.
 * the local identity cannot prove ownership for cloud-linking.
 *
 * CRITICAL: the broken state does NOT delete local data. It returns
 * `broken` so the UI can offer the recovery flow (`RecoverGuestIdentityUseCase`).
 *
 * Precedence:
 *   1. If SecureStore has a current cloud user ID → return 'cloud'.
 *   2. Else if SecureStore has a current guest identity ID:
 *      a. If the identity exists in SQLite AND the device secret exists
 *         in SecureStore → return 'guest'.
 *      b. If the identity exists in SQLite but the device secret is
 *         MISSING from SecureStore → return 'broken' (with partialIdentity).
 *      c. If the identity does NOT exist in SQLite (orphaned SecureStore
 *         key) → return 'broken' with reason 'missing-identity'.
 *   3. Else → return 'none' (first launch).
 */

export type CurrentIdentityResult =
  | { readonly type: 'none' }
  | { readonly type: 'guest'; readonly identity: GuestIdentity }
  | { readonly type: 'cloud'; readonly userId: UserId }
  | {
      readonly type: 'broken';
      readonly reason: 'missing-secret' | 'missing-identity' | 'corrupt-identity';
      readonly partialIdentity?: GuestIdentity;
      readonly guestIdentityId?: GuestIdentityId;
    };

export class LoadCurrentIdentityUseCase {
  constructor(
    private readonly guestRepo: GuestIdentityRepository,
    private readonly secureStorage: SecureStorage,
  ) {}

  async execute(): Promise<CurrentIdentityResult> {
    // 1. Cloud user takes precedence.
    const cloudUserIdStr = await this.secureStorage.get(SECURE_STORAGE_KEYS.currentUserId);
    if (cloudUserIdStr) {
      return { type: 'cloud', userId: cloudUserIdStr as UserId };
    }

    // 2. Guest identity.
    const guestIdStr = await this.secureStorage.get(
      SECURE_STORAGE_KEYS.currentGuestIdentityId,
    );
    if (!guestIdStr) {
      return { type: 'none' };
    }

    const guestId = guestIdStr as GuestIdentityId;
    let identity: GuestIdentity | null;
    try {
      identity = await this.guestRepo.findById(guestId);
    } catch {
      // SQLite error / corrupt row — return broken without deleting data.
      return {
        type: 'broken',
        reason: 'corrupt-identity',
        guestIdentityId: guestId,
      };
    }

    if (!identity) {
      // SecureStore references a guest identity that no longer exists in
      // SQLite (e.g. user cleared app data but not SecureStore). Return
      // broken — caller decides whether to clean up SecureStore.
      return {
        type: 'broken',
        reason: 'missing-identity',
        guestIdentityId: guestId,
      };
    }

    const deviceSecret = await this.secureStorage.get(SECURE_STORAGE_KEYS.guestDeviceSecret);
    if (!deviceSecret) {
      // SQLite has the identity but SecureStore lost the secret —
      // recovery flow required. Do NOT delete local data.
      return {
        type: 'broken',
        reason: 'missing-secret',
        partialIdentity: identity,
        guestIdentityId: guestId,
      };
    }

    return { type: 'guest', identity };
  }
}
