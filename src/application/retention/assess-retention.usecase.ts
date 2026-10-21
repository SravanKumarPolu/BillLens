/**
 * AssessRetentionUseCase — builds the facts the retention UI needs.
 *
 * Reads only local data. It never deletes anything: the output is a list
 * of assessments (`eligible` / `too_recent` / `protected`) that a human
 * reviews.
 *
 * `cloudSyncEnabled` matters for one blocker: when cloud sync is
 * configured, any queued local change could be the only copy of a record,
 * so no group is eligible until the queue drains. When the app runs
 * local-only (no Supabase configured) queued operations never drain by
 * design, so they must not block retention forever.
 */

import type { GetGroupBalancesUseCase } from '@application/balances';
import type { ListPendingConfirmationsUseCase } from '@application/settlements';
import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { SyncRepository } from '@domain/repositories/sync.repository';
import {
  DEFAULT_RETENTION_CONFIG,
  assessRetention,
  type RetentionAssessment,
  type RetentionConfig,
  type RetentionSnapshot,
} from '@domain/retention/retention-policy';
import { nowDateTime } from '@domain/value-objects';

export interface AssessRetentionInput {
  readonly groupIds: readonly string[];
  readonly cloudSyncEnabled: boolean;
  readonly now?: Date;
  readonly config?: RetentionConfig;
}

export interface RetentionRow extends RetentionAssessment {
  readonly lastActivityAt: string;
  readonly hasOutstandingBalance: boolean;
  readonly pendingConfirmations: number;
  readonly pendingLocalChanges: number;
}

export interface AssessRetentionOutput {
  readonly rows: readonly RetentionRow[];
  readonly eligibleCount: number;
  readonly config: RetentionConfig;
}

export class AssessRetentionUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly expenses: ExpenseRepository,
    private readonly settlements: SettlementRepository,
    private readonly balances: GetGroupBalancesUseCase,
    private readonly pendingConfirmations: ListPendingConfirmationsUseCase,
    private readonly sync: SyncRepository,
  ) {}

  async execute(input: AssessRetentionInput): Promise<AssessRetentionOutput> {
    const now = input.now ?? new Date();
    const config = input.config ?? DEFAULT_RETENTION_CONFIG;
    // Global queue depth; see the class comment for why it only applies
    // when cloud sync is configured.
    const queued = input.cloudSyncEnabled ? await this.sync.countPending() : 0;

    const rows: RetentionRow[] = [];
    for (const groupId of input.groupIds) {
      const group = await this.groups.findById(groupId as never);
      if (group === null || group.deletedAt !== undefined) continue;

      const [balanceResult, pending, latestExpense, latestSettlement] = await Promise.all([
        this.balances.execute({ groupId: groupId as never }),
        this.pendingConfirmations.execute({
          groupId: groupId as never,
          pagination: { limit: 50 },
        }),
        this.expenses.listByGroup(groupId as never, { limit: 1 }),
        this.settlements.listByGroup(groupId as never, { limit: 1 }),
      ]);

      const hasOutstandingBalance =
        !balanceResult.notFound &&
        balanceResult.results.some((currency) =>
          currency.memberCurrencyBalances.some((balance) => balance.netBalanceMinor !== 0),
        );

      const activityCandidates: string[] = [
        group.updatedAt,
        ...latestExpense.items.map((expense) => expense.updatedAt),
        ...latestSettlement.items.map((settlement) => settlement.updatedAt),
      ];
      const lastActivityAt = activityCandidates.sort().at(-1) ?? nowDateTime();

      const snapshot: RetentionSnapshot = {
        groupId: group.id,
        groupName: group.name,
        lastActivityAt,
        hasOutstandingBalance,
        pendingConfirmations: pending.items.length,
        pendingLocalChanges: queued,
      };

      rows.push({
        ...assessRetention(snapshot, now, config),
        lastActivityAt,
        hasOutstandingBalance,
        pendingConfirmations: pending.items.length,
        pendingLocalChanges: queued,
      });
    }

    // Most actionable first: eligible, then soonest-to-expire, then protected.
    const rank = { eligible: 0, too_recent: 1, protected: 2 } as const;
    rows.sort((a, b) => {
      if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
      return (a.daysUntilEligible ?? Number.MAX_SAFE_INTEGER) - (b.daysUntilEligible ?? Number.MAX_SAFE_INTEGER);
    });

    return {
      rows,
      eligibleCount: rows.filter((row) => row.state === 'eligible').length,
      config,
    };
  }
}
