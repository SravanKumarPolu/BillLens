/**
 * ExpoSqliteDatabase — production `DatabaseConnection` backed by
 * `expo-sqlite` (SDK 51 async API).
 *
 * This adapter is the ONLY file in the app that imports `expo-sqlite`.
 * It is intentionally NOT imported by unit tests — tests use
 * `InMemoryDatabase` (`src/infrastructure/__tests__/in-memory-database.ts`)
 * which satisfies the same port. The services registry
 * (`src/store/services-registry.ts`) is the only production consumer.
 *
 * Behaviour notes:
 *   - The database file lives in the app's default SQLite directory.
 *   - `PRAGMA foreign_keys = ON` is applied on open (SQLite defaults to
 *     OFF; the local schema relies on `ON DELETE CASCADE`).
 *   - `transaction()` maps to `withTransactionAsync`, which BEGINs,
 *     COMMITs on success and ROLLBACKs when the callback throws.
 *   - All bind parameters go through expo-sqlite's parameterised APIs —
 *     SQL is never concatenated from user input.
 */

import * as SQLite from 'expo-sqlite';

import type {
  DatabaseConnection,
  DatabaseResult,
  SqlParam,
  SqlRow,
  TransactionContext,
} from './database-connection';

/** Default local database file name. */
export const DEFAULT_DATABASE_NAME = 'billlens.db';

/**
 * Production SQLite connection. Implements the layer-agnostic
 * `DatabaseConnection` port with expo-sqlite's async APIs.
 */
export class ExpoSqliteDatabase implements DatabaseConnection {
  private constructor(private readonly db: SQLite.SQLiteDatabase) {}

  /**
   * Open (creating if necessary) the named database and apply the
   * connection pragmas. Use this instead of the constructor.
   */
  static async open(name: string = DEFAULT_DATABASE_NAME): Promise<ExpoSqliteDatabase> {
    const db = await SQLite.openDatabaseAsync(name);
    await db.execAsync('PRAGMA foreign_keys = ON;');
    return new ExpoSqliteDatabase(db);
  }

  async exec(sql: string): Promise<void> {
    await this.db.execAsync(sql);
  }

  async run(sql: string, params?: readonly SqlParam[]): Promise<DatabaseResult> {
    const result = params
      ? await this.db.runAsync(sql, [...params])
      : await this.db.runAsync(sql);
    return {
      rowsAffected: result.changes,
      lastInsertRowId: result.lastInsertRowId,
    };
  }

  async all<T = SqlRow>(sql: string, params?: readonly SqlParam[]): Promise<readonly T[]> {
    const rows = params
      ? await this.db.getAllAsync<T>(sql, [...params])
      : await this.db.getAllAsync<T>(sql);
    return rows;
  }

  async get<T = SqlRow>(sql: string, params?: readonly SqlParam[]): Promise<T | null> {
    const row = params
      ? await this.db.getFirstAsync<T>(sql, [...params])
      : await this.db.getFirstAsync<T>(sql);
    return row ?? null;
  }

  async transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    let result: T;
    await this.db.withTransactionAsync(async () => {
      result = await fn(this.transactionContext());
    });
    return result!;
  }

  /**
   * A `TransactionContext` view over the same connection. expo-sqlite's
   * `withTransactionAsync` holds the transaction on this connection, so
   * statements issued through this context execute inside it.
   */
  private transactionContext(): TransactionContext {
    return {
      exec: (sql: string) => this.exec(sql),
      run: (sql: string, params?: readonly SqlParam[]) => this.run(sql, params),
      all: <T,>(sql: string, params?: readonly SqlParam[]) => this.all<T>(sql, params),
      get: <T,>(sql: string, params?: readonly SqlParam[]) => this.get<T>(sql, params),
    };
  }
}
