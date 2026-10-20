import type { GroupId, MemberId, SettlementId, UserId } from '@shared-types/index';

import type { Settlement } from '../entities/settlement';
import type { DateTime } from '../value-objects/date-time';

import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from './repository-contracts';

/**
 * Filter object for `listByStatus` queries. Each field is optional —
 * `undefined` means "no filter on this field".
 *
 * Phase 6 Prompt 58 requires the settlement history screen to support
 * filters by date range, payer, receiver, currency, method, status,
 * created by, has-evidence, pending-confirmation, disputed, reversed,
 * and offline-pending. This filter captures the dimensions that map
 * directly to indexed columns; compound filters (has-evidence,
 * offline-pending) are computed by the application layer from the
 * returned rows.
 */
export interface SettlementListFilter {
  readonly payerMemberId?: MemberId;
  readonly receiverMemberId?: MemberId;
  readonly currencyCode?: string;
  readonly method?: Settlement['method'];
  /**
   * Single status, OR `statuses` for an OR-group. If both are set,
   * `statuses` takes precedence.
   */
  readonly status?: Settlement['status'];
  readonly statuses?: readonly Settlement['status'][];
  readonly createdBefore?: DateTime;
  readonly createdAfter?: DateTime;
}

/**
 * Repository for the `Settlement` entity.
 *
 * Settlements NEVER modify expense records. Reversing a settlement
 * uses a new adjustment record (Phase 2 feature) rather than mutating
 * financial history.
 *
 * ── Phase 6 Track 1 additions ──
 *
 * The following methods are added to support the state machine and
 * the receiver-confirmation / dispute / history flows. Existing
 * methods are unchanged (backwards compatibility).
 */
export interface SettlementRepository {
  findById(id: SettlementId): Promise<Settlement | null>;
  /** List active (non-deleted) settlements for a group, ordered by settlementDate DESC. */
  listByGroup(groupId: GroupId, pagination: Pagination): Promise<PaginatedResult<Settlement>>;
  /** List settlements where the member is the payer. */
  listSentByMember(memberId: MemberId, pagination: Pagination): Promise<PaginatedResult<Settlement>>;
  /** List settlements where the member is the payee. */
  listReceivedByMember(memberId: MemberId, pagination: Pagination): Promise<PaginatedResult<Settlement>>;
  /** List settlements updated since a given timestamp (used by sync engine). */
  listUpdatedSince(groupId: GroupId, since: DateTime, pagination: Pagination): Promise<PaginatedResult<Settlement>>;
  save(settlement: Settlement): Promise<void>;
  softDelete(id: SettlementId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
  /**
   * Create a reversal settlement that undoes the original.
   * The original settlement is NOT modified — a new adjustment record is created.
   */
  saveReversal(reversal: Settlement): Promise<Settlement>;

  // ── Phase 6 Track 1 additions ────────────────────────────────────

  /**
   * List settlements matching a filter (status, payer, receiver,
   * currency, method, date range). Backs the settlement history
   * screen's filter UI (Prompt 58) and the
   * pending-confirmation / disputed dashboards.
   *
   * Returns only active (non-deleted) settlements.
   */
  listByFilter(
    groupId: GroupId,
    filter: SettlementListFilter,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>>;

  /**
   * Convenience: list settlements in the `pending_confirmation`
   * status for a group. Uses the
   * `idx_settlements_pending_confirmation` index created by the
   * Phase 6 Track 1 migration.
   */
  listPendingConfirmation(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>>;

  /**
   * Convenience: list settlements in the `disputed` status for a
   * group. Uses the `idx_settlements_disputed` index.
   */
  listDisputed(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>>;

  /**
   * Find a settlement by its client-generated `operationId`. Used by
   * the offline-creation idempotency check: before creating a new
   * settlement, the use case calls `findByOperationId` to detect a
   * retry of the same intended write.
   *
   * Returns null if no settlement has the given `operationId`, or if
   * the settlement was soft-deleted.
   */
  findByOperationId(operationId: string): Promise<Settlement | null>;

  /**
   * Find a settlement by its `paymentReferenceHash` within a group.
   * Used for duplicate-reference detection (Prompt 53): before
   * saving a new settlement, the use case calls
   * `findByPaymentReferenceHash` to detect a likely duplicate.
   *
   * Returns null if no settlement has the given hash, or if the
   * settlement was soft-deleted.
   */
  findByPaymentReferenceHash(
    groupId: GroupId,
    paymentReferenceHash: string,
  ): Promise<Settlement | null>;

  /**
   * Append a state-transition entry to the
   * `settlement_state_history` table. Called by the use cases after
   * every successful transition. Append-only — there is no
   * `updateStateHistory` method.
   *
   * The `actorMemberId` is the group member the actor is acting as
   * (typically themselves); `actorId` is the user profile id. Both
   * are nullable because system-initiated transitions (auto-cancel
   * on member removal, sync resolution) have no human actor.
   */
  appendStateHistory(
    settlementId: SettlementId,
    transition: {
      readonly fromStatus: NonNullable<Settlement['status']>;
      readonly toStatus: NonNullable<Settlement['status']>;
      readonly actorId?: UserId;
      readonly actorMemberId?: MemberId;
      readonly note?: string;
      readonly newVersion: number;
    },
  ): Promise<void>;

  /**
   * List the state-history entries for a settlement, ordered by
   * `createdAt` ASC. Used by the settlement-detail screen (Prompt
   * 58) to render the "state history" section.
   */
  listStateHistory(settlementId: SettlementId): Promise<readonly SettlementStateHistoryEntry[]>;
}

/**
 * One row of the `settlement_state_history` table, as returned by
 * `listStateHistory`.
 */
export interface SettlementStateHistoryEntry {
  readonly id: string;
  readonly settlementId: SettlementId;
  readonly fromStatus: NonNullable<Settlement['status']>;
  readonly toStatus: NonNullable<Settlement['status']>;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly note?: string;
  readonly newVersion: number;
  readonly createdAt: DateTime;
}
