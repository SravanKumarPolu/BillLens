/**
 * SecureStorage port — declared in the domain layer, implemented by
 * infrastructure (expo-secure-store in production, InMemorySecureStorage
 * in tests).
 *
 * This follows the dependency-inversion principle: the application layer
 * depends on this interface (defined in domain), not on the concrete
 * infrastructure implementation.
 */

export interface SecureStorage {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

export const SECURE_STORAGE_KEYS = {
  guestDeviceSecret: 'billlens.guest.device_secret',
  supabaseAccessToken: 'billlens.supabase.access_token',
  supabaseRefreshToken: 'billlens.supabase.refresh_token',
  currentGuestIdentityId: 'billlens.guest.identity_id',
  currentUserId: 'billlens.user.id',
  /**
   * 'true' when the guest identity was recovered via the emergency
   * recovery flow (SecureStore secret was missing). Cloud-linking is
   * blocked while this flag is set; a separate re-verification flow
   * (out of scope for Phase 3 Prompts 21–22) clears it.
   */
  guestCloudLinkingBlocked: 'billlens.guest.cloud_linking_blocked',
  /**
   * Stable installation ID created on first launch. Used for push
   * notifications and multi-device sync. NOT proof of human identity.
   */
  deviceInstallationId: 'billlens.device.installation_id',
} as const;

export type SecureStorageKey = keyof typeof SECURE_STORAGE_KEYS;
