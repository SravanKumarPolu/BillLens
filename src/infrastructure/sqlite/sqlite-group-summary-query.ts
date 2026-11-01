/**
 * SqliteGroupSummaryQuery — SQLite implementation of the domain
 * `GroupSummaryQuery` read model (see `src/domain/repositories/queries.ts`).
 *
 * This is the SINGLE SOURCE OF TRUTH behind the Groups tab and the Home
 * dashboard's recent-groups list. The persisted zustand `group-store` is
 * only a write-through UI cache hydrated from this query — it must never
 * be the only place a group exists, or groups that arrive outside the
 * create-group screen (backup restore, sync download, a future join
 * flow) would be invisible in the UI while their financial rows sit in
 * SQLite (the v2.26.x "restore shows an empty app" bug).
 *
 * What it computes per group the local user belongs to:
 *   - name, currency, archived flag, my role (from MY membership row);
 *   - active member count + total member count;
 *   - active expense count + total of active expenses in the GROUP's
 *     currency;
 *   - last activity timestamp = max(groups.updated_at, latest active
 *     expense/settlement/member updated_at);
 *   - MY net balance in the group's currency, using the SAME contract
 *     as the domain balance engine (`calculateGroupBalancesByCurrency`):
 *       net = paid − share − settlementsReceived + settlementsSent,
 *     where only `completed`/`reversed` settlements move balances and
 *     soft-deleted rows never count. The repository test cross-checks
 *     this SQL against the engine on the same seeded data.
 *   - per-group queued (pending/syncing) and failed/conflicting sync
 *     operations, resolved through the entity tables because
 *     `sync_operations` intentionally stores no group_id.
 *
 * Portability note: this adapter uses SQL JOINs, scalar subqueries and
 * UNION ALL, so it requires a real SQLite engine (production
 * `ExpoSqliteDatabase`, tests on `node:sqlite`). It is never exercised
 * against the in-memory test double (which supports none of those).
 */

import type {
  GroupSummary,
  GroupSummaryQuery,
} from '@domain/repositories/queries';
import type { CurrencyCode } from '@domain/value-objects/currency-code';
import type { GroupId, UserId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from './database-connection';

/**
 * One summary row per group the user actively belongs to, newest
 * activity first. All aggregate columns are computed by SQLite.
 */
const SUMMARY_SQL = `
select
  g.id                      as id,
  g.name                    as name,
  g.currency_code           as currency_code,
  g.archived_at             as archived_at,
  g.created_at              as created_at,
  g.updated_at              as updated_at,
  m.role                    as user_role,
  (select count(*) from group_members gm
     where gm.group_id = g.id) as member_count,
  (select count(*) from group_members gm
     where gm.group_id = g.id and gm.left_at is null) as active_member_count,
  (select count(*) from expenses e
     where e.group_id = g.id and e.deleted_at is null) as expense_count,
  (select ifnull(sum(e.amount_minor), 0) from expenses e
     where e.group_id = g.id and e.deleted_at is null
       and e.currency_code = g.currency_code) as total_amount_minor,
  max(
    g.updated_at,
    ifnull((select max(e.updated_at) from expenses e
      where e.group_id = g.id and e.deleted_at is null), g.updated_at),
    ifnull((select max(s.updated_at) from settlements s
      where s.group_id = g.id and s.deleted_at is null), g.updated_at),
    ifnull((select max(gm.updated_at) from group_members gm
      where gm.group_id = g.id and gm.left_at is null), g.updated_at)
  ) as last_activity_at,
  (
    -- net = paid − share − received + sent, group currency only.
    ifnull((select sum(ep.amount_minor) from expense_payers ep
      join expenses e on e.id = ep.expense_id
      where ep.member_id = m.id and ep.deleted_at is null
        and e.deleted_at is null and e.group_id = g.id
        and e.currency_code = g.currency_code), 0)
    - ifnull((select sum(es.amount_minor) from expense_splits es
      join expenses e on e.id = es.expense_id
      where es.member_id = m.id and es.deleted_at is null
        and e.deleted_at is null and e.group_id = g.id
        and e.currency_code = g.currency_code), 0)
    + ifnull((select sum(s.amount_minor) from settlements s
      where s.from_member_id = m.id and s.deleted_at is null
        and s.status in ('completed', 'reversed')
        and s.group_id = g.id and s.currency_code = g.currency_code), 0)
    - ifnull((select sum(s.amount_minor) from settlements s
      where s.to_member_id = m.id and s.deleted_at is null
        and s.status in ('completed', 'reversed')
        and s.group_id = g.id and s.currency_code = g.currency_code), 0)
  ) as user_balance_minor
from groups g
join group_members m
  on m.group_id = g.id and m.user_id = ? and m.left_at is null
where g.deleted_at is null
order by last_activity_at desc, g.id asc
`;

/**
 * Per-group sync-queue counters. `sync_operations` deliberately stores
 * no group_id, so each operation is resolved to its group through the
 * owning entity table (every entity type the queue's CHECK constraint
 * allows). Completed operations are irrelevant to the badge and are
 * excluded before the join.
 */
const SYNC_OP_COUNTS_SQL = `
select og.group_id as group_id,
       sum(case when o.status in ('pending', 'syncing') then 1 else 0 end) as pending_ops,
       sum(case when o.status in ('failed', 'conflict') then 1 else 0 end) as failed_ops
from sync_operations o
join (
  select 'group' as entity_type, id as entity_id, id as group_id from groups
  union all
  select 'group_member', id, group_id from group_members
  union all
  select 'group_invite', id, group_id from group_invites
  union all
  select 'expense', id, group_id from expenses
  union all
  select 'expense_payer', ep.id, e.group_id
    from expense_payers ep join expenses e on e.id = ep.expense_id
  union all
  select 'expense_split', es.id, e.group_id
    from expense_splits es join expenses e on e.id = es.expense_id
  union all
  select 'receipt', id, group_id from receipts
  union all
  select 'receipt_item', ri.id, r.group_id
    from receipt_items ri join receipts r on r.id = ri.receipt_id
  union all
  select 'settlement', id, group_id from settlements
) og on og.entity_type = o.entity_type and og.entity_id = o.entity_id
where o.status <> 'completed'
group by og.group_id
`;

export class SqliteGroupSummaryQuery implements GroupSummaryQuery {
  constructor(private readonly db: DatabaseConnection) {}

  async listForUser(userId: UserId): Promise<readonly GroupSummary[]> {
    const [summaryRows, syncRows] = await Promise.all([
      this.db.all<SqlRow>(SUMMARY_SQL, [userId as string]),
      this.db.all<SqlRow>(SYNC_OP_COUNTS_SQL, []),
    ]);
    const syncCounts = this.indexSyncCounts(syncRows);
    return summaryRows.map((row) => this.mapRow(row, syncCounts));
  }

  async findById(
    groupId: GroupId,
    userId: UserId,
  ): Promise<GroupSummary | null> {
    // The summary query is cheap (aggregates over one user's groups) and
    // keeps a single SQL definition; filter in memory instead of
    // duplicating the statement with an extra predicate.
    const summaries = await this.listForUser(userId);
    return summaries.find((s) => (s.id as string) === (groupId as string)) ?? null;
  }

  private indexSyncCounts(
    rows: readonly SqlRow[],
  ): Map<string, { pending: number; failed: number }> {
    const map = new Map<string, { pending: number; failed: number }>();
    for (const row of rows) {
      map.set(row['group_id'] as string, {
        pending: Number(row['pending_ops'] ?? 0),
        failed: Number(row['failed_ops'] ?? 0),
      });
    }
    return map;
  }

  private mapRow(
    row: SqlRow,
    syncCounts: Map<string, { pending: number; failed: number }>,
  ): GroupSummary {
    const id = row['id'] as string;
    const counts = syncCounts.get(id);
    return {
      id: id as GroupId,
      name: row['name'] as string,
      currencyCode: row['currency_code'] as CurrencyCode,
      memberCount: Number(row['member_count'] ?? 0),
      activeMemberCount: Number(row['active_member_count'] ?? 0),
      expenseCount: Number(row['expense_count'] ?? 0),
      totalAmountMinor: Number(row['total_amount_minor'] ?? 0),
      lastActivityAt: (row['last_activity_at'] ?? row['updated_at']) as never,
      userRole: row['user_role'] as 'owner' | 'admin' | 'member',
      userBalanceMinor: Number(row['user_balance_minor'] ?? 0),
      archived: row['archived_at'] !== null && row['archived_at'] !== undefined,
      updatedAt: row['updated_at'] as never,
      createdAt: (row['created_at'] ?? row['updated_at']) as never,
      pendingSyncOps: counts?.pending ?? 0,
      failedSyncOps: counts?.failed ?? 0,
    };
  }
}
