import type { AuthSession } from '@domain/ports/authentication-provider.port';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { SessionStoragePort } from '@domain/ports/session-storage.port';
import type { UserId } from '@shared-types/index';

/**
 * Concrete SessionStorage implementation.
 *
 * Wraps SecureStorage (expo-secure-store in production) to persist the
 * Supabase access/refresh tokens and the current cloud user ID. Tokens
 * are stored individually — NOT as a serialised blob — so a corrupted
 * single value does not invalidate the others.
 *
 * Implements the {@link SessionStoragePort} interface declared in the
 * domain layer. The application-layer AuthService depends on the port,
 * not on this class, so the architecture-boundary rule ("application
 * must not import infrastructure") is preserved.
 *
 * SECURITY: tokens are stored in the device Keychain/Keystore via
 * SecureStorage — NOT in AsyncStorage (which is unencrypted). Tokens
 * are NEVER logged.
 */
export class SessionStorage implements SessionStoragePort {
  constructor(private readonly secureStorage: SecureStorage) {}

  async saveSession(session: AuthSession): Promise<void> {
    await this.secureStorage.set(
      SECURE_STORAGE_KEYS.supabaseAccessToken,
      session.accessToken,
    );
    await this.secureStorage.set(
      SECURE_STORAGE_KEYS.supabaseRefreshToken,
      session.refreshToken,
    );
    await this.secureStorage.set(
      SECURE_STORAGE_KEYS.currentUserId,
      session.userId as string,
    );
  }

  async loadSession(): Promise<AuthSession | null> {
    const accessToken = await this.secureStorage.get(
      SECURE_STORAGE_KEYS.supabaseAccessToken,
    );
    const refreshToken = await this.secureStorage.get(
      SECURE_STORAGE_KEYS.supabaseRefreshToken,
    );
    const userId = await this.secureStorage.get(SECURE_STORAGE_KEYS.currentUserId);
    if (!accessToken || !refreshToken || !userId) {
      return null;
    }
    return {
      userId: userId as UserId,
      accessToken,
      refreshToken,
      // expiresAt is not persisted — the caller must refresh the session
      // to obtain a fresh token and its real expiry. Treating 0 as
      // "expired" forces a refresh on the next restoreSession() call.
      expiresAt: 0,
      // provider is not persisted — defaulting to 'email' is safe because
      // the caller will refresh and overwrite with the real provider.
      provider: 'email',
    };
  }

  async clearSession(): Promise<void> {
    await this.secureStorage.delete(SECURE_STORAGE_KEYS.supabaseAccessToken);
    await this.secureStorage.delete(SECURE_STORAGE_KEYS.supabaseRefreshToken);
    await this.secureStorage.delete(SECURE_STORAGE_KEYS.currentUserId);
  }
}
