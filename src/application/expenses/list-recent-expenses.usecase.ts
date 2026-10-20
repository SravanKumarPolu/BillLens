import { asGroupId } from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** One recent-expense card row. */
export interface RecentExpenseEntry {
  readonly expenseId: string;
  readonly title: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly expenseDate: string;
  /** Display name of the FIRST payer (single-payer expenses today). */
  readonly payerName: string;
  readonly payerMemberId: string;
  readonly participantCount: number;
}

export interface ListRecentExpensesOutput {
  readonly groupId: string;
  readonly entries: readonly RecentExpenseEntry[];
  readonly hasMore: boolean;
  /** Cursor for the next page (absent on the last page). */
  readonly nextCursor?: string;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

/**
 * Use case: the group home screen's "Recent expenses" section.
 *
 * Lists the group's newest expenses with the payer's display name and
 * the participant count — the two fields the card shows that the bare
 * `Expense` entity does not carry. Reads the write-side repositories
 * (single source of truth) and resolves names in memory: the member
 * list is small (a group) so a join would buy nothing locally.
 *
 * Pagination follows the repositories' numeric-offset cursor
 * convention; the screen passes no cursor for the first page.
 */
export class ListRecentExpensesForGroupUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly members: GroupMemberRepository,
    private readonly expenses: ExpenseRepository,
  ) {}

  async execute(
    input: ListRecentExpensesInput,
  ): Promise<ListRecentExpensesOutput> {
    const group = await this.groups.findById(asGroupId(input.groupId));
    if (group === null) {
      throw new InvalidEntityError(`Group ${input.groupId} not found`);
    }

    const activeMembers = await this.members.listActiveByGroup(asGroupId(input.groupId));
    const nameById = new Map<string, string>(
      activeMembers.map((m) => [m.id as string, m.displayName]),
    );

    const page = await this.expenses.listByGroup(asGroupId(input.groupId), {
      limit: input.limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    });

    // Enrich each expense with payer name + participant count. Payer and
    // split rows are read per expense — the group home shows at most a
    // handful of cards, and this keeps the query join-free (identical
    // behaviour on the production engine and the test double).
    const entries: RecentExpenseEntry[] = [];
    for (const expense of page.items) {
      const payers = await this.expenses.listPayers(expense.id);
      const splits = await this.expenses.listSplits(expense.id);
      const firstPayer = payers[0];
      entries.push({
        expenseId: expense.id as string,
        title: expense.title,
        amountMinor: expense.amountMinor,
        currencyCode: expense.currencyCode as string,
        expenseDate: expense.expenseDate as string,
        payerName: firstPayer
          ? (nameById.get(firstPayer.memberId as string) ?? 'Unknown member')
          : 'Unknown member',
        payerMemberId: firstPayer ? (firstPayer.memberId as string) : '',
        participantCount: splits.length,
      });
    }

    return {
      groupId: input.groupId,
      entries,
      hasMore: page.hasMore,
      ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
    };
  }
}

export interface ListRecentExpensesInput {
  readonly groupId: string;
  /** Page size (1–200 per the pagination contract). */
  readonly limit: number;
  /** Cursor from the previous call, or undefined for the first page. */
  readonly cursor?: string;
}
