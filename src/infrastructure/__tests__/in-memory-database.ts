import type {
  DatabaseConnection,
  DatabaseResult,
  SqlParam,
  SqlRow,
  TransactionContext,
} from '../sqlite/database-connection';
import { DatabaseError } from '../sqlite/database-connection';

/**
 * In-memory database for testing.
 *
 * Implements the same `DatabaseConnection` interface as the production
 * `expo-sqlite` wrapper, but stores rows in a Map. Supports a subset of
 * SQL sufficient for the SqliteSyncRepository tests:
 *
 *   - `create table` (creates an empty table; column defs are parsed
 *     but only column NAMES are stored — types and constraints ignored)
 *   - `insert into ... values (...)`
 *   - `delete from ... where ...`
 *   - `update ... set ... where ...`
 *   - `select ... from ... where ... order by ... limit ...`
 *
 * Does NOT support: joins, subqueries, aggregates other than count(*),
 * coalesce, glob, complex WHERE clauses (only simple `column = ?` and
 * `column is null`).
 *
 * This is a TEST DOUBLE, not production code. It exists so we can unit-
 * test the SqliteSyncRepository without bringing in expo-sqlite (which
 * requires a React Native runtime).
 */

interface TableSchema {
  readonly name: string;
  readonly columns: readonly string[];
}

interface TableRow {
  [key: string]: SqlParam;
}

export class InMemoryDatabase implements DatabaseConnection {
  private readonly tables = new Map<string, TableSchema>();
  private readonly rows = new Map<string, TableRow[]>();
  private inTransaction = false;
  private transactionSnapshot: {
    tables: Map<string, TableSchema>;
    rows: Map<string, TableRow[]>;
  } | null = null;

  async exec(sql: string): Promise<void> {
    const trimmed = sql.trim().toLowerCase();
    if (trimmed.startsWith('create table')) {
      this.execCreateTable(sql);
    } else if (trimmed.startsWith('create index') || trimmed.startsWith('create unique index')) {
      // No-op for in-memory
    } else if (trimmed.startsWith('alter table')) {
      this.execAlterTable(sql);
    } else if (trimmed.startsWith('drop table')) {
      // v2.5.0: migration 0006 rebuilds sync_operations via create →
      // copy → drop → rename. The double must honour the drop or the
      // old table (with its stale columns) would shadow the new one.
      const dropMatch = sql.match(/drop\s+table\s+(?:if\s+exists\s+)?(\w+)/i);
      if (dropMatch?.[1]) {
        const name = dropMatch[1].toLowerCase();
        this.tables.delete(name);
        this.rows.delete(name);
      }
    } else if (trimmed.startsWith('pragma')) {
      // No-op
    } else if (trimmed.startsWith('insert into')) {
      if (/\bselect\b/i.test(sql)) {
        this.execInsertSelect(sql);
      } else {
        await this.run(sql);
      }
    } else if (trimmed.startsWith('delete from')) {
      await this.run(sql);
    } else if (trimmed.startsWith('update')) {
      await this.run(sql);
    }
    // Silently ignore other statements (the schema migration runner uses
    // semicolon-separated chunks, some of which may be empty).
  }

  async run(sql: string, params: readonly SqlParam[] = []): Promise<DatabaseResult> {
    const trimmed = sql.trim().toLowerCase();
    if (trimmed.startsWith('insert into')) {
      return this.runInsert(sql, params);
    }
    if (trimmed.startsWith('delete from')) {
      return this.runDelete(sql, params);
    }
    if (trimmed.startsWith('update')) {
      return this.runUpdate(sql, params);
    }
    return { rowsAffected: 0 };
  }

  async all<T = SqlRow>(sql: string, params: readonly SqlParam[] = []): Promise<readonly T[]> {
    const rows = this.selectRows(sql, params);
    return rows as unknown as T[];
  }

  async get<T = SqlRow>(sql: string, params: readonly SqlParam[] = []): Promise<T | null> {
    const rows = this.selectRows(sql, params);
    return (rows[0] as unknown as T) ?? null;
  }

  async transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      // Nested transaction — expo-sqlite would use savepoints. For tests,
      // just run inline.
      return fn(this.asTransactionContext());
    }
    // Snapshot state for rollback. Deep-clone each row object so that
    // mutations to live rows during the transaction don't leak into the
    // snapshot (which would defeat rollback for UPDATE statements).
    this.transactionSnapshot = {
      tables: new Map(this.tables),
      rows: new Map(
        Array.from(this.rows.entries()).map(([k, v]) => [
          k,
          v.map((r) => ({ ...r })),
        ]),
      ),
    };
    this.inTransaction = true;
    try {
      const result = await fn(this.asTransactionContext());
      this.inTransaction = false;
      this.transactionSnapshot = null;
      return result;
    } catch (err) {
      // Rollback
      this.inTransaction = false;
      if (this.transactionSnapshot) {
        this.tables.clear();
        for (const [k, v] of this.transactionSnapshot.tables) this.tables.set(k, v);
        this.rows.clear();
        for (const [k, v] of this.transactionSnapshot.rows) this.rows.set(k, [...v]);
      }
      this.transactionSnapshot = null;
      throw err;
    }
  }

  private asTransactionContext(): TransactionContext {
    return {
      exec: (sql: string) => this.exec(sql),
      run: (sql: string, params?: readonly SqlParam[]) => this.run(sql, params ?? []),
      all: <T = SqlRow>(sql: string, params?: readonly SqlParam[]) => this.all<T>(sql, params ?? []),
      get: <T = SqlRow>(sql: string, params?: readonly SqlParam[]) => this.get<T>(sql, params ?? []),
    };
  }

  // -------------------------------------------------------------------------
  // SQL parsing — minimal, only what's needed for sync_operations tests
  // -------------------------------------------------------------------------

  private execCreateTable(sql: string): void {
    const match = sql.match(/create\s+table(?:\s+if\s+not\s+exists)?\s+(\w+)\s*\(([\s\S]*)\)/i);
    if (!match || !match[1] || !match[2]) return;
    const name = match[1];
    const body = match[2];
    const columns: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of body) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      if (char === ',' && depth === 0) {
        columns.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) columns.push(current.trim());
    // Each "column" entry is either "name type ..." or "constraint ...".
    // Extract just the first identifier (the column name) for non-constraint entries.
    const columnNames = columns
      .map((c) => c.split(/\s+/)[0]?.toLowerCase() ?? '')
      .filter(
        (col) =>
          col &&
          !col.startsWith('constraint') &&
          !col.startsWith('primary') &&
          !col.startsWith('foreign') &&
          !col.startsWith('unique') &&
          !col.startsWith('check'),
      );
    this.tables.set(name, { name, columns: columnNames });
    if (!this.rows.has(name)) this.rows.set(name, []);
  }

  /**
   * Minimal `ALTER TABLE` handler.
   *
   * Supports the `add column` form (additive migrations) and the
   * `rename to` form (v2.5.0 — migration 0006 rebuilds sync_operations
   * via create → copy → drop → rename). Column types / CHECK clauses
   * are parsed but discarded — the in-memory DB does not enforce
   * constraints.
   */
  private execAlterTable(sql: string): void {
    const renameMatch = sql.match(/alter\s+table\s+(\w+)\s+rename\s+to\s+(\w+)/i);
    if (renameMatch && renameMatch[1] && renameMatch[2]) {
      const from = renameMatch[1].toLowerCase();
      const to = renameMatch[2].toLowerCase();
      const table = this.tables.get(from);
      if (!table) return; // table doesn't exist — silently ignore
      this.tables.delete(from);
      this.tables.set(to, { ...table, name: to });
      const fromRows = this.rows.get(from) ?? [];
      this.rows.delete(from);
      this.rows.set(to, fromRows);
      return;
    }
    const match = sql.match(/alter\s+table\s+(\w+)\s+add\s+column\s+(\w+)/i);
    if (!match || !match[1] || !match[2]) return;
    const tableName = match[1];
    const columnName = match[2].toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) return; // table doesn't exist — silently ignore
    if (table.columns.includes(columnName)) return; // already added (idempotent)
    this.tables.set(tableName, { ...table, columns: [...table.columns, columnName] });
  }

  /**
   * Narrow `INSERT INTO <t> (cols) SELECT <exprs> FROM <src>` handler
   * (v2.5.0 — used by migration 0006 to copy sync_operations rows into
   * the rebuilt table). Supported select expressions: a bare column
   * name, `coalesce(col_a, col_b)`, and string/number/NULL literals.
   * No WHERE / JOIN support — migrations that need more must teach the
   * double explicitly.
   */
  private execInsertSelect(sql: string): void {
    const match = sql.match(
      /insert\s+into\s+(\w+)\s*\(([^)]*)\)\s*select\s+([\s\S]+?)\s+from\s+(\w+)\s*$/i,
    );
    if (!match || !match[1] || !match[2] || !match[3] || !match[4]) {
      throw new DatabaseError(`In-memory DB: cannot parse insert-select: ${sql}`);
    }
    const target = match[1].toLowerCase();
    const columns = match[2].split(',').map((s) => s.trim().toLowerCase());
    const exprs = splitTopLevel(match[3], ',');
    const source = match[4].toLowerCase();
    if (columns.length !== exprs.length) {
      throw new DatabaseError(
        `In-memory DB: insert-select column/expr count mismatch (${columns.length} vs ${exprs.length})`,
      );
    }
    const sourceRows = this.rows.get(source);
    if (!sourceRows) {
      throw new DatabaseError(`In-memory DB: unknown source table ${source}`);
    }
    const targetRows = this.rows.get(target);
    if (!targetRows) {
      throw new DatabaseError(`In-memory DB: unknown target table ${target}`);
    }
    for (const row of sourceRows) {
      const newRow: TableRow = {};
      columns.forEach((col, i) => {
        const expr = (exprs[i] ?? '').trim();
        newRow[col] = evalSelectExpr(expr, row);
      });
      targetRows.push(newRow);
    }
  }

  /**
   * Test helper: returns true if the given table was created by a
   * previous `create table` statement.
   */
  hasTable(name: string): boolean {
    return this.tables.has(name);
  }

  /**
   * Test helper: returns the list of column names for a table, in
   * the order they were declared (and later altered in). Returns an
   * empty array if the table does not exist.
   */
  listColumns(name: string): readonly string[] {
    return this.tables.get(name)?.columns ?? [];
  }

  private runInsert(sql: string, params: readonly SqlParam[]): DatabaseResult {
    const match = sql.match(/insert\s+into\s+(\w+)\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/i);
    if (!match || !match[1] || !match[2] || !match[3]) {
      throw new DatabaseError(`In-memory DB: cannot parse insert: ${sql}`);
    }
    const tableName = match[1];
    const columns = match[2].split(',').map((s) => s.trim().toLowerCase());
    const valueTokens = match[3].split(',').map((s) => s.trim());
    const tableRows = this.rows.get(tableName);
    if (!tableRows) {
      throw new DatabaseError(`In-memory DB: unknown table ${tableName}`);
    }
    const row: TableRow = {};
    let paramIdx = 0;
    columns.forEach((col, i) => {
      const token = valueTokens[i] ?? '?';
      if (token === '?') {
        const value = params[paramIdx++];
        row[col] = value ?? null;
      } else {
        // Literal value — parse it.
        if (/^-?\d+$/.test(token)) {
          row[col] = parseInt(token, 10);
        } else if (/^-?\d+\.\d+$/.test(token)) {
          row[col] = parseFloat(token);
        } else if (/^'.*'$/.test(token)) {
          row[col] = token.slice(1, -1).replace(/''/g, "'");
        } else if (token.toLowerCase() === 'null') {
          row[col] = null;
        } else if (token.toLowerCase() === 'true') {
          row[col] = true;
        } else if (token.toLowerCase() === 'false') {
          row[col] = false;
        } else {
          // Unknown literal — store as string.
          row[col] = token;
        }
      }
    });
    tableRows.push(row);
    return { rowsAffected: 1, lastInsertRowId: tableRows.length };
  }

  private runDelete(sql: string, params: readonly SqlParam[]): DatabaseResult {
    const match = sql.match(/delete\s+from\s+(\w+)(?:\s+where\s+(.+))?/i);
    if (!match || !match[1]) {
      throw new DatabaseError(`In-memory DB: cannot parse delete: ${sql}`);
    }
    const tableName = match[1];
    const where = match[2];
    const tableRows = this.rows.get(tableName);
    if (!tableRows) return { rowsAffected: 0 };
    if (!where) {
      const count = tableRows.length;
      tableRows.length = 0;
      return { rowsAffected: count };
    }
    const whereLower = where.toLowerCase();
    const before = tableRows.length;
    const kept = tableRows.filter((row) => !this.matchesWhere(row, whereLower, params));
    tableRows.length = 0;
    tableRows.push(...kept);
    return { rowsAffected: before - kept.length };
  }

  private runUpdate(sql: string, params: readonly SqlParam[]): DatabaseResult {
    const match = sql.match(/update\s+(\w+)\s+set\s+([\s\S]+?)(?:\s+where\s+([\s\S]+))?$/i);
    if (!match || !match[1] || !match[2]) {
      throw new DatabaseError(`In-memory DB: cannot parse update: ${sql}`);
    }
    const tableName = match[1];
    const setClause = match[2];
    const where = match[3];
    const tableRows = this.rows.get(tableName);
    if (!tableRows) return { rowsAffected: 0 };

    // Parse SET clause: "col1 = ?, col2 = 'literal', col3 = col3 + 1"
    const assignments: {
      column: string;
      type: 'param' | 'increment' | 'literal';
      paramIndex?: number;
      literal?: SqlParam;
    }[] = [];
    let paramIdx = 0;
    for (const part of setClause.split(',')) {
      // Collapse newlines/whitespace to single spaces so regexes match.
      const trimmed = part.trim().replace(/\s+/g, ' ');
      const assignMatch = trimmed.match(/^(\w+)\s*=\s*\?$/);
      const incMatch = trimmed.match(/^(\w+)\s*=\s*\1\s*\+\s*1$/);
      const literalStrMatch = trimmed.match(/^(\w+)\s*=\s*'(.*)'$/);
      const literalIntMatch = trimmed.match(/^(\w+)\s*=\s*(-?\d+)$/);
      const literalNullMatch = trimmed.match(/^(\w+)\s*=\s*null$/i);
      if (assignMatch && assignMatch[1]) {
        assignments.push({ column: assignMatch[1].toLowerCase(), type: 'param', paramIndex: paramIdx });
        paramIdx++;
      } else if (incMatch && incMatch[1]) {
        assignments.push({ column: incMatch[1].toLowerCase(), type: 'increment' });
      } else if (literalStrMatch && literalStrMatch[1]) {
        assignments.push({
          column: literalStrMatch[1].toLowerCase(),
          type: 'literal',
          literal: literalStrMatch[2] ?? '',
        });
      } else if (literalIntMatch && literalIntMatch[1]) {
        assignments.push({
          column: literalIntMatch[1].toLowerCase(),
          type: 'literal',
          literal: parseInt(literalIntMatch[2] ?? '0', 10),
        });
      } else if (literalNullMatch && literalNullMatch[1]) {
        assignments.push({
          column: literalNullMatch[1].toLowerCase(),
          type: 'literal',
          literal: null,
        });
      }
    }

    const whereLower = where?.toLowerCase();
    const whereParams = params.slice(paramIdx);
    let rowsAffected = 0;
    for (const row of tableRows) {
      if (whereLower && !this.matchesWhere(row, whereLower, whereParams)) continue;
      for (const assignment of assignments) {
        if (assignment.type === 'param') {
          const value = params[assignment.paramIndex ?? 0];
          row[assignment.column] = value ?? null;
        } else if (assignment.type === 'increment') {
          const current = (row[assignment.column] as number) ?? 0;
          row[assignment.column] = current + 1;
        } else if (assignment.type === 'literal') {
          row[assignment.column] = assignment.literal ?? null;
        }
      }
      rowsAffected++;
    }
    return { rowsAffected };
  }

  private selectRows(sql: string, params: readonly SqlParam[]): SqlRow[] {
    const match = sql.match(
      /select\s+([\s\S]+?)\s+from\s+(\w+)(?:\s+where\s+([\s\S]+?))?(?:\s+order\s+by\s+([\s\S]+?))?(?:\s+limit\s+(\?|\d+))?(?:\s+offset\s+(\?|\d+))?$/i,
    );
    if (!match || !match[1] || !match[2]) {
      throw new DatabaseError(`In-memory DB: cannot parse select: ${sql}`);
    }
    const selectClause = match[1];
    const tableName = match[2];
    const where = match[3];
    const orderBy = match[4];
    const limitClause = match[5];
    const offsetClause = match[6];
    // Number of positional `?` placeholders inside the WHERE clause. The
    // limit/offset params (if parameterized) follow them in order.
    const whereParamCount = where ? (where.match(/\?/g) ?? []).length : 0;

    const tableRows = this.rows.get(tableName);
    if (!tableRows) return [];

    let result = [...tableRows];
    if (where) {
      const whereLower = where.toLowerCase();
      result = result.filter((row) => this.matchesWhere(row, whereLower, params));
    }
    if (orderBy) {
      const parts = orderBy.trim().split(/\s+/);
      const col = (parts[0] ?? '').toLowerCase();
      const dir = (parts[1] ?? 'asc').toLowerCase();
      result.sort((a, b) => {
        const av = a[col] ?? null;
        const bv = b[col] ?? null;
        if (av === bv) return 0;
        if (av === null) return dir === 'asc' ? -1 : 1;
        if (bv === null) return dir === 'asc' ? 1 : -1;
        if (dir === 'asc') {
          return av < bv ? -1 : 1;
        }
        return av > bv ? -1 : 1;
      });
    }
    if (offsetClause) {
      let offset: number;
      if (offsetClause === '?') {
        offset = (params[whereParamCount + 1] as number) ?? 0;
      } else {
        offset = parseInt(offsetClause, 10);
      }
      result = result.slice(offset);
    }
    if (limitClause) {
      let limit: number;
      if (limitClause === '?') {
        // The limit param follows the WHERE params (and the offset param,
        // when present, comes after it) in positional order.
        limit = (params[whereParamCount] as number) ?? 0;
      } else {
        limit = parseInt(limitClause, 10);
      }
      result = result.slice(0, limit);
    }

    // Apply SELECT clause
    if (selectClause.trim() === '*') {
      return result;
    }
    const countMatch = selectClause.match(/count\s*\(\s*\*\s*\)\s+as\s+(\w+)/i);
    if (countMatch && countMatch[1]) {
      return [{ [countMatch[1].toLowerCase()]: result.length }];
    }
    // Handle: coalesce(max(column), 0) as alias  OR  coalesce(column, 0) as alias
    const coalesceMatch = selectClause.match(
      /coalesce\s*\(\s*(?:max\s*\(\s*(\w+)\s*\)|(\w+))\s*,\s*0\s*\)\s+as\s+(\w+)/i,
    );
    if (coalesceMatch && (coalesceMatch[1] || coalesceMatch[2]) && coalesceMatch[3]) {
      const col = (coalesceMatch[1] ?? coalesceMatch[2] ?? '').toLowerCase();
      const alias = coalesceMatch[3].toLowerCase();
      if (result.length === 0) return [{ [alias]: 0 }];
      const values = result.map((r) => (r[col] as number) ?? 0);
      const max = Math.max(...values);
      return [{ [alias]: max }];
    }
    const cols = selectClause.split(',').map((s) => s.trim().toLowerCase());
    return result.map((row) => {
      const out: Record<string, unknown> = {};
      for (const c of cols) {
        out[c] = row[c] ?? null;
      }
      return out as SqlRow;
    });
  }

  private matchesWhere(row: TableRow, where: string, params: readonly SqlParam[]): boolean {
    const clauses = where.split(/\s+and\s+/i);
    let paramIdx = 0;
    for (const clause of clauses) {
      const trimmed = clause.trim();
      // substr(column, 1, ?) = ? — EXACT prefix match (feedback NPS user
      // linkage). Params arrive in order: [prefixLength, prefix]. Never
      // LIKE — no wildcard semantics, matching production SQLite exactly.
      const substrMatch = trimmed.match(/^substr\(\s*(\w+)\s*,\s*1\s*,\s*\?\s*\)\s*=\s*\?$/i);
      if (substrMatch && substrMatch[1]) {
        const col = substrMatch[1].toLowerCase();
        const prefixLength = Number(params[paramIdx++]);
        const prefix = String(params[paramIdx++] ?? '');
        const value = row[col] === null || row[col] === undefined ? '' : String(row[col]);
        if (value.substring(0, prefixLength) !== prefix) return false;
        continue;
      }
      const eqMatch = trimmed.match(/^(\w+)\s*=\s*\?$/);
      if (eqMatch && eqMatch[1]) {
        const col = eqMatch[1].toLowerCase();
        const expected = params[paramIdx++];
        if ((row[col] as unknown) !== (expected as unknown)) return false;
        continue;
      }
      // column = 'literal' or column = number
      const eqLiteralMatch = trimmed.match(/^(\w+)\s*=\s*'(.*)'$/);
      if (eqLiteralMatch && eqLiteralMatch[1]) {
        const col = eqLiteralMatch[1].toLowerCase();
        if (String(row[col]) !== (eqLiteralMatch[2] ?? '')) return false;
        continue;
      }
      const eqIntMatch = trimmed.match(/^(\w+)\s*=\s*(-?\d+)$/);
      if (eqIntMatch && eqIntMatch[1]) {
        const col = eqIntMatch[1].toLowerCase();
        if (Number(row[col]) !== parseInt(eqIntMatch[2] ?? '0', 10)) return false;
        continue;
      }
      const isNullMatch = trimmed.match(/^(\w+)\s+is\s+null$/i);
      if (isNullMatch && isNullMatch[1]) {
        const col = isNullMatch[1].toLowerCase();
        if (row[col] !== null && row[col] !== undefined) return false;
        continue;
      }
      const isNotNullMatch = trimmed.match(/^(\w+)\s+is\s+not\s+null$/i);
      if (isNotNullMatch && isNotNullMatch[1]) {
        const col = isNotNullMatch[1].toLowerCase();
        if (row[col] === null || row[col] === undefined) return false;
        continue;
      }
      const inMatch = trimmed.match(/^(\w+)\s+in\s+\(([^)]+)\)$/i);
      if (inMatch && inMatch[1] && inMatch[2]) {
        const col = inMatch[1].toLowerCase();
        const rawValues = inMatch[2].split(',').map((v) => v.trim());
        // Parameterized list: `in (?, ?, ?)` — consume that many params.
        if (rawValues.length > 0 && rawValues.every((v) => v === '?')) {
          const values = params
            .slice(paramIdx, paramIdx + rawValues.length)
            .map((v) => String(v));
          paramIdx += rawValues.length;
          if (!values.includes(String(row[col]))) return false;
          continue;
        }
        const values = rawValues.map((v) => v.replace(/^'|'$/g, ''));
        if (!values.includes(String(row[col]))) return false;
        continue;
      }
      // column > ? — strictly greater than a parameter (e.g. updated_at > ?
      // for incremental-download queries). ISO date strings compare
      // lexicographically, exactly like the production SQLite engine.
      const gtMatch = trimmed.match(/^(\w+)\s*>\s*\?$/);
      if (gtMatch && gtMatch[1]) {
        const col = gtMatch[1].toLowerCase();
        const expected = params[paramIdx++] as string;
        if (row[col] === null || (row[col] as string) <= expected) return false;
        continue;
      }
      const neqMatch = trimmed.match(/^(\w+)\s*<>\s*\?$/);
      if (neqMatch && neqMatch[1]) {
        const col = neqMatch[1].toLowerCase();
        const expected = params[paramIdx++];
        if ((row[col] as unknown) === (expected as unknown)) return false;
        continue;
      }
      const lteMatch = trimmed.match(/^(\w+)\s*<=\s*\?$/);
      if (lteMatch && lteMatch[1]) {
        const col = lteMatch[1].toLowerCase();
        const expected = params[paramIdx++] as string;
        if (row[col] === null || (row[col] as string) > expected) return false;
        continue;
      }
      const ltMatch = trimmed.match(/^(\w+)\s*<\s*\?$/);
      if (ltMatch && ltMatch[1]) {
        const col = ltMatch[1].toLowerCase();
        const expected = params[paramIdx++] as string;
        if (row[col] === null || (row[col] as string) >= expected) return false;
        continue;
      }
      // column < number  (e.g. retry_count < 8)
      const ltIntMatch = trimmed.match(/^(\w+)\s*<\s*(-?\d+)$/);
      if (ltIntMatch && ltIntMatch[1]) {
        const col = ltIntMatch[1].toLowerCase();
        const expected = parseInt(ltIntMatch[2] ?? '0', 10);
        if (row[col] === null || Number(row[col]) >= expected) return false;
        continue;
      }
      // column >= number  (e.g. retry_count >= 8)
      const gteIntMatch = trimmed.match(/^(\w+)\s*>=\s*(-?\d+)$/);
      if (gteIntMatch && gteIntMatch[1]) {
        const col = gteIntMatch[1].toLowerCase();
        const expected = parseInt(gteIntMatch[2] ?? '0', 10);
        if (row[col] === null || Number(row[col]) < expected) return false;
        continue;
      }
      // column >= ?  (v2.5.0 — retry_count >= MAX_SYNC_RETRIES as a param)
      const gteParamMatch = trimmed.match(/^(\w+)\s*>=\s*\?$/);
      if (gteParamMatch && gteParamMatch[1]) {
        const col = gteParamMatch[1].toLowerCase();
        const expected = params[paramIdx++] as string;
        if (row[col] === null || Number(row[col]) < Number(expected)) return false;
        continue;
      }
      // column in (?, ?, ...) — used for `status in ('pending', 'syncing', 'failed')`
      // Already handled by the `in` clause above for string literals.
      //
      // FIDELITY GUARD: an unrecognised clause THROWS instead of silently
      // passing. Before this guard, unsupported predicates were ignored
      // (fail-open), which let queries that the double cannot evaluate
      // produce false-positive test results — a gap that once let one
      // user's row match another user's prefix query. Fail-loud forces new
      // SQL patterns to be taught to the double explicitly.
      throw new DatabaseError(
        `In-memory DB: unsupported WHERE clause: "${trimmed}" — teach matchesWhere() this pattern`,
      );
    }
    return true;
  }
}

/**
 * Split a SQL expression list on a delimiter, ignoring delimiters that
 * appear inside parentheses (so `coalesce(a, b), c` splits into two).
 */
function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of input) {
    if (char === '(') depth++;
    else if (char === ')') depth--;
    if (char === delimiter && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim());
}

/**
 * Evaluate a narrow INSERT...SELECT expression against a source row:
 * `column`, `coalesce(a, b)`, or a literal.
 */
function evalSelectExpr(expr: string, row: TableRow): SqlParam {
  const coalesceMatch = expr.match(/^coalesce\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)$/i);
  if (coalesceMatch && coalesceMatch[1] && coalesceMatch[2]) {
    const a = row[coalesceMatch[1].toLowerCase()];
    if (a !== null && a !== undefined) return a;
    return row[coalesceMatch[2].toLowerCase()] ?? null;
  }
  const literalStr = expr.match(/^'(.*)'$/);
  if (literalStr) return literalStr[1]?.replace(/''/g, "'") ?? null;
  if (/^-?\d+$/.test(expr)) return parseInt(expr, 10);
  if (/^-?\d+\.\d+$/.test(expr)) return parseFloat(expr);
  if (/^null$/i.test(expr)) return null;
  const col = row[expr.toLowerCase()];
  if (col === undefined) {
    // A column never assigned on this row is NULL in real SQLite — the
    // double only materializes explicitly-set keys. Return null rather
    // than throwing so nullable columns copy losslessly.
    return null;
  }
  return col;
}
