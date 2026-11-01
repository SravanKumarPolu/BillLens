import {
  type GuestIdentity,
  completeGuestUpgrade as completeGuestUpgradeEntity,
  createGuestIdentity as createGuestIdentityEntity,
  startGuestUpgrade as startGuestUpgradeEntity,
} from '@domain/entities/guest-identity';
import { DeletedEntityError, InvalidEntityError } from '@domain/errors/index';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { AuditRepository, GuestIdentityRepository } from '@domain/repositories';
import { type DateTime, nextVersionNumber } from '@domain/value-objects';
import type { GuestIdentityId, UserId } from '@shared-types/index';




/**
 * Identity service — manages the current user / guest identity.
 *
 * Responsibilities:
 *   - Create a new guest identity on first app launch.
 *   - Load the current identity (guest or cloud user) on subsequent launches.
 *   - Initiate the guest → cloud upgrade flow.
 *   - Complete the upgrade once the cloud account is created/linked.
 *
 * This is an APPLICATION-layer service. It depends on:
 *   - Domain entities (GuestIdentity, User).
 *   - Domain value objects (DateTime, DisplayName).
 *   - Infrastructure interface (SecureStorage).
 *
 * It does NOT depend on:
 *   - React, React Native, Expo (UI-agnostic).
 *   - Supabase directly (the auth provider is injected).
 *   - SQLite directly (the guest identity repository is injected).
 */

/**
 * Auth provider abstraction. Production code uses Supabase Auth
 * (email OTP, Google, Apple). Tests use a mock.
 */
export interface AuthProvider {
  /**
   * Sign in with email OTP. Sends a one-time code to the email; the
   * user enters the code, which is verified by `verifyEmailOtp`.
   */
  signInWithEmailOtp(email: string): Promise<void>;
  /**
   * Verify the OTP code entered by the user. Returns the cloud user ID
   * on success; throws on failure.
   */
  verifyEmailOtp(email: string, code: string): Promise<{ userId: UserId }>;
  /**
   * Sign in with Google OAuth. Returns the cloud user ID on success.
   */
  signInWithGoogle(): Promise<{ userId: UserId }>;
  /**
   * Sign in with Apple OAuth. Returns the cloud user ID on success.
   */
  signInWithApple(): Promise<{ userId: UserId }>;
  /**
   * Sign out the current user. Clears tokens.
   */
  signOut(): Promise<void>;
  /**
   * Get the current cloud user ID, or null if not signed in.
   */
  getCurrentUserId(): Promise<UserId | null>;
}

/**
 * Repository for GuestIdentity entities — re-exported from the domain
 * layer for callers of `IdentityService`. Concrete implementations
 * live in the infrastructure layer.
 */
export type { GuestIdentityRepository };

/**
 * Result of creating a new guest identity.
 */
export interface CreateGuestResult {
  readonly identity: GuestIdentity;
  /** The device-scoped secret. ALSO stored in SecureStore — caller does not need to. */
  readonly deviceSecret: string;
}

/**
 * Result of initiating the upgrade flow.
 */
export interface StartUpgradeResult {
  readonly identity: GuestIdentity;
  readonly pendingCloudUserId: UserId | null;
}

/**
 * Result of completing the upgrade.
 */
export interface CompleteUpgradeResult {
  readonly identity: GuestIdentity;
  readonly cloudUserId: UserId;
}

export class IdentityService {
  constructor(
    private readonly guestRepo: GuestIdentityRepository,
    private readonly secureStorage: SecureStorage,
    private readonly authProvider: AuthProvider,
    private readonly hashFn: (input: string) => string,
    private readonly generateSecretFn: () => string,
    private readonly auditRepo: AuditRepository,
  ) {}

  /**
   * Create a new guest identity on first app launch.
   *
   * - Generates a device-scoped secret (32 random hex chars).
   * - Hashes the secret (non-reversible) for storage in the DB.
   * - Stores the raw secret in SecureStore.
   * - Stores the guest identity ID in SecureStore so the next launch
   *   knows which identity to load.
   */
  async createGuestIdentity(displayName: string): Promise<CreateGuestResult> {
    const id = generateGuestIdentityId();
    const deviceSecret = this.generateSecretFn();

    // Validate device secret entropy (minimum 32 hex chars = 128 bits)
    if (!deviceSecret || deviceSecret.length < 32) {
      throw new InvalidEntityError(
        `Device secret must be at least 32 characters, got ${deviceSecret.length}`,
      );
    }

    const deviceSecretHash = this.hashFn(deviceSecret);

    const identity = createGuestIdentityEntity({
      id,
      displayName,
      deviceSecretHash,
    });

    await this.guestRepo.save(identity);
    await this.secureStorage.set(SECURE_STORAGE_KEYS.guestDeviceSecret, deviceSecret);
    await this.secureStorage.set(SECURE_STORAGE_KEYS.currentGuestIdentityId, id as string);

    await this.auditRepo.append({
      id: generateId(),
      entityType: 'guest_identity',
      entityId: identity.id as string,
      action: 'create',
      actorId: undefined,
      newVersion: identity.version as number,
    });

    return { identity, deviceSecret };
  }

  /**
   * Load the current identity on app launch.
   *
   * - If a cloud user ID is in SecureStore, return that.
   * - Else if a guest identity ID is in SecureStore, load the guest.
   * - Else return null (first launch — caller should call createGuestIdentity).
   */
  async loadCurrentIdentity(): Promise<
    | { type: 'guest'; identity: GuestIdentity }
    | { type: 'cloud'; userId: UserId }
    | { type: 'none' }
  > {
    const cloudUserIdStr = await this.secureStorage.get(SECURE_STORAGE_KEYS.currentUserId);
    if (cloudUserIdStr) {
      return { type: 'cloud', userId: cloudUserIdStr as UserId };
    }
    const guestIdStr = await this.secureStorage.get(SECURE_STORAGE_KEYS.currentGuestIdentityId);
    if (guestIdStr) {
      const identity = await this.guestRepo.findById(guestIdStr as GuestIdentityId);
      if (identity) {
        return { type: 'guest', identity };
      }
    }
    return { type: 'none' };
  }

  /**
   * Initiate the guest → cloud upgrade flow.
   *
   * - Transitions the guest identity to `upgrade_pending`.
   * - Returns the pending cloud user ID (if the user has already signed
   *   in via the auth provider) or null (if sign-in hasn't happened yet).
   *
   * The caller (UI) is responsible for invoking the auth provider to
   * sign in. After sign-in succeeds, call `completeUpgrade`.
   */
  async startUpgrade(guestIdentityId: GuestIdentityId): Promise<StartUpgradeResult> {
    const identity = await this.guestRepo.findById(guestIdentityId);
    if (!identity) {
      throw new InvalidEntityError(`Guest identity ${guestIdentityId} not found`);
    }

    const pendingCloudUserId = await this.authProvider.getCurrentUserId();

    const updated = startGuestUpgradeEntity(identity, {
      expectedVersion: identity.version,
    });

    await this.guestRepo.save(updated);

    await this.auditRepo.append({
      id: generateId(),
      entityType: 'guest_identity',
      entityId: updated.id as string,
      action: 'update',
      actorId: undefined,
      previousVersion: identity.version as number,
      newVersion: updated.version as number,
    });

    return { identity: updated, pendingCloudUserId };
  }

  /**
   * Complete the upgrade once the cloud account is created/linked.
   *
   * - Verifies that the cloud user is signed in.
   * - Proves ownership of the local identity by presenting the device
   *   secret (from SecureStore) — the cloud verifies the hash matches.
   * - Transitions the guest identity to `upgraded` and sets `linkedUserId`.
   * - Stores the cloud user ID in SecureStore so future launches load
   *   the cloud identity.
   *
   * NOTE: The actual data upload (groups, expenses, settlements) is
   * handled by the GuestUpgradeExecutor (Phase 2), which uses the plan
   * produced by `planGuestUpgrade` in `guest-upgrade-planner.ts`.
   */
  async completeUpgrade(guestIdentityId: GuestIdentityId): Promise<CompleteUpgradeResult> {
    const identity = await this.guestRepo.findById(guestIdentityId);
    if (!identity) {
      throw new InvalidEntityError(`Guest identity ${guestIdentityId} not found`);
    }

    const cloudUserId = await this.authProvider.getCurrentUserId();
    if (!cloudUserId) {
      throw new InvalidEntityError(
        'Cannot complete upgrade: no cloud user is signed in. Call authProvider.signIn* first.',
      );
    }

    // Verify not already linked to a DIFFERENT account
    if (identity.linkedUserId && identity.linkedUserId !== cloudUserId) {
      throw new InvalidEntityError(
        `Guest identity ${guestIdentityId} is already linked to a different cloud account ${identity.linkedUserId}`,
      );
    }

    // Verify device secret
    const deviceSecret = await this.secureStorage.get(SECURE_STORAGE_KEYS.guestDeviceSecret);
    if (!deviceSecret) {
      throw new InvalidEntityError('Cannot complete upgrade: device secret missing from SecureStore');
    }
    const computedHash = this.hashFn(deviceSecret);
    if (computedHash !== identity.deviceSecretHash) {
      throw new InvalidEntityError('Cannot complete upgrade: device secret hash mismatch');
    }

    const updated = completeGuestUpgradeEntity(identity, {
      linkedUserId: cloudUserId,
      expectedVersion: identity.version,
    });

    await this.guestRepo.save(updated);

    await this.auditRepo.append({
      id: generateId(),
      entityType: 'guest_identity',
      entityId: updated.id as string,
      action: 'update',
      actorId: cloudUserId,
      previousVersion: identity.version as number,
      newVersion: updated.version as number,
    });

    // Store cloud user ID
    await this.secureStorage.set(SECURE_STORAGE_KEYS.currentUserId, cloudUserId as string);

    // Delete device secret — no longer needed after upgrade
    await this.secureStorage.delete(SECURE_STORAGE_KEYS.guestDeviceSecret);
    await this.secureStorage.delete(SECURE_STORAGE_KEYS.currentGuestIdentityId);

    return { identity: updated, cloudUserId };
  }

  /**
   * Mark an upgrade as failed (e.g. data upload error). The user can
   * retry by calling `startUpgrade` again.
   */
  async markUpgradeFailed(guestIdentityId: GuestIdentityId, reason: string): Promise<GuestIdentity> {
    const identity = await this.guestRepo.findById(guestIdentityId);
    if (!identity) {
      throw new InvalidEntityError(`Guest identity ${guestIdentityId} not found`);
    }
    if (identity.upgradeStatus === 'upgraded') {
      throw new DeletedEntityError(
        `Guest identity ${guestIdentityId} is already upgraded — cannot mark as failed`,
        'GuestIdentity',
        guestIdentityId as string,
      );
    }

    const updated: GuestIdentity = {
      ...identity,
      upgradeStatus: 'upgrade_failed',
      updatedAt: getCurrentIso() as DateTime,
      version: nextVersionNumber(identity.version),
    };
    await this.guestRepo.save(updated);

    await this.auditRepo.append({
      id: generateId(),
      entityType: 'guest_identity',
      entityId: updated.id as string,
      action: 'update',
      actorId: undefined,
      previousVersion: identity.version as number,
      newVersion: updated.version as number,
      changeSummary: { reason },
    });

    return updated;
  }

  /**
   * Sign out the current cloud user. Clears cloud tokens from
   * SecureStore.
   *
   * After sign-out, `loadCurrentIdentity` returns 'none' if no guest
   * identity is in SecureStore. The user can create a new guest
   * identity via `createGuestIdentity`. If the user upgraded from a
   * guest identity, that guest's `currentGuestIdentityId` was deleted
   * during `completeUpgrade` — the user starts fresh.
   */
  async signOutCloud(): Promise<void> {
    await this.authProvider.signOut();
    await this.secureStorage.delete(SECURE_STORAGE_KEYS.currentUserId);
    await this.secureStorage.delete(SECURE_STORAGE_KEYS.supabaseAccessToken);
    await this.secureStorage.delete(SECURE_STORAGE_KEYS.supabaseRefreshToken);
  }
}

// -------------------------------------------------------------------------
// Pure helpers
// -------------------------------------------------------------------------

function getCurrentIso(): string {
  return new Date().toISOString();
}

function generateGuestIdentityId(): GuestIdentityId {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID() as GuestIdentityId;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` as GuestIdentityId;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
