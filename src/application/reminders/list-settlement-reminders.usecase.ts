
import type { SettlementReminder } from '@domain/entities/settlement-reminder';
import type { PaginatedResult, Pagination } from '@domain/repositories/repository-contracts';
import type { SettlementReminderRepository } from '@domain/repositories/settlement-reminder.repository';
import type { GroupId } from '@shared-types/index';

/**
 * Use case: List settlement reminders for a group.
 *
 * Phase 6 Track 6 / Prompt 59 — backs the reminders management UI.
 * Returns reminders for the group, optionally filtered by status,
 * ordered by `scheduledAt` ASC.
 *
 * The caller is responsible for filtering to reminders the current
 * user can see (those they created or those addressed to them).
 */
export class ListSettlementRemindersUseCase {
  constructor(private readonly reminders: SettlementReminderRepository) {}

  async execute(input: ListSettlementRemindersInput): Promise<ListSettlementRemindersOutput> {
    const page = await this.reminders.listByGroup(
      input.groupId,
      ...(input.status !== undefined ? [{ status: input.status }] : []),
      input.pagination,
    );
    return {
      items: page.items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}

export interface ListSettlementRemindersInput {
  readonly groupId: GroupId;
  readonly status?: SettlementReminder['status'];
  readonly pagination: Pagination;
}

export type ListSettlementRemindersOutput = PaginatedResult<SettlementReminder>;
