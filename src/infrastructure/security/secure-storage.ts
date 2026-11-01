/**
 * SecureStore abstraction for sensitive token storage.
 *
 * Production code uses `expo-secure-store`. Tests use `InMemorySecureStorage`
 * which satisfies the same interface.
 *
 * The interface and key catalog live in the domain port
 * (`@domain/ports/secure-storage.port`) so the application layer can depend
 * on the abstraction without importing infrastructure. This module provides
 * the concrete `SecureStorageError` class and (in production) the
 * `expo-secure-store`-backed implementation.
 */

// Re-export the interface and keys from the domain port
export type { SecureStorage, SecureStorageKey } from '@domain/ports/secure-storage.port';
export { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';

/**
 * Thrown when a SecureStorage operation fails (e.g. Keychain access
 * denied on iOS, Keystore locked on Android).
 */
export class SecureStorageError extends Error {
  readonly code: string;
  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, options);
    this.name = 'SecureStorageError';
    this.code = options?.code ?? 'SECURE_STORAGE_ERROR';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
