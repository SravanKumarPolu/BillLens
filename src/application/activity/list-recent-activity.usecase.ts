import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { GroupId, MemberId } from '@shared-types/index';


// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type ActivityKind = 'expense' | 'settlement';

export interface ActivityEntry {
  /** Stable id built from the kind + the underlying entity id. */
  readonly id: string;
  readonly kind: ActivityKind;
  readonly groupId: GroupId;
  /** ISO date-time of the activity (expense date or settlement date). */
  readonly timestamp: DateTime;
  /** ISO date-time the underlying entity was created (for tie-breakers). */
  readonly createdAt: DateTime;
  /** Human-readable description for the activity feed. */
  readonly description: string;
  /** Optional sub-label, e.g. payer name for an expense. */
  readonly subtitle: string | null;
  /** Currency code of the activity. */
  readonly currencyCode: string;
  /** Amount in minor units (always positive). */
  readonly amountMinor: number;
  /** The member id at the centre of the activity (payer for expenses, sender for settlements). */
  readonly memberId: MemberId | null;
  /** The route to open when the user taps the entry. */
  readonly targetRoute: string;
}

export interface ListRecentActivityInput {
  /**
   * Group ids to enumerate. The activity feed does NOT enumerate groups
   * itself — the caller (the persisted group store hook) supplies the
   * list of groups the device knows about. This keeps the use case pure
   * and avoids depending on a "list all groups" repository method that
   * the contract does not expose.
   */
  readonly groupIds: readonly GroupId[];
  /** Cap the timeline at this many entries (default 20, max 50). */
  readonly limit?: number;
}

export interface ListRecentActivityOutput {
  readonly entries: readonly ActivityEntry[];
  /** True when there are more entries available beyond the returned page. */
  readonly hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

/**
 * Use case: build a unified recent-activity timeline across the supplied
 * set of groups.
 *
 * The activity feed merges expenses and settlements across every group
 * the user belongs to, ordered by `timestamp` DESC (most recent first).
 *
 * The use case reads through the repository contracts — it does not
 * need a "current user" filter because the activity feed is a whole-
 * group timeline, not a per-user one. (Identity-driven filtering lands
 * when the identity adapters do.)
 *
 * Architecture:
 *   - Lives in the application layer (no React, no framework imports).
 *   - Reads through the repository interfaces — no direct SQL.
 *   - The merge is done in memory: each group's expenses + settlements
 *     are loaded separately, then combined and sorted. The list is
 *     bounded by the `limit` (default 20, capped at 50).
 *   - Per-group failure resilience — a single group's load error does
 *     NOT abort the whole timeline; the failing group is skipped.
 */
export class ListRecentActivityUseCase {
  constructor(
    private readonly members: GroupMemberRepository,
    private readonly expenses: ExpenseRepository,
    private readonly settlements: SettlementRepository,
  ) {}

  async execute(input: ListRecentActivityInput): Promise<ListRecentActivityOutput> {
    const limit = Math.max(1, Math.min(50, input.limit ?? 20));
    const entries: ActivityEntry[] = [];

    for (const groupId of input.groupIds) {
      // Resolve the group's members so we can name the payer / sender.
      let activeMembers: Awaited<ReturnType<typeof this.members.listActiveByGroup>> = [];
      try {
        activeMembers = await this.members.listActiveByGroup(groupId);
      } catch {
        // Group missing or inaccessible — skip it; per-group resilience.
        continue;
      }
      const nameById = new Map<string, string>(
        activeMembers.map((m) => [m.id as string, m.displayName]),
      );

      // Recent expenses for this group (first page is enough — the
      // timeline caps at 50 entries total, so 50 per group is plenty).
      try {
        const page = await this.expenses.listByGroup(groupId, { limit: 50 });
        for (const expense of page.items) {
          const payers = await this.expenses.listPayers(expense.id);
          const firstPayer = payers[0];
          const payerName = firstPayer
            ? (nameById.get(firstPayer.memberId as string) ?? 'Unknown member')
            : null;
          entries.push({
            id: `expense:${expense.id as string}`,
            kind: 'expense',
            groupId,
            timestamp: expense.expenseDate,
            createdAt: expense.createdAt,
            description: expense.title,
            subtitle: payerName,
            currencyCode: expense.currencyCode as string,
            amountMinor: expense.amountMinor,
            memberId: firstPayer ? firstPayer.memberId : null,
            targetRoute: `/expenses/${encodeURIComponent(expense.id as string)}`,
          });
        }
      } catch {
        // Per-group resilience — skip the group's expenses without
        // aborting the whole timeline.
      }

      // Recent settlements for this group.
      try {
        const page = await this.settlements.listByGroup(groupId, { limit: 50 });
        for (const settlement of page.items) {
          if (settlement.deletedAt !== undefined) continue;
          const senderName =
            nameById.get(settlement.fromMemberId as string) ?? 'Unknown member';
          const receiverName =
            nameById.get(settlement.toMemberId as string) ?? 'Unknown member';
          entries.push({
            id: `settlement:${settlement.id as string}`,
            kind: 'settlement',
            groupId,
            timestamp: settlement.settlementDate,
            createdAt: settlement.createdAt,
            description: `${senderName} paid ${receiverName}`,
            subtitle: settlement.method.toUpperCase(),
            currencyCode: settlement.currencyCode as string,
            amountMinor: settlement.amountMinor,
            memberId: settlement.fromMemberId,
            targetRoute: `/settlements/preview?fromMemberId=${encodeURIComponent(
              settlement.fromMemberId as string,
            )}&toMemberId=${encodeURIComponent(
              settlement.toMemberId as string,
            )}&amountMinor=${settlement.amountMinor}&currencyCode=${encodeURIComponent(
              settlement.currencyCode as string,
            )}&groupId=${encodeURIComponent(groupId as string)}`,
          });
        }
      } catch {
        // Per-group resilience — skip the group's settlements without
        // aborting the whole timeline.
      }
    }

    // Sort by timestamp DESC, then createdAt DESC for stable tie-breaks.
    entries.sort((a, b) => {
      const tsCmp = a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0;
      if (tsCmp !== 0) return tsCmp;
      const ctCmp = a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
      return ctCmp;
    });

    const hasMore = entries.length > limit;
    return {
      entries: entries.slice(0, limit),
      hasMore,
    };
  }
}
