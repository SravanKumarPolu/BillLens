import type {
  GroupId,
  MemberId,
  SettlementId,
} from '@shared-types/index';

import type { SettlementReminder } from '../entities/settlement-reminder';

import type { PaginatedResult, Pagination } from './repository-contracts';

/**
 * Repository for the `SettlementReminder` entity — Phase 6 Track 6.
 *
 * Stores respectful payment follow-up reminders. The schema
 * (`settlement_reminders` table) was created in Track 1's migration;
 * this contract defines the application-facing interface.
 *
 * ── Cool-down query ──
 *
 * The `findMostRecentForCoolDown` method returns the most recent
 * scheduled-or-sent reminder for a given (group, payer, receiver,
 * currency) tuple. The use case uses this to enforce the cool-down
 * period before creating a new reminder.
 *
 * ── Auto-cancellation ──
 *
 * The `findScheduledForSettlement` and `findScheduledForMember`
 * methods return the set of scheduled reminders that should be
 * auto-cancelled when a settlement completes/disputes or when a
 * member is removed. The `ReconcileReminderStateUseCase` calls
 * these, then calls `save` with the auto-cancelled entity.
 */
export interface SettlementReminderRepository {
  findById(id: string): Promise<SettlementReminder | null>;

  /**
   * List reminders for a group, optionally filtered by status.
   * Ordered by `scheduledAt` ASC.
   */
  listByGroup(
    groupId: GroupId,
    filter?: { readonly status?: SettlementReminder['status'] },
    pagination?: Pagination,
  ): Promise<PaginatedResult<SettlementReminder>>;

  /**
   * Find the most recent scheduled-or-sent reminder for a
   * (group, payer, receiver, currency) tuple. Used for cool-down
   * enforcement.
   *
   * Returns null if no prior reminder exists.
   */
  findMostRecentForCoolDown(
    groupId: GroupId,
    payerMemberId: MemberId,
    receiverMemberId: MemberId,
    currencyCode: string,
  ): Promise<SettlementReminder | null>;

  /**
   * Find all scheduled reminders linked to a specific settlement.
   * Used by `ReconcileReminderStateUseCase` when the settlement
   * completes or is disputed.
   */
  findScheduledForSettlement(
    settlementId: SettlementId,
  ): Promise<readonly SettlementReminder[]>;

  /**
   * Find all scheduled reminders for a (group, payer) pair.
   * Used by `ReconcileReminderStateUseCase` when the payer is
   * removed from the group.
   */
  findScheduledForPayer(
    groupId: GroupId,
    payerMemberId: MemberId,
  ): Promise<readonly SettlementReminder[]>;

  /** Save a new or updated reminder. */
  save(reminder: SettlementReminder): Promise<void>;

  /** Delete a reminder (hard delete — only for test cleanup; production uses cancel). */
  delete(id: string): Promise<void>;
}
