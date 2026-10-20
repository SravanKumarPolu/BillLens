import type { SecureStorage } from '@domain/ports/secure-storage.port';

import { SecureStorageError } from '../secure-storage';

/**
 * In-memory SecureStorage test double.
 *
 * Implements the same interface as the production `expo-secure-store`
 * wrapper. Used by IdentityService tests to avoid touching the device
 * Keychain/Keystore.
 */
export class InMemorySecureStorage implements SecureStorage {
  private readonly store = new Map<string, string>();

  async set(key: string, value: string): Promise<void> {
    if (!key) throw new SecureStorageError('Key must not be empty', { code: 'EMPTY_KEY' });
    this.store.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    if (!key) throw new SecureStorageError('Key must not be empty', { code: 'EMPTY_KEY' });
    return this.store.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    if (!key) throw new SecureStorageError('Key must not be empty', { code: 'EMPTY_KEY' });
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    if (!key) throw new SecureStorageError('Key must not be empty', { code: 'EMPTY_KEY' });
    return this.store.has(key);
  }

  /** Test-only: clear all stored secrets. */
  clear(): void {
    this.store.clear();
  }

  /** Test-only: peek at all keys (for assertions). */
  keys(): string[] {
    return Array.from(this.store.keys());
  }
}
