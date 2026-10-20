import type { Expense, ExpensePayer, ExpenseSplit } from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { ExpenseId, MemberId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** One payer row on the expense detail screen. */
export interface ExpenseDetailPayerView {
  readonly memberId: string;
  readonly displayName: string;
  readonly amountMinor: number;
  readonly isSinglePayer: boolean;
}

/** One participant share row on the expense detail screen. */
export interface ExpenseDetailShareView {
  readonly memberId: string;
  readonly displayName: string;
  readonly amountMinor: number;
  /** True when this member is also a payer (the share is offset by their contribution). */
  readonly isPayer: boolean;
}

export interface ExpenseDetailView {
  readonly expenseId: string;
  readonly title: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  /** ISO date-time of the expense. */
  readonly expenseDate: string;
  readonly splitType: Expense['splitType'];
  readonly note: string | null;
  readonly category: string | null;
  readonly payers: readonly ExpenseDetailPayerView[];
  readonly shares: readonly ExpenseDetailShareView[];
  /** Sum of all share amounts — invariant: must equal amountMinor. */
  readonly sharesTotalMinor: number;
  /** Sum of all payer amounts — invariant: must equal amountMinor. */
  readonly payersTotalMinor: number;
  /** Participant count (number of distinct members who owe a share). */
  readonly participantCount: number;
}

export interface GetExpenseDetailOutput {
  readonly view: ExpenseDetailView;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

/**
 * Use case: load the full expense-detail view (expense + payers +
 * shares, with member display names resolved).
 *
 * Backs the `/expenses/[expenseId]` screen. Reads through the
 * repository contracts — no direct SQL. Member names are resolved
 * in memory (the member list for a group is small; a join would buy
 * nothing locally).
 *
 * Throws `InvalidEntityError` when the expense does not exist or has
 * been soft-deleted.
 */
export class GetExpenseDetailUseCase {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly members: GroupMemberRepository,
  ) {}

  async execute(input: GetExpenseDetailInput): Promise<GetExpenseDetailOutput> {
    const expense = await this.expenses.findById(input.expenseId);
    if (expense === null) {
      throw new InvalidEntityError(`Expense ${input.expenseId as string} not found`);
    }
    if (expense.deletedAt !== undefined) {
      throw new InvalidEntityError(`Expense ${input.expenseId as string} is deleted`);
    }

    // Resolve member names for the group. The member list is small
    // (a group); a join would buy nothing locally.
    const activeMembers = await this.members.listActiveByGroup(expense.groupId);
    const nameById = new Map<string, string>(
      activeMembers.map((m) => [m.id as string, m.displayName]),
    );

    const [payers, splits] = await Promise.all([
      this.expenses.listPayers(expense.id),
      this.expenses.listSplits(expense.id),
    ]);

    const payerMemberIds = new Set<string>(payers.map((p) => p.memberId as string));

    const payersView: ExpenseDetailPayerView[] = payers.map((p: ExpensePayer) => ({
      memberId: p.memberId as string,
      displayName: nameById.get(p.memberId as string) ?? 'Unknown member',
      amountMinor: p.amountMinor,
      isSinglePayer: payers.length === 1,
    }));

    const sharesView: ExpenseDetailShareView[] = splits
      .filter((s: ExpenseSplit) => s.deletedAt === undefined)
      .map((s: ExpenseSplit) => ({
        memberId: s.memberId as string,
        displayName: nameById.get(s.memberId as string) ?? 'Unknown member',
        amountMinor: s.amountMinor,
        isPayer: payerMemberIds.has(s.memberId as string),
      }));

    const payersTotalMinor = payersView.reduce((sum, p) => sum + p.amountMinor, 0);
    const sharesTotalMinor = sharesView.reduce((sum, s) => sum + s.amountMinor, 0);

    const view: ExpenseDetailView = {
      expenseId: expense.id as string,
      title: expense.title,
      amountMinor: expense.amountMinor,
      currencyCode: expense.currencyCode as string,
      expenseDate: expense.expenseDate as string,
      splitType: expense.splitType,
      note: expense.note ?? null,
      category: expense.category ?? null,
      payers: payersView,
      shares: sharesView,
      sharesTotalMinor,
      payersTotalMinor,
      participantCount: sharesView.length,
    };

    return { view };
  }
}

export interface GetExpenseDetailInput {
  readonly expenseId: ExpenseId;
  /** Optional member id of the current user (pre-identity: undefined). */
  readonly currentMemberId?: MemberId;
}
