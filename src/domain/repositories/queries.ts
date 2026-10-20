import type { GroupId, MemberId, UserId } from '@shared-types/index';

import type { CurrencyCode } from '../value-objects/currency-code';
import type { DateTime } from '../value-objects/date-time';

/**
 * Query models (read-models) for BillLens.
 *
 * These are SEPARATE from the write-side repositories. Complex screens
 * (group list, expense timeline, balance summary, settlement history)
 * often need joined/aggregated data that doesn't fit the shape of a
 * single domain entity. Rather than distorting entities to fit UI
 * queries, we define dedicated read-models here.
 *
 * The infrastructure layer provides concrete query implementations
 * (SQLite for local, Supabase for cloud). Both must satisfy the same
 * interface.
 */

// ---------------------------------------------------------------------------
// Group Summary Query
// ---------------------------------------------------------------------------

export interface GroupSummary {
  readonly id: GroupId;
  readonly name: string;
  readonly currencyCode: CurrencyCode;
  readonly memberCount: number;
  readonly activeMemberCount: number;
  readonly expenseCount: number;
  readonly totalAmountMinor: number;
  readonly lastActivityAt: DateTime;
  readonly userRole: 'owner' | 'admin' | 'member';
  readonly userBalanceMinor: number;
}

export interface GroupSummaryQuery {
  listForUser(userId: UserId): Promise<readonly GroupSummary[]>;
  findById(groupId: GroupId, userId: UserId): Promise<GroupSummary | null>;
}

// ---------------------------------------------------------------------------
// Expense Timeline Query
// ---------------------------------------------------------------------------

export interface ExpenseTimelineEntry {
  readonly expenseId: string;
  readonly title: string;
  readonly amountMinor: number;
  readonly currencyCode: CurrencyCode;
  readonly expenseDate: DateTime;
  readonly paidByMemberId: MemberId;
  readonly paidByDisplayName: string;
  readonly splitType: string;
  readonly participantCount: number;
  readonly hasReceipt: boolean;
  readonly userShareMinor: number;
}

export interface ExpenseTimelineQuery {
  listByGroup(
    groupId: GroupId,
    userId: UserId,
    pagination: { limit: number; before?: DateTime },
  ): Promise<{
    items: readonly ExpenseTimelineEntry[];
    hasMore: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Balance Summary Query
// ---------------------------------------------------------------------------

export interface BalanceSummaryEntry {
  readonly memberId: MemberId;
  readonly displayName: string;
  readonly paidMinor: number;
  readonly shareMinor: number;
  readonly netBalanceMinor: number;
  readonly isCreditor: boolean;
  readonly isDebtor: boolean;
}

export interface BalanceSummary {
  readonly groupId: GroupId;
  readonly currencyCode: CurrencyCode;
  readonly entries: readonly BalanceSummaryEntry[];
  readonly totalGroupExpensesMinor: number;
  readonly isBalanced: boolean;
}

export interface BalanceSummaryQuery {
  getForGroup(groupId: GroupId): Promise<BalanceSummary>;
}

// ---------------------------------------------------------------------------
// Settlement History Query
// ---------------------------------------------------------------------------

export interface SettlementHistoryEntry {
  readonly settlementId: string;
  readonly fromMemberId: MemberId;
  readonly fromMemberName: string;
  readonly toMemberId: MemberId;
  readonly toMemberName: string;
  readonly amountMinor: number;
  readonly currencyCode: CurrencyCode;
  readonly method: string;
  readonly settlementDate: DateTime;
  readonly note?: string;
}

export interface SettlementHistoryQuery {
  listByGroup(
    groupId: GroupId,
    pagination: { limit: number; before?: DateTime },
  ): Promise<{
    items: readonly SettlementHistoryEntry[];
    hasMore: boolean;
  }>;
}
