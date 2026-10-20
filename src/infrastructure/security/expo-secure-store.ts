/**
 * ExpoSecureStorage — production `SecureStorage` backed by
 * `expo-secure-store` (iOS Keychain / Android Keystore).
 *
 * Like `ExpoSqliteDatabase`, this adapter imports a native-module SDK
 * package and is therefore only imported by the production bootstrap
 * (`src/store/services-registry.ts`). Tests inject
 * `InMemorySecureStorage` instead.
 *
 * Values are stored under the exact keys from
 * `SECURE_STORAGE_KEYS` (domain port) — no prefixing — so both this
 * adapter and the test double address identical storage slots.
 */

import * as SecureStore from 'expo-secure-store';

import type { SecureStorage } from '@domain/ports/secure-storage.port';

/** Keychain/Keystore options used for every BillLens entry. */
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  // Keep values only on the device that created them (no iCloud /
  // encrypted-backup migration of auth tokens).
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Production secure storage. All methods map 1:1 onto expo-secure-store
 * async APIs. `has` is implemented via `get` because SecureStore has no
 * dedicated existence probe.
 */
export class ExpoSecureStorage implements SecureStorage {
  async set(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
  }

  async get(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
  }

  async delete(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
  }

  async has(key: string): Promise<boolean> {
    const value = await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
    return value !== null;
  }
}
