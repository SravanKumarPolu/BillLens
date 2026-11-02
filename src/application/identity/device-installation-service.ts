import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { DeviceInstallation, DeviceInstallationRepository } from '@domain/repositories/device-installation.repository';
import { asDateTime, nowDateTime } from '@domain/value-objects';
import type { UserId } from '@shared-types/index';

/**
 * DeviceInstallationService — manages the per-installation record.
 *
 * On first launch:
 *   - Generates a stable installation ID (UUID).
 *   - Stores it in SecureStore (NOT AsyncStorage — the installation ID
 *     is a credential-like identifier used for push notifications and
 *     multi-device sync).
 *   - Creates a DeviceInstallation row in SQLite.
 *
 * On subsequent launches:
 *   - Reads the installation ID from SecureStore.
 *   - Updates the `lastSeenAt` timestamp on the existing row.
 *
 * IMPORTANT: the installation identity is NOT proof of human identity.
 * It identifies a device, not a user. A single user may have multiple
 * installations (phone, tablet, web); a single device may be shared by
 * multiple users (sign-in / sign-out switches the active profile but
 * the installation ID stays the same).
 *
 * The `profileId` field on DeviceInstallation is updated when the user
 * signs in or creates a guest identity. On first launch (before any
 * identity exists), the caller may pass the guest identity ID once it
 * is created.
 */

export interface EnsureInstallationInput {
  /**
   * The profile to associate with this installation. On first launch
   * this is typically the just-created guest identity ID (cast to
   * UserId). After sign-in, it becomes the cloud user ID.
   */
  readonly profileId: UserId;
  readonly platform: 'ios' | 'android' | 'web';
  readonly deviceName?: string;
  readonly appVersion?: string;
  readonly pushToken?: string;
}

export interface EnsureInstallationOutput {
  readonly installationId: string;
  readonly created: boolean;
}

export class DeviceInstallationService {
  constructor(
    private readonly installationRepo: DeviceInstallationRepository,
    private readonly secureStorage: SecureStorage,
    private readonly auditRepo: AuditRepository,
    private readonly generateIdFn: () => string,
  ) {}

  async ensureInstallation(
    input: EnsureInstallationInput,
  ): Promise<EnsureInstallationOutput> {
    // 1. Check SecureStore for an existing installation ID.
    const existingId = await this.secureStorage.get(
      SECURE_STORAGE_KEYS.deviceInstallationId,
    );

    if (existingId) {
      // 2a. Subsequent launch — update lastSeen.
      const existing = await this.installationRepo.findById(existingId);
      if (existing) {
        const now = nowDateTime();
        await this.installationRepo.updateLastSeen(existingId, now);
        // If the profileId changed (e.g. user signed in to a different
        // account), save a new row with the updated profileId.
        if (existing.profileId !== input.profileId) {
          await this.installationRepo.save({
            ...existing,
            profileId: input.profileId,
            pushToken: input.pushToken ?? existing.pushToken,
            appVersion: input.appVersion ?? existing.appVersion,
            lastSeenAt: asDateTime(now),
            updatedAt: asDateTime(now),
          });
        }
        return { installationId: existingId, created: false };
      }
      // SecureStore has an ID but SQLite lost the row — fall through to
      // create a new installation with the same ID (idempotent).
      await this.createInstallation(existingId, input);
      return { installationId: existingId, created: true };
    }

    // 2b. First launch — generate a new ID and create the record.
    const newId = this.generateIdFn();
    await this.secureStorage.set(
      SECURE_STORAGE_KEYS.deviceInstallationId,
      newId,
    );
    await this.createInstallation(newId, input);
    return { installationId: newId, created: true };
  }

  /**
   * Read the installation ID from SecureStore without creating a row.
   * Returns null on first launch (before ensureInstallation has run).
   */
  async getInstallationId(): Promise<string | null> {
    return this.secureStorage.get(SECURE_STORAGE_KEYS.deviceInstallationId);
  }

  private async createInstallation(
    id: string,
    input: EnsureInstallationInput,
  ): Promise<void> {
    const now = nowDateTime();
    const installation: DeviceInstallation = {
      id,
      profileId: input.profileId,
      platform: input.platform,
      deviceName: input.deviceName,
      pushToken: input.pushToken,
      appVersion: input.appVersion,
      lastSeenAt: asDateTime(now),
      createdAt: asDateTime(now),
      updatedAt: asDateTime(now),
      version: 1,
    };
    await this.installationRepo.save(installation);
    await this.auditRepo.append({
      id: this.generateIdFn(),
      entityType: 'device_installation',
      entityId: id,
      action: 'create',
      actorId: input.profileId,
      newVersion: 1,
      changeSummary: { platform: input.platform },
    });
  }
}
