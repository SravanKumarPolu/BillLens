
import type { Expense } from '@domain/entities/expense';
import type { ExpensePayer } from '@domain/entities/expense-payer';
import type { ExpenseSplit } from '@domain/entities/expense-split';
import type { GroupMember } from '@domain/entities/group-member';
import type { Settlement } from '@domain/entities/settlement';
import type { GroupId, MemberId } from '@shared-types/index';

/**
 * Port: load everything the balance engine needs for a group.
 *
 * The balance engine (in `src/domain/services/balances/balance-engine.ts`)
 * is a pure function — it operates on in-memory domain data. The
 * application-layer use cases wrap it; this port is the boundary
 * between the use cases and the storage layer (SQLite locally,
 * Supabase in the cloud).
 *
 * The use cases call `loadGroupBalanceInput(groupId)` to fetch all
 * the data the balance engine needs in one round trip, then pass
 * the result to `calculateGroupBalancesByCurrency`.
 *
 * The concrete implementations live in the infrastructure layer:
 *   - `SqliteBalanceQueryPort` — loads from the local SQLite database
 *   - `SupabaseBalanceQueryPort` — loads from the cloud (when online)
 *
 * Both implementations must satisfy the same interface. The
 * application layer never knows which one is in play.
 *
 * ARCHITECTURE: this port returns the raw domain entities. The
 * use cases are responsible for filtering (e.g. excluding
 * soft-deleted records is done by the balance engine itself, not by
 * the port — the port returns everything and lets the engine decide).
 */
export interface BalanceQueryPort {
  /**
   * Load every active member, expense, payer, split, and settlement
   * for a group, in a single round trip.
   *
   * Returns null if the group does not exist or the caller does not
   * have access to it.
   *
   * The returned data is the complete input for the multi-currency
   * balance engine:
   *
   *   calculateGroupBalancesByCurrency({
   *     groupId,
   *     members: data.members.map(m => m.id),
   *     expenses: data.expenses,
   *     payers: data.payers,
   *     splits: data.splits,
   *     settlements: data.settlements,
   *   })
   */
  loadGroupBalanceInput(
    groupId: GroupId,
  ): Promise<BalanceQueryResult | null>;
}

/**
 * The raw data the balance engine needs for a single group.
 *
 * Returned by `BalanceQueryPort.loadGroupBalanceInput`.
 */
export interface BalanceQueryResult {
  readonly members: readonly GroupMember[];
  readonly expenses: readonly Expense[];
  readonly payers: readonly ExpensePayer[];
  readonly splits: readonly ExpenseSplit[];
  readonly settlements: readonly Settlement[];
}

/**
 * In-memory BalanceQueryPort for tests. Stores the data directly
 * and returns it on demand.
 */
export class InMemoryBalanceQueryPort implements BalanceQueryPort {
  private store = new Map<string, BalanceQueryResult>();

  seed(groupId: GroupId, data: BalanceQueryResult): void {
    this.store.set(groupId as string, data);
  }

  async loadGroupBalanceInput(
    groupId: GroupId,
  ): Promise<BalanceQueryResult | null> {
    return this.store.get(groupId as string) ?? null;
  }
}

/**
 * Convenience helper: extract just the member ids from a
 * BalanceQueryResult.
 *
 * Filters out members who have left the group (their `leftAt` is
 * set). They remain in the database for historical integrity (the
 * balance engine still references them via old expenses and
 * settlements), but they are not part of the active member list.
 */
export function memberIdsOf(data: BalanceQueryResult): readonly MemberId[] {
  return data.members
    .filter((m) => m.leftAt === undefined)
    .map((m) => m.id);
}
