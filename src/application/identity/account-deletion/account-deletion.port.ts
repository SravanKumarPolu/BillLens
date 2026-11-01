import type { AccountDeletionRequest } from '@domain/entities/account-deletion-request';
import type { UserId } from '@shared-types/index';

/**
 * Account deletion ports — Phase 8 Prompt 77.
 *
 * The application layer cannot import Supabase, SQLite, Expo FileSystem
 * or SecureStore (architecture boundary), so account deletion depends on
 * these two minimal ports instead. The composition root wires them to
 * the real infrastructure adapters.
 */

/**
 * Persistence for scheduled account-deletion requests.
 *
 * Production implementation: a local SQLite table plus a Supabase
 * `account_deletion_requests` table (server-side job completes the
 * cloud deletion after the recovery deadline).
 */
export interface AccountDeletionRepository {
  /** Save (create or update) a deletion request. */
  save(request: AccountDeletionRequest): Promise<void>;
  /** The currently scheduled/active request for a user, if any. */
  findActiveByUser(userId: UserId): Promise<AccountDeletionRequest | null>;
  /** Find by id (used by tests and support tooling). */
  findById(id: string): Promise<AccountDeletionRequest | null>;
}

/**
 * Local data wipe — the destructive half of account deletion.
 *
 * Implementations MUST wipe, at minimum:
 *   - All SQLite rows (groups, expenses, splits, payers, settlements,
 *     receipts, receipt items, drafts, invites, reminders, payment
 *     handles, audit logs, sync operations, conflicts, preferences).
 *   - Local receipt image files and export/backup artifacts.
 *   - SecureStore entries (session tokens, guest device secret,
 *     guest identity id).
 *
 * Implementations MUST NOT:
 *   - Upload anything to the cloud while wiping.
 *   - Log receipt text, tokens, or financial values.
 */
export interface LocalDataWiper {
  /**
   * Permanently destroy all local BillLens data on this device.
   * Returns the number of top-level stores wiped (for diagnostics only).
   */
  wipeAllLocalData(): Promise<{ wipedStores: readonly string[] }>;
}
