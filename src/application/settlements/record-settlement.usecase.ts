
import { recordSettlement } from '@domain/entities/settlement';
import type { Settlement } from '@domain/entities/settlement';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

import { applySettlementTransition } from './_transition-helper';

/**
 * Use case: Transition a settlement to `pending_confirmation`.
 *
 * Phase 6 Prompt 52 — required use case `RecordSettlementUseCase`.
 *
 * The payer has recorded a payment (launched UPI, attached evidence,
 * entered a reference). The settlement is now awaiting receiver
 * confirmation. Optionally attaches the payment reference hash and
 * evidence hash for duplicate detection.
 *
 * Valid from `draft` or `requested`. Throws
 * `InvalidStateTransitionError` for any other source state.
 *
 * SAFETY: this use case does NOT mark the settlement as `completed`.
 * The receiver must confirm explicitly via `ConfirmSettlementUseCase`.
 * This enforces the Phase 6 safety principle: "BillLens must never
 * claim 'Payment completed' only because a payment app was opened."
 */
export class RecordSettlementUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: RecordSettlementInput): Promise<RecordSettlementOutput> {
    const updated = await applySettlementTransition(
      this.settlements,
      this.audit,
      input.settlementId,
      (s) => recordSettlement(s, {
        expectedVersion: input.expectedVersion as never,
        ...(input.now !== undefined ? { now: input.now } : {}),
        ...(input.paymentReferenceHash !== undefined
          ? { paymentReferenceHash: input.paymentReferenceHash }
          : {}),
        ...(input.evidenceHash !== undefined ? { evidenceHash: input.evidenceHash } : {}),
      }),
      {
        actorId: input.actorId,
        actorMemberId: input.actorMemberId,
        note: input.note,
      },
    );
    return { settlement: updated };
  }
}

export interface RecordSettlementInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
  readonly note?: string;
  readonly paymentReferenceHash?: string;
  readonly evidenceHash?: string;
}

export interface RecordSettlementOutput {
  readonly settlement: Settlement;
}
