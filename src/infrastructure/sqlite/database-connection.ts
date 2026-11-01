/**
 * Database connection abstraction for the SQLite infrastructure layer.
 *
 * Production code uses `expo-sqlite`'s `SQLiteDatabase`. Tests use
 * `InMemoryDatabase` (defined in __tests__/) which satisfies the same
 * interface.
 *
 * The interface is intentionally minimal:
 *   - `exec(sql)` — run a statement that returns no rows (CREATE, INSERT,
 *     UPDATE, DELETE). Returns void.
 *   - `run(sql, params)` — run a statement and get a result summary
 *     (rows affected, last insert id).
 *   - `all<T>(sql, params)` — run a query and get all matching rows.
 *   - `get<T>(sql, params)` — run a query and get the first row (or null).
 *   - `transaction(fn)` — run a callback within a DB transaction. If the
 *     callback throws, the transaction is rolled back.
 *
 * All methods are async because storage is async even when local.
 */

export interface DatabaseResult {
  readonly rowsAffected: number;
  readonly lastInsertRowId?: number | bigint;
}

export type SqlParam = string | number | boolean | null | Uint8Array;
export type SqlRow = Readonly<Record<string, unknown>>;

export interface DatabaseConnection {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlParam[]): Promise<DatabaseResult>;
  all<T = SqlRow>(sql: string, params?: readonly SqlParam[]): Promise<readonly T[]>;
  get<T = SqlRow>(sql: string, params?: readonly SqlParam[]): Promise<T | null>;
  transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

/**
 * Transaction context — same shape as DatabaseConnection but operates
 * within the current transaction. Methods that start a nested
 * transaction are NOT available (use savepoints if needed in a future
 * Phase).
 */
export interface TransactionContext {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlParam[]): Promise<DatabaseResult>;
  all<T = SqlRow>(sql: string, params?: readonly SqlParam[]): Promise<readonly T[]>;
  get<T = SqlRow>(sql: string, params?: readonly SqlParam[]): Promise<T | null>;
}

/**
 * Thrown when a database operation fails. The original error is
 * preserved in `cause`.
 */
export class DatabaseError extends Error {
  readonly code: string;
  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, options);
    this.name = 'DatabaseError';
    this.code = options?.code ?? 'DATABASE_ERROR';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
