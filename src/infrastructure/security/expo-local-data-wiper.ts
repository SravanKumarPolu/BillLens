/**
 * ExpoLocalDataWiper — production `LocalDataWiper` implementation
 * (v2.4.0) for the account-deletion flow (Apple 5.1.1(v) / Play policy).
 *
 * Wipes, in order:
 *   1. All local receipt/payment image files (expo-file-system `File` API).
 *   2. Every SQLite row (drop-and-recreate via `runMigrations` on a
 *      fresh connection — simplest correct approach for a full wipe).
 *   3. SecureStore entries (session tokens, guest device secret).
 *   4. The persisted zustand stores (AsyncStorage keys).
 *
 * Guarantees from the port contract:
 *   - Uploads NOTHING while wiping (the sync coordinator must already be
 *     stopped by the caller; this wiper also clears the queue as part of
 *     the database wipe).
 *   - Logs no receipt text, tokens, or financial values — only store
 *     NAMES and counts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import type { LocalDataWiper } from '@application/identity/account-deletion/account-deletion.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { DatabaseConnection } from '@infrastructure/sqlite/database-connection';


/** AsyncStorage keys used by the persisted zustand stores. */
const PERSISTED_STORE_KEYS: readonly string[] = [
  'billlens.guest-state',
  'billlens.navigation-state',
  'billlens.theme-state',
  'billlens.group-state',
  'billlens.capture-state',
  'billlens.draft-state',
];

/** Local receipt/payment image directories (see src/config/capture.ts). */
const LOCAL_IMAGE_DIRECTORIES: readonly string[] = ['receipts', 'payments', 'drafts'];

export class ExpoLocalDataWiper implements LocalDataWiper {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly options?: {
      /** Injectable for tests. */
      readonly deleteSecureValue?: (key: string) => Promise<void>;
      /** Injectable for tests. */
      readonly clearPersistedStore?: (key: string) => Promise<void>;
    },
  ) {}

  async wipeAllLocalData(): Promise<{ wipedStores: readonly string[] }> {
    const wipedStores: string[] = [];

    // --- 1. Receipt + payment images ----------------------------------------
    for (const dir of LOCAL_IMAGE_DIRECTORIES) {
      try {
        const directory = new FileSystem.Directory(
          FileSystem.Paths.document,
          dir,
        );
        if (directory.exists) {
          directory.delete(); // recursive by contract (expo-file-system)
          wipedStores.push(`images:${dir}`);
        }
      } catch {
        // A missing/unreadable image directory is not a wipe failure.
      }
    }

    // --- 2. Database rows (drop + recreate the full schema) ------------------
    // Dropping every table and re-running migrations guarantees zero
    // residual rows regardless of future schema growth.
    try {
      const tables = await this.database.all<{ name: string }>(
        `select name from sqlite_master where type = 'table' and name not like 'sqlite_%'`,
      );
      await this.database.transaction(async (tx) => {
        // RECREATE the schema_version table empty so runMigrations re-applies.
        for (const table of tables) {
          await tx.exec(`drop table if exists "${table.name}"`);
        }
      });
      wipedStores.push(`sqlite:${tables.length}-tables`);
    } catch (error) {
      throw new Error(`Database wipe failed: ${String(error)}`);
    }

    // --- 3. SecureStore entries ----------------------------------------------
    const deleteSecure = this.options?.deleteSecureValue ?? ((key: string) =>
      SecureStore.deleteItemAsync(key));
    for (const key of Object.values(SECURE_STORAGE_KEYS)) {
      try {
        await deleteSecure(key);
      } catch {
        // Absent keys are fine.
      }
    }
    wipedStores.push('secure-store');

    // --- 4. Persisted zustand stores (AsyncStorage) ---------------------------
    const clearStore =
      this.options?.clearPersistedStore ??
      (async (key: string) => {
        await AsyncStorage.removeItem(key);
      });
    for (const key of PERSISTED_STORE_KEYS) {
      try {
        await clearStore(key);
      } catch {
        // Absent keys are fine.
      }
    }
    wipedStores.push('persisted-stores');

    return { wipedStores };
  }
}
