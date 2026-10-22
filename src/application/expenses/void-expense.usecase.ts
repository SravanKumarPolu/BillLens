/**
 * VoidExpenseUseCase — soft-delete an expense with a permission check.
 *
 * Financial history is never hard-deleted: the row keeps its id and gains
 * `deleted_at`, so balances can be recalculated and the audit trail remains
 * intact. The repository also enqueues the sync operation in the same
 * transaction.
 *
 * Permissions (no cloud accounts):
 *   - group owner or admin may void any expense in their group;
 *   - a regular member may void only an expense they created;
 *   - anyone else is refused.
 */

import { softDeleteExpense } from '@domain/entities/expense';
import { assertGroupWritable } from '@application/groups/group-write-guard';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import { nowDateTime } from '@domain/value-objects';

export interface VoidExpenseInput {
  readonly expenseId: string;
  readonly groupId: string;
  readonly actorMemberId: string;
  readonly actorUserId: string;
  readonly expectedVersion: number;
  readonly reason?: string;
  readonly now?: string;
}

export class VoidExpenseUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly members: GroupMemberRepository,
    private readonly expenses: ExpenseRepository,
    private readonly audit: AuditRepository,
    private readonly generateId: () => string,
  ) {}

  async execute(input: VoidExpenseInput): Promise<{ expenseId: string; version: number }> {
    const expense = await this.expenses.findById(input.expenseId as never);
    if (expense === null) {
      throw new InvalidEntityError(`Expense ${input.expenseId} not found`);
    }
    if (expense.groupId !== input.groupId) {
      throw new InvalidEntityError('Expense does not belong to this group.');
    }
    if (expense.deletedAt !== undefined) {
      return { expenseId: expense.id, version: expense.version };
    }

    const group = await this.groups.findById(input.groupId as never);
    assertGroupWritable(group, 'expense');
    if (group === null || group.deletedAt !== undefined) {
      throw new InvalidEntityError(`Group ${input.groupId} not found`);
    }

    const actor = await this.members.findById(input.actorMemberId as never);
    if (actor === null || actor.groupId !== input.groupId) {
      throw new InvalidEntityError('Actor is not a member of this group.');
    }
    const privileged = actor.role === 'owner' || actor.role === 'admin';
    const ownExpense = expense.createdBy === input.actorUserId;
    if (!privileged && !ownExpense) {
      throw new InvalidEntityError('Only a group admin or the expense creator can void it.');
    }

    const now = (input.now ?? nowDateTime()) as never;
    const deleted = softDeleteExpense(expense, {
      expectedVersion: input.expectedVersion as never,
      now,
    });
    await this.expenses.softDelete(expense.id, {
      actorId: input.actorUserId as never,
      deletedAt: now,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });

    await this.audit.append({
      id: this.generateId(),
      entityType: 'expense',
      entityId: expense.id as string,
      action: 'delete',
      actorId: input.actorUserId as never,
      groupId: input.groupId as never,
      previousVersion: expense.version as number,
      newVersion: deleted.version as number,
      changeSummary: {
        voided: true,
        amountMinor: expense.amountMinor,
        currency: expense.currencyCode,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
    });

    return { expenseId: expense.id, version: deleted.version as number };
  }
}
