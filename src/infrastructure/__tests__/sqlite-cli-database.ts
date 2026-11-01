/**
 * SQLite-backed `DatabaseConnection` for integration tests.
 *
 * Primary engine: Node's built-in `node:sqlite` module (`DatabaseSync`) —
 * a real SQLite engine with native parameter binding and real
 * BEGIN/COMMIT/ROLLBACK transactions, matching the production
 * `ExpoSqliteDatabase` semantics (including `PRAGMA foreign_keys = ON`).
 *
 * Fallback engine: the `sqlite3` CLI binary (used when `node:sqlite` is
 * unavailable, i.e. Node < 22.5). CLI mode has the historical
 * limitations: one process per statement, interpolated parameters and a
 * passthrough `transaction()` without atomicity.
 *
 * The historical exported names (`SqliteCliDatabase`, `hasSqliteCli`) are
 * retained so existing suites keep importing this module unchanged; they
 * now mean "a real SQLite engine is available".
 */

import { execFileSync } from 'node:child_process';

import type {
  DatabaseConnection,
  DatabaseResult,
  SqlParam,
  TransactionContext,
} from '@infrastructure/sqlite/database-connection';

interface SyncStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

interface SyncDatabase {
  exec(sql: string): void;
  prepare(sql: string): SyncStatement;
  close(): void;
  isOpen?: boolean;
}

type NodeSqliteModule = { DatabaseSync: new (path: string) => SyncDatabase };

/**
 * Load `node:sqlite` defensively. Returns null on Node versions where the
 * module does not exist (or is disabled) so callers can fall back to the
 * CLI engine instead of failing at import time.
 */
function loadNodeSqlite(): NodeSqliteModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node:sqlite') as NodeSqliteModule;
  } catch {
    return null;
  }
}

const nodeSqlite = loadNodeSqlite();

function hasSqliteCliBinary(): boolean {
  try {
    execFileSync('sqlite3', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Whether the CLI fallback engine is available (used when node:sqlite is missing). */
export const usesCliFallback = nodeSqlite === null && hasSqliteCliBinary();

/**
 * True when a real SQLite engine is available for integration tests —
 * either Node's built-in `node:sqlite` (preferred) or the `sqlite3` CLI
 * (fallback). Historical name retained; see the module doc comment.
 */
export function hasSqliteCli(): boolean {
  return nodeSqlite !== null || hasSqliteCliBinary();
}

// ---------------------------------------------------------------------------
// CLI fallback helpers (parameter interpolation, trusted test fixtures only)
// ---------------------------------------------------------------------------

function quote(value: SqlParam): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString('hex')}'`;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function bind(sql: string, params: readonly SqlParam[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    if (index >= params.length) throw new Error('Missing SQL parameter for ?');
    const value = params[index];
    index += 1;
    return quote(value as SqlParam);
  });
}

/** Convert a `SqlParam` to a `node:sqlite`-bindable value. */
function toBindParam(value: SqlParam): string | number | bigint | Uint8Array | null {
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function toRows<T>(rows: unknown[]): readonly T[] {
  return rows as T[];
}

/**
 * Real-SQLite `DatabaseConnection` for integration tests.
 *
 * `node:sqlite` engine: one persistent connection, native bound
 * parameters, real transactions (BEGIN/COMMIT/ROLLBACK; nested calls
 * pass through, mirroring `SqliteUnitOfWork`), and
 * `PRAGMA foreign_keys = ON` exactly like the production driver.
 *
 * `sqlite3` CLI engine: historical behaviour (process per statement,
 * passthrough transactions, FK enforcement off).
 */
export class SqliteCliDatabase implements DatabaseConnection {
  private readonly db: SyncDatabase | null;
  /** CLI engine only: the database file path. */
  private readonly databasePath: string;
  /** node:sqlite engine only: active transaction depth. */
  private txDepth = 0;

  constructor(databasePath: string) {
    this.databasePath = databasePath;
    this.db = nodeSqlite ? new nodeSqlite.DatabaseSync(databasePath) : null;
    if (this.db) {
      // Match the production driver: the local schema relies on
      // ON DELETE CASCADE and CHECK constraints being enforced.
      this.db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  /** Close the underlying connection (node:sqlite engine only). */
  close(): void {
    if (this.db) {
      this.db.close();
    }
  }

  private engineExec(sql: string): void {
    if (this.db) {
      this.db.exec(sql);
      return;
    }
    execFileSync('sqlite3', ['-bail', this.databasePath], {
      input: sql,
      stdio: 'pipe',
    });
  }

  private engineQuery<T>(sql: string, params: readonly SqlParam[]): readonly T[] {
    if (this.db) {
      return toRows<T>(this.db.prepare(sql).all(...params.map(toBindParam)));
    }
    const output = execFileSync('sqlite3', ['-bail', '-json', this.databasePath], {
      input: `${bind(sql, params)};`,
      stdio: 'pipe',
    })
      .toString()
      .trim();
    if (output.length === 0) return [];
    return JSON.parse(output) as T[];
  }

  async exec(sql: string): Promise<void> {
    this.engineExec(`${sql.endsWith(';') ? sql : `${sql};`}`);
  }

  async run(sql: string, params: readonly SqlParam[] = []): Promise<DatabaseResult> {
    if (this.db) {
      const result = this.db.prepare(sql).run(...params.map(toBindParam));
      return {
        rowsAffected: Number(result.changes),
        lastInsertRowId:
          typeof result.lastInsertRowid === 'bigint'
            ? result.lastInsertRowid
            : Number(result.lastInsertRowid),
      };
    }
    this.engineExec(`${bind(sql, params)};`);
    return { rowsAffected: 1 };
  }

  async all<T>(sql: string, params: readonly SqlParam[] = []): Promise<readonly T[]> {
    return this.engineQuery<T>(sql, params);
  }

  async get<T>(sql: string, params: readonly SqlParam[] = []): Promise<T | null> {
    if (this.db) {
      const row = this.db.prepare(sql).get(...params.map(toBindParam));
      return (row as T | undefined) ?? null;
    }
    const rows = await this.all<T>(sql, params);
    return rows[0] ?? null;
  }

  async transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    if (!this.db || this.txDepth > 0) {
      // CLI engine (historical passthrough) or nested call inside an
      // already-open transaction — execute directly, like the
      // unit-of-work's inner-context behaviour.
      return fn(this);
    }
    this.db.exec('BEGIN;');
    this.txDepth += 1;
    try {
      const result = await fn(this);
      this.db.exec('COMMIT;');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // Connection already broken; surface the original error.
      }
      throw error;
    } finally {
      this.txDepth -= 1;
    }
  }
}
