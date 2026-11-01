/**
 * SqliteUnitOfWork — production `UnitOfWork` over the local SQLite
 * connection (v2.4.0).
 *
 * `execute(callback)` wraps the callback in ONE SQLite transaction. The
 * callback receives a `UnitOfWorkContext` whose repositories are FRESH
 * instances constructed over a transaction-scoped view of the same
 * connection — repository-internal `this.db.transaction(...)` calls
 * become pass-throughs (the outer transaction already demarcates the
 * atomic boundary), so every write the callback performs commits or
 * rolls back together.
 *
 * Repository coverage is HONEST: adapters exist for the financial core
 * (expenses, drafts, settlements, audit, sync). The four context slots
 * whose SQLite adapters do not exist yet (users, invites, receipts,
 * conflicts) are wired to fail-loud proxies — a use case that touches
 * them gets a clear `UNSUPPORTED_REPOSITORY` error instead of silently
 * writing nowhere. Nothing is faked.
 */

import type {
  SyncOperation,
  SyncRepository,
} from '@domain/repositories/sync.repository';
import type { UnitOfWork, UnitOfWorkContext } from '@domain/repositories/unit-of-work';

import { SqliteSyncRepository } from '../sync/sqlite-sync-repository';

import type { DatabaseConnection, TransactionContext } from './database-connection';
import { DatabaseError } from './database-connection';
import { SqliteAuditRepository } from './sqlite-audit-repository';
import { SqliteExpenseDraftRepository } from './sqlite-expense-draft-repository';
import { SqliteExpenseRepository } from './sqlite-expense-repository';
import { SqliteGroupMemberRepository } from './sqlite-group-member-repository';
import { SqliteGroupRepository } from './sqlite-group-repository';
import { SqliteSettlementRepository } from './sqlite-settlement-repository';

/**
 * A `DatabaseConnection` view over an open transaction context. The
 * `transaction()` method executes the callback directly — we are already
 * inside the outer transaction, and repository adapters call it around
 * their write batches.
 */
class TransactionViewConnection implements DatabaseConnection {
  constructor(private readonly tx: TransactionContext) {}

  exec(sql: string): Promise<void> {
    return this.tx.exec(sql);
  }

  run(sql: string, params?: readonly (string | number | boolean | null | Uint8Array)[]) {
    return this.tx.run(sql, params);
  }

  all<T = Record<string, unknown>>(
    sql: string,
    params?: readonly (string | number | boolean | null | Uint8Array)[],
  ): Promise<readonly T[]> {
    return this.tx.all<T>(sql, params);
  }

  get<T = Record<string, unknown>>(
    sql: string,
    params?: readonly (string | number | boolean | null | Uint8Array)[],
  ): Promise<T | null> {
    return this.tx.get<T>(sql, params);
  }

  transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    // Pass-through: the outer transaction already owns the boundary.
    return fn(this.tx);
  }
}

/** Fail-loud proxy for repository slots without a SQLite adapter yet. */
function unsupportedRepository(name: string): never {
  throw new DatabaseError(
    `The ${name} repository has no local SQLite adapter yet — this use ` +
      'case path is not available offline. See docs/architecture-boundaries.md.',
    { code: 'UNSUPPORTED_REPOSITORY' },
  );
}

export class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly db: DatabaseConnection) {}

  async execute<T>(callback: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const conn = new TransactionViewConnection(tx);
      const drafts = new SqliteExpenseDraftRepository(conn);
      const expenses = new SqliteExpenseRepository(conn);
      const settlements = new SqliteSettlementRepository(conn);
      const audit = new SqliteAuditRepository(conn);
      const sync: SyncRepository = new SqliteSyncRepository(conn);

      const ctx: UnitOfWorkContext = {
        get users(): never {
          return unsupportedRepository('users');
        },
        groups: new SqliteGroupRepository(conn),
        members: new SqliteGroupMemberRepository(conn),
        get invites(): never {
          return unsupportedRepository('invites');
        },
        expenses,
        drafts,
        get receipts(): never {
          return unsupportedRepository('receipts');
        },
        settlements,
        audit,
        sync,
        get conflicts(): never {
          return unsupportedRepository('conflicts');
        },
        enqueueSync: (operation: Omit<SyncOperation, 'id' | 'status' | 'retryCount' | 'createdAt'>) =>
          sync.enqueue(operation),
      };
      return callback(ctx);
    });
  }
}
