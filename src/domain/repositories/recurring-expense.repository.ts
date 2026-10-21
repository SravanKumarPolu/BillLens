/**
 * Recurring expense templates and their materialised occurrences.
 *
 * The template stores exact payer/split allocations copied from the source
 * expense, so a repeated exact/percentage/shares split keeps the same
 * amounts instead of being silently re-equalised.
 */

import type { RecurrenceFrequency } from '@domain/recurring/schedule';

export interface RecurringAllocation {
  readonly memberId: string;
  readonly amountMinor: number;
}

export interface RecurringExpense {
  readonly id: string;
  readonly groupId: string;
  readonly title: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly note?: string;
  readonly payers: readonly RecurringAllocation[];
  readonly splits: readonly RecurringAllocation[];
  readonly frequency: RecurrenceFrequency;
  readonly intervalCount: number;
  readonly startDate: string;
  readonly endDate?: string;
  readonly nextOccurrenceDate: string;
  readonly lastMaterializedDate?: string;
  readonly paused: boolean;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string;
  readonly version: number;
}

export interface RecurringOccurrence {
  readonly recurringId: string;
  readonly occurrenceDate: string;
  readonly expenseId: string;
  readonly createdAt: string;
}

export interface RecurringExpenseRepository {
  save(template: RecurringExpense): Promise<void>;
  findById(id: string): Promise<RecurringExpense | null>;
  listByGroups(groupIds: readonly string[]): Promise<readonly RecurringExpense[]>;
  /** Templates with `next_occurrence_date <= today`, not paused/deleted. */
  listDue(groupIds: readonly string[], today: string, limit: number): Promise<readonly RecurringExpense[]>;
  findOccurrence(recurringId: string, occurrenceDate: string): Promise<RecurringOccurrence | null>;
  recordOccurrence(occurrence: RecurringOccurrence): Promise<void>;
  setPaused(id: string, paused: boolean, now: string): Promise<void>;
  softDelete(id: string, now: string): Promise<void>;
}
