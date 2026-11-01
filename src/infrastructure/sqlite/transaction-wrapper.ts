import type { DatabaseConnection, TransactionContext } from './database-connection';
import { DatabaseError } from './database-connection';

/**
 * Transaction wrapper — wraps a `DatabaseConnection` so that a sequence
 * of operations runs in a single SQLite transaction.
 *
 * SQLite (via expo-sqlite) supports nested transactions via savepoints,
 * but for Phase 1 we only support top-level transactions. The
 * `transaction(fn)` method on `DatabaseConnection` is the only entry
 * point.
 *
 * If `fn` throws, the transaction is rolled back and the error is
 * re-thrown (wrapped in `DatabaseError` if it isn't already).
 *
 * If `fn` returns successfully, the transaction is committed.
 *
 * IMPORTANT: SQLite's BEGIN/COMMIT/ROLLBACK is synchronous at the
 * native level, but expo-sqlite exposes them as async. We use the async
 * API throughout.
 */
export async function runInTransaction<T>(
  db: DatabaseConnection,
  fn: (tx: TransactionContext) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction(fn);
  } catch (error) {
    throw wrapSqliteError(error);
  }
}

/**
 * Convert a low-level SQLite error into a `DatabaseError` with a stable
 * code. SQLite error codes we care about:
 *
 *   - SQLITE_CONSTRAINT: uniqueness or CHECK violation
 *   - SQLITE_BUSY: another transaction holds the lock
 *   - SQLITE_FULL: disk full
 *   - SQLITE_CORRUPT: database corruption
 *
 * The full SQLite error code list is at https://www.sqlite.org/rescode.html.
 */
export function wrapSqliteError(error: unknown): DatabaseError {
  if (error instanceof DatabaseError) return error;
  if (error instanceof Error) {
    const message = error.message;
    let code = 'DATABASE_ERROR';
    if (/unique constraint/i.test(message)) code = 'UNIQUE_CONSTRAINT';
    else if (/check constraint/i.test(message)) code = 'CHECK_CONSTRAINT';
    else if (/foreign key constraint/i.test(message)) code = 'FOREIGN_KEY_CONSTRAINT';
    else if (/not null constraint/i.test(message)) code = 'NOT_NULL_CONSTRAINT';
    else if (/database is locked|database disk image is malformed/i.test(message)) code = 'DATABASE_BUSY';
    return new DatabaseError(message, { cause: error, code });
  }
  return new DatabaseError(`Unknown database error: ${String(error)}`, { cause: error });
}
