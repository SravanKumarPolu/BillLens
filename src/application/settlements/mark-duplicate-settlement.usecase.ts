
import type { Settlement } from '@domain/entities/settlement';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

import { DisputeSettlementUseCase } from './dispute-settlement.usecase';

/**
 * Use case: Mark a settlement as a likely duplicate.
 *
 * Phase 6 Track 5 / Prompt 57 — the receiver (or an admin) flags
 * a pending settlement as a likely duplicate of another
 * settlement in the same group. The flagged settlement is
 * transitioned to `disputed` with the `duplicate` dispute reason.
 *
 * ── Why dispute + 'duplicate' rather than a soft-delete ──
 *
 * The spec (Prompt 57) lists "Mark duplicate" as a receiver
 * confirmation action. The cleanest implementation is to use the
 * existing dispute taxonomy: `duplicate` is one of the eight
 * structured dispute reasons. The receiver marks the settlement
 * as disputed with reason `duplicate`, and the dispute resolution
 * flow (`ResolveDisputeUseCase` with `resolution: 'cancelled'`)
 * cancels it.
 *
 * This preserves the audit trail: the disputed settlement stays in
 * the database with its `disputeReason = 'duplicate'` and
 * `disputeNote = 'Duplicate of settlement {id}'`, so the payer can
 * see what happened and the analytics can aggregate duplicate-
 * detection rates.
 *
 * ── Permission ──
 *
 * The receiver (the `toMemberId` of the settlement) or an admin
 * may mark a settlement as duplicate. The use case trusts the
 * caller to enforce that permission check.
 *
 * ── Duplicate detection hint ──
 *
 * The `duplicateOfSettlementId` input is optional. If provided, it
 * is included in the dispute note as `Duplicate of {id}` so the
 * payer knows which settlement to keep. The repository's
 * `findByPaymentReferenceHash` and `findByOperationId` methods
 * (Track 1) can be used by the caller to detect likely duplicates
 * before invoking this use case.
 */
export class MarkDuplicateSettlementUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: MarkDuplicateSettlementInput): Promise<MarkDuplicateSettlementOutput> {
    // ── Load the settlement ──
    const current = await this.settlements.findById(input.settlementId);
    if (current === null) {
      throw new InvalidEntityError(
        `MarkDuplicate: settlement ${input.settlementId as string} not found`,
      );
    }
    if (current.deletedAt !== undefined) {
      throw new InvalidEntityError(
        `MarkDuplicate: settlement ${input.settlementId as string} is deleted`,
      );
    }
    // Only pending_confirmation settlements can be marked duplicate —
    // the spec lists this as a receiver confirmation action.
    if ((current.status ?? 'completed') !== 'pending_confirmation') {
      throw new InvalidEntityError(
        `MarkDuplicate: settlement ${input.settlementId as string} is in status "${current.status ?? 'completed'}"; only pending_confirmation settlements can be marked as duplicate`,
      );
    }

    // ── Build the dispute note ──
    const note =
      input.duplicateOfSettlementId !== undefined
        ? `Duplicate of settlement ${input.duplicateOfSettlementId as string}`
        : 'Likely duplicate settlement';

    // ── Delegate to DisputeSettlementUseCase ──
    const disputeUseCase = new DisputeSettlementUseCase(this.settlements, this.audit);
    const result = await disputeUseCase.execute({
      settlementId: input.settlementId,
      expectedVersion: input.expectedVersion,
      reason: 'duplicate',
      note,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.actorMemberId !== undefined ? { actorMemberId: input.actorMemberId } : {}),
      ...(input.now !== undefined ? { now: input.now } : {}),
    });

    return { settlement: result.settlement };
  }
}

export interface MarkDuplicateSettlementInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  /** The settlement this one duplicates (optional, for the audit note). */
  readonly duplicateOfSettlementId?: SettlementId;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
}

export interface MarkDuplicateSettlementOutput {
  /** The disputed settlement (status = 'disputed', disputeReason = 'duplicate'). */
  readonly settlement: Settlement;
}
