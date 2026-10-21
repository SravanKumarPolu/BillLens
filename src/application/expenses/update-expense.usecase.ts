/**
 * UpdateExpenseUseCase — edit an existing expense atomically.
 *
 * Creates and edits share the same allocation module and validations, so a
 * member's share cannot drift between create and edit. The repository's
 * `save` replaces the expense, all payers and all splits in one
 * transaction, and bumps the version via the domain `updateExpense`.
 *
 * Safety rules:
 *   - the expense must exist, belong to the group and not be deleted;
 *   - `expectedVersion` must match (concurrent edits fail, never overwrite);
 *   - payers/participants must be active members and totals must reconcile;
 *   - settlements are separate records: editing an expense recalculates
 *     balances but never rewrites or duplicates settlement history.
 */

import {
  asExpensePayerId,
  asExpenseSplitId,
  asGroupId,
  asMemberId,
  createExpensePayer,
  createExpenseSplit,
  updateExpense,
  validateExpenseAggregate,
} from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import { Money } from '@domain/value-objects';
import type { DateTime } from '@domain/value-objects';

import type { ManualSplitInput } from './manual-expense-split';
import { resolveManualSplit } from './manual-expense-split';
import { normalizeExpenseDate } from './create-expense-manually.usecase';

export interface UpdateExpenseInput {
  readonly expenseId: string;
  readonly title: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly expenseDate?: string;
  readonly note?: string;
  readonly category?: string;
  readonly payerContributions: readonly { readonly memberId: string; readonly amountMinor: number }[];
  readonly participantIds: readonly string[];
  readonly split?: ManualSplitInput;
  readonly expectedVersion: number;
  readonly actorUserId: string;
  readonly now?: DateTime;
}

export interface UpdateExpenseOutput {
  readonly expenseId: string;
  readonly version: number;
  readonly splits: readonly { readonly memberId: string; readonly amountMinor: number }[];
}

export class UpdateExpenseUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly members: GroupMemberRepository,
    private readonly expenses: ExpenseRepository,
    private readonly audit: AuditRepository,
    private readonly generateId: () => string,
  ) {}

  async execute(input: UpdateExpenseInput): Promise<UpdateExpenseOutput> {
    const current = await this.expenses.findById(input.expenseId as never);
    if (current === null) {
      throw new InvalidEntityError(`Expense ${input.expenseId} not found`);
    }
    if (current.deletedAt !== undefined) {
      throw new InvalidEntityError('A voided expense cannot be edited.');
    }
    if (current.currencyCode !== input.currencyCode) {
      throw new InvalidEntityError(
        'The currency of an existing expense cannot be changed. Create a new expense instead.',
      );
    }

    const group = await this.groups.findById(asGroupId(current.groupId as string));
    if (group === null || group.deletedAt !== undefined) {
      throw new InvalidEntityError(`Group ${current.groupId as string} not found`);
    }

    const activeMembers = await this.members.listActiveByGroup(
      asGroupId(current.groupId as string),
    );
    const activeIds = new Set(activeMembers.map((member) => member.id as string));

    if (input.payerContributions.length === 0) {
      throw new InvalidEntityError('At least one payer contribution is required');
    }
    for (const payer of input.payerContributions) {
      if (!activeIds.has(payer.memberId)) {
        throw new InvalidEntityError(`Payer ${payer.memberId} is not an active member`);
      }
      if (!Number.isInteger(payer.amountMinor) || payer.amountMinor < 0) {
        throw new InvalidEntityError('Payer contributions must be non-negative integers');
      }
    }
    const payerTotal = input.payerContributions.reduce((sum, p) => sum + p.amountMinor, 0);
    if (payerTotal !== input.amountMinor) {
      throw new InvalidEntityError(
        `Payer contributions total ${payerTotal} but the expense total is ${input.amountMinor}.`,
      );
    }

    if (input.participantIds.length === 0) {
      throw new InvalidEntityError('At least one participant is required');
    }
    const seen = new Set<string>();
    for (const participantId of input.participantIds) {
      if (!activeIds.has(participantId)) {
        throw new InvalidEntityError(`Participant ${participantId} is not an active member`);
      }
      if (seen.has(participantId)) {
        throw new InvalidEntityError(`Duplicate participant: ${participantId}`);
      }
      seen.add(participantId);
    }

    const total = Money.fromMinor(input.amountMinor, input.currencyCode);
    const splitType = input.split?.splitType ?? 'equal';
    const splitResult = resolveManualSplit(
      {
        participantIds: input.participantIds,
        currencyCode: input.currencyCode,
        ...(input.split !== undefined ? { split: input.split } : {}),
      },
      total,
    );

    const now = input.now ?? (new Date().toISOString() as DateTime);
    const updated = updateExpense(current, {
      title: input.title,
      amountMinor: input.amountMinor,
      ...(input.expenseDate !== undefined
        ? { expenseDate: normalizeExpenseDate(input.expenseDate, now) }
        : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      splitType,
      expectedVersion: input.expectedVersion as never,
      now,
    });

    const payers = input.payerContributions.map((payer) =>
      createExpensePayer({
        id: asExpensePayerId(this.generateId()),
        expenseId: updated.id,
        memberId: asMemberId(payer.memberId),
        amountMinor: payer.amountMinor,
        now,
      }),
    );

    const percentageByMember = new Map<string, number>();
    const unitsByMember = new Map<string, number>();
    if (input.split?.splitType === 'percentage') {
      for (const allocation of input.split.allocations) {
        percentageByMember.set(allocation.memberId, allocation.basisPoints);
      }
    }
    if (input.split?.splitType === 'shares') {
      for (const allocation of input.split.allocations) {
        unitsByMember.set(allocation.memberId, allocation.units);
      }
    }

    const splits = splitResult.entries.map((entry) =>
      createExpenseSplit({
        id: asExpenseSplitId(this.generateId()),
        expenseId: updated.id,
        memberId: entry.memberId,
        amountMinor: entry.amountMinor,
        ...(splitType === 'percentage'
          ? { percentageBasisPoints: percentageByMember.get(entry.memberId as string) ?? 0 }
          : {}),
        ...(splitType === 'shares'
          ? { shareUnits: unitsByMember.get(entry.memberId as string) ?? 1 }
          : {}),
        now,
      }),
    );

    validateExpenseAggregate(
      updated,
      payers,
      splits,
      group.currencyCode as unknown as Parameters<typeof validateExpenseAggregate>[3],
    );

    await this.expenses.save(updated, payers, splits);

    await this.audit.append({
      id: this.generateId(),
      entityType: 'expense',
      entityId: updated.id as string,
      action: 'update',
      actorId: input.actorUserId as never,
      groupId: updated.groupId,
      previousVersion: current.version as number,
      newVersion: updated.version as number,
      changeSummary: {
        splitType,
        amountMinor: updated.amountMinor,
        payerCount: payers.length,
        participantCount: splits.length,
      },
    });

    return {
      expenseId: updated.id as string,
      version: updated.version as number,
      splits: splits.map((split) => ({
        memberId: split.memberId as string,
        amountMinor: split.amountMinor,
      })),
    };
  }
}
