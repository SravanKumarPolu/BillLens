/**
 * Group detail DTO — application-layer projection from domain entities
 * (Group + Members + Balances + recent Expenses) into a shape the
 * presentation layer's `createGroupDetailViewModel` consumes.
 *
 * The presentation view-model takes a `GroupDetailInput` (raw
 * summary-level data) and adds UI-shaping (empty-state flags, signed-
 * balance direction flags). This DTO is what the application layer
 * produces by mapping domain entities into that input contract.
 *
 * Mapping is PURE — no I/O, no React, no business logic beyond
 * projection. The application use case is responsible for loading the
 * domain entities from repositories and computing balances via the
 * balance engine; this file only reshapes them.
 *
 * Hard rule: this DTO NEVER fabricates financial data. If the source
 * data is empty (no members, no expenses, no transfers), the DTO
 * produced will reflect that — it produces a legitimate empty-state
 * input that the presentation view-model can render.
 */

import type { Expense } from '@domain/entities/expense';
import type { Group } from '@domain/entities/group';
import type { GroupMember } from '@domain/entities/group-member';
import type { MemberBalance } from '@domain/services/balances/balance-engine';
import type { SuggestedTransfer } from '@domain/services/balances/balance-engine';
import type { MemberId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// DTO types — mirror the presentation `GroupDetailInput` shape, but
// redeclared here so the application layer does NOT depend on the
// presentation layer.
// ---------------------------------------------------------------------------

export interface MemberSummaryDTO {
  readonly id: string;
  readonly displayName: string;
  readonly role: 'owner' | 'admin' | 'member';
  /** Negative = this member owes the group; positive = group owes them. */
  readonly balanceMinor: number;
  readonly isCurrentUser: boolean;
}

export interface ExpenseSummaryDTO {
  readonly id: string;
  readonly description: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  /** Pre-formatted date label, e.g. "Mar 14". */
  readonly dateLabel: string;
  readonly payerName: string;
}

export interface SuggestedTransferDTO {
  readonly id: string;
  readonly fromMemberId: string;
  readonly fromMemberName: string;
  readonly toMemberId: string;
  readonly toMemberName: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
}

/** DTO consumed by the presentation `createGroupDetailViewModel`. */
export interface GroupDetailDTO {
  readonly id: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly memberCount: number;
  /** The signed balance for the current user within this group. */
  readonly userBalanceMinor: number;
  readonly recentExpenses: readonly ExpenseSummaryDTO[];
  readonly suggestedTransfers: readonly SuggestedTransferDTO[];
  readonly members: readonly MemberSummaryDTO[];
}

// ---------------------------------------------------------------------------
// Mapping input — what the application use case passes in.
// ---------------------------------------------------------------------------

export interface GroupDetailMappingInput {
  readonly group: Group;
  readonly members: readonly GroupMember[];
  /**
   * Balance engine output for this group. Provides per-member balances
   * and the suggested transfers. May be `null` when the balance engine
   * has not been run yet (Phase 2: stub repositories return null) — the
   * DTO will then have zero balances and no suggested transfers.
   */
  readonly balanceResult: {
    readonly memberBalances: readonly MemberBalance[];
    readonly suggestedTransfers: readonly SuggestedTransfer[];
  } | null;
  /** Recent expenses for this group, most recent first. */
  readonly recentExpenses: readonly Expense[];
  /**
   * Map from expense id → display name of the member who paid. The
   * application layer is responsible for resolving this lookup (it
   * already has the members + payers loaded). Empty string when no
   * payer is known for an expense.
   */
  readonly payerNameByExpenseId: ReadonlyMap<string, string>;
  /** The current user's member id within this group (if known). */
  readonly currentMemberId?: MemberId;
  /**
   * Function that formats an ISO date string into a short display label
   * (e.g. "Mar 14"). Injected so the mapping stays pure and testable.
   */
  readonly formatDateLabel: (isoDate: string) => string;
}

// ---------------------------------------------------------------------------
// Pure mapping function
// ---------------------------------------------------------------------------

/**
 * Map domain entities + balance-engine output into a `GroupDetailDTO`.
 *
 * Pure: no I/O, no React, no side effects. The presentation layer's
 * `createGroupDetailViewModel` consumes the resulting DTO directly.
 *
 *   - Empty `members` → empty `members` array (legitimate empty state).
 *   - `balanceResult` null → all members have balance 0, no transfers.
 *   - Empty `recentExpenses` → empty `recentExpenses` array.
 *   - Unknown payer for an expense → empty `payerName` string (no
 *     fabricated name).
 */
export function mapGroupDetail(input: GroupDetailMappingInput): GroupDetailDTO {
  const balanceByMemberId = new Map<string, number>();
  if (input.balanceResult) {
    for (const mb of input.balanceResult.memberBalances) {
      balanceByMemberId.set(mb.memberId as string, mb.netBalanceMinor);
    }
  }

  const members: MemberSummaryDTO[] = input.members.map((m) => ({
    id: m.id as string,
    displayName: m.displayName as string,
    role: m.role,
    balanceMinor: balanceByMemberId.get(m.id as string) ?? 0,
    isCurrentUser: input.currentMemberId !== undefined && m.id === input.currentMemberId,
  }));

  const recentExpenses: ExpenseSummaryDTO[] = input.recentExpenses.map((e) => ({
    id: e.id as string,
    description: e.title,
    amountMinor: e.amountMinor,
    currencyCode: e.currencyCode as string,
    dateLabel: input.formatDateLabel(e.expenseDate as string),
    payerName: input.payerNameByExpenseId.get(e.id as string) ?? '',
  }));

  const suggestedTransfers: SuggestedTransferDTO[] = input.balanceResult
    ? input.balanceResult.suggestedTransfers.map((t, idx) => ({
        id: `transfer-${idx}`,
        fromMemberId: t.fromMemberId as string,
        fromMemberName: lookupMemberName(input.members, t.fromMemberId),
        toMemberId: t.toMemberId as string,
        toMemberName: lookupMemberName(input.members, t.toMemberId),
        amountMinor: t.amountMinor,
        currencyCode: input.group.currencyCode as string,
      }))
    : [];

  // The current user's signed balance: look up their MemberBalance if
  // known, otherwise default to 0 (settled up / unknown).
  const userBalanceMinor =
    input.currentMemberId !== undefined
      ? (balanceByMemberId.get(input.currentMemberId as string) ?? 0)
      : 0;

  return {
    id: input.group.id as string,
    name: input.group.name,
    currencyCode: input.group.currencyCode as string,
    memberCount: input.members.length,
    userBalanceMinor,
    recentExpenses,
    suggestedTransfers,
    members,
  };
}

/** Build an empty-state DTO for a group with no activity yet. */
export function mapEmptyGroupDetail(input: {
  readonly group: Group;
  readonly memberCount: number;
}): GroupDetailDTO {
  return {
    id: input.group.id as string,
    name: input.group.name,
    currencyCode: input.group.currencyCode as string,
    memberCount: input.memberCount,
    userBalanceMinor: 0,
    recentExpenses: [],
    suggestedTransfers: [],
    members: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lookupMemberName(
  members: readonly GroupMember[],
  memberId: MemberId,
): string {
  const member = members.find((m) => m.id === memberId);
  return member ? (member.displayName as string) : 'Unknown member';
}
