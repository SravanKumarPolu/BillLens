/**
 * Recurring expenses.
 *
 * Creation copies a real expense's payers and exact split allocations, so a
 * repeated series preserves the original financial shape. Materialisation
 * writes ordinary expenses through the existing validated use case and
 * records one occurrence row per date; deterministic expense ids make a
 * retry after a crash idempotent.
 */

import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type {
  RecurringExpense,
  RecurringExpenseRepository,
} from '@domain/repositories/recurring-expense.repository';
import {
  advanceOccurrence,
  dueOccurrences,
  validateRule,
  type RecurrenceFrequency,
} from '@domain/recurring/schedule';

import type { CreateExpenseManuallyUseCase } from '../expenses/create-expense-manually.usecase';

export interface CreateRecurringExpenseInput {
  readonly expenseId: string;
  readonly frequency: RecurrenceFrequency;
  readonly intervalCount?: number;
  readonly startDate: string;
  readonly endDate?: string;
  readonly now?: string;
}

export class CreateRecurringExpenseFromExpenseUseCase {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly repository: RecurringExpenseRepository,
    private readonly generateId: () => string,
  ) {}

  async execute(input: CreateRecurringExpenseInput): Promise<RecurringExpense> {
    const expense = await this.expenses.findById(input.expenseId as never);
    if (expense === null || expense.deletedAt !== undefined) {
      throw new Error('The expense to repeat was not found.');
    }

    const intervalCount = input.intervalCount ?? 1;
    const rule = {
      frequency: input.frequency,
      intervalCount,
      startDate: input.startDate,
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
    };
    validateRule(rule);

    const [payers, splits] = await Promise.all([
      this.expenses.listPayers(expense.id),
      this.expenses.listSplits(expense.id),
    ]);
    if (payers.length === 0 || splits.length === 0) {
      throw new Error('The source expense has no payers or shares to repeat.');
    }
    const payerTotal = payers.reduce((sum, payer) => sum + payer.amountMinor, 0);
    const splitTotal = splits.reduce((sum, split) => sum + split.amountMinor, 0);
    if (payerTotal !== expense.amountMinor || splitTotal !== expense.amountMinor) {
      throw new Error('The source expense totals are inconsistent and cannot be repeated.');
    }

    const now = input.now ?? new Date().toISOString();
    const template: RecurringExpense = {
      id: this.generateId(),
      groupId: expense.groupId,
      title: expense.title,
      amountMinor: expense.amountMinor,
      currencyCode: expense.currencyCode,
      ...(expense.note !== undefined ? { note: expense.note } : {}),
      payers: payers.map((payer) => ({
        memberId: payer.memberId,
        amountMinor: payer.amountMinor,
      })),
      splits: splits.map((split) => ({
        memberId: split.memberId,
        amountMinor: split.amountMinor,
      })),
      frequency: input.frequency,
      intervalCount,
      startDate: input.startDate,
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      nextOccurrenceDate: input.startDate,
      paused: false,
      createdBy: expense.createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await this.repository.save(template);
    return template;
  }
}

export interface MaterializeResult {
  readonly templatesProcessed: number;
  readonly expensesCreated: number;
  readonly dates: readonly string[];
}

export class MaterializeRecurringExpensesUseCase {
  constructor(
    private readonly repository: RecurringExpenseRepository,
    private readonly createExpense: CreateExpenseManuallyUseCase,
  ) {}

  async execute(input: {
    readonly groupIds: readonly string[];
    readonly today: string;
    readonly now?: string;
  }): Promise<MaterializeResult> {
    const templates = await this.repository.listDue(input.groupIds, input.today, 25);
    const now = input.now ?? new Date().toISOString();
    let expensesCreated = 0;
    const dates: string[] = [];

    for (const template of templates) {
      const due = dueOccurrences(
        template.nextOccurrenceDate,
        {
          frequency: template.frequency,
          intervalCount: template.intervalCount,
          startDate: template.startDate,
          ...(template.endDate !== undefined ? { endDate: template.endDate } : {}),
        },
        input.today,
        50,
      );
      if (due.length === 0) continue;

      let last = template.lastMaterializedDate;
      for (const date of due) {
        const existing = await this.repository.findOccurrence(template.id, date);
        if (existing === null) {
          const expenseId = `rec-${template.id}-${date}`;
          await this.createExpense.execute({
            expenseId,
            groupId: template.groupId,
            title: template.title,
            amountMinor: template.amountMinor,
            currencyCode: template.currencyCode,
            expenseDate: date,
            ...(template.note !== undefined ? { note: template.note } : {}),
            payerContributions: template.payers.map((payer) => ({
              memberId: payer.memberId,
              amountMinor: payer.amountMinor,
            })),
            participantIds: template.splits.map((split) => split.memberId),
            split: {
              splitType: 'exact',
              allocations: template.splits.map((split) => ({
                memberId: split.memberId,
                amountMinor: split.amountMinor,
              })),
            },
            createdBy: template.createdBy,
            now: `${date}T12:00:00.000Z` as never,
          });
          await this.repository.recordOccurrence({
            recurringId: template.id,
            occurrenceDate: date,
            expenseId,
            createdAt: now,
          });
          expensesCreated += 1;
          dates.push(date);
        }
        last = date;
      }

      const next = advanceOccurrence(due[due.length - 1] as string, {
        frequency: template.frequency,
        intervalCount: template.intervalCount,
        startDate: template.startDate,
      });
      await this.repository.save({
        ...template,
        ...(last !== undefined ? { lastMaterializedDate: last } : {}),
        nextOccurrenceDate: next,
        updatedAt: now,
        version: template.version + 1,
      });
    }

    return { templatesProcessed: templates.length, expensesCreated, dates };
  }
}

export class SetRecurringExpensePausedUseCase {
  constructor(private readonly repository: RecurringExpenseRepository) {}

  async execute(id: string, paused: boolean, now = new Date().toISOString()): Promise<void> {
    const template = await this.repository.findById(id);
    if (template === null || template.deletedAt !== undefined) {
      throw new Error('Recurring expense not found.');
    }
    await this.repository.setPaused(id, paused, now);
  }
}

export class DeleteRecurringExpenseUseCase {
  constructor(private readonly repository: RecurringExpenseRepository) {}

  async execute(id: string, now = new Date().toISOString()): Promise<void> {
    await this.repository.softDelete(id, now);
  }
}

export class ListRecurringExpensesUseCase {
  constructor(private readonly repository: RecurringExpenseRepository) {}

  async execute(groupIds: readonly string[]): Promise<readonly RecurringExpense[]> {
    return this.repository.listByGroups(groupIds);
  }
}
