/**
 * SQLite-backed `DatabaseConnection` for integration tests.
 *
 * Runs statements through the `sqlite3` CLI against a real database file,
 * so tests exercise actual SQLite parsing, constraints and persistence —
 * unlike `InMemoryDatabase`, which only records statements.
 *
 * Limitations (deliberate, test-only):
 *   - Each call is a separate process, so `transaction()` is a passthrough
 *     without atomicity. Tests here assert behaviour, not rollback.
 *   - Parameters are interpolated with SQL quoting, not bound natively.
 *     Values come from trusted test fixtures.
 *
 * Skipped by callers when the CLI is unavailable (CI images include it).
 */

import { execFileSync } from 'node:child_process';

import type {
  DatabaseConnection,
  DatabaseResult,
  SqlParam,
  TransactionContext,
} from '@infrastructure/sqlite/database-connection';

export function hasSqliteCli(): boolean {
  try {
    execFileSync('sqlite3', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

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

export class SqliteCliDatabase implements DatabaseConnection {
  constructor(readonly databasePath: string) {}

  private read(sql: string): string {
    return execFileSync('sqlite3', ['-bail', '-json', this.databasePath], {
      input: sql,
      stdio: 'pipe',
    }).toString();
  }

  async exec(sql: string): Promise<void> {
    this.read(`${sql.endsWith(';') ? sql : `${sql};`}`);
  }

  async run(sql: string, params: readonly SqlParam[] = []): Promise<DatabaseResult> {
    this.read(`${bind(sql, params)};`);
    return { rowsAffected: 1 };
  }

  async all<T>(sql: string, params: readonly SqlParam[] = []): Promise<readonly T[]> {
    const output = this.read(`${bind(sql, params)};`).trim();
    if (output.length === 0) return [];
    return JSON.parse(output) as T[];
  }

  async get<T>(sql: string, params: readonly SqlParam[] = []): Promise<T | null> {
    const rows = await this.all<T>(sql, params);
    return rows[0] ?? null;
  }

  async transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
