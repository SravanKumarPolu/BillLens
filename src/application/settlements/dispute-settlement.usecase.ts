
import { disputeSettlement } from '@domain/entities/settlement';
import type { Settlement, SettlementDisputeReason } from '@domain/entities/settlement';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

import { applySettlementTransition } from './_transition-helper';

/**
 * Use case: Dispute a pending settlement.
 *
 * Phase 6 Track 5 / Prompt 57 — the receiver disputes a payment they
 * cannot confirm. The settlement transitions
 * `pending_confirmation → disputed` and a structured dispute reason
 * is recorded for the audit trail and the dispute-resolution queue.
 *
 * ── Dispute reason taxonomy (Prompt 57) ──
 *
 *   - `not_received`      — Payment not received
 *   - `wrong_amount`      — Wrong amount (use `CorrectSettlementAmountUseCase` for corrections)
 *   - `wrong_currency`   — Wrong currency
 *   - `wrong_sender`     — Wrong sender
 *   - `duplicate`         — Duplicate settlement (use `MarkDuplicateSettlementUseCase` for the common case)
 *   - `failed`            — Payment failed
 *   - `reversed`          — Payment was reversed externally
 *   - `other`             — Other (note required)
 *
 * The entity factory enforces that the reason is one of these eight
 * values, and that `other` requires a non-empty note. This use case
 * delegates to the factory — it does not re-validate.
 *
 * ── Permission ──
 *
 * Only the receiver (the `toMemberId` of the settlement) may
 * dispute. This use case trusts the caller to enforce that
 * permission check (via the `GroupAuthorizationService`) before
 * invoking. The `actorMemberId` is recorded in the state-history
 * entry for audit.
 *
 * ── Balance impact ──
 *
 * A disputed settlement does NOT contribute to the balance
 * (`contributesToCompletedBalance('disputed') === false`). This is
 * the spec's safety rule: a disputed payment never alters the
 * completed balance.
 */
export class DisputeSettlementUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: DisputeSettlementInput): Promise<DisputeSettlementOutput> {
    const updated = await applySettlementTransition(
      this.settlements,
      this.audit,
      input.settlementId,
      (s) => disputeSettlement(s, {
        expectedVersion: input.expectedVersion as never,
        ...(input.now !== undefined ? { now: input.now } : {}),
        reason: input.reason,
        ...(input.note !== undefined ? { note: input.note } : {}),
      }),
      {
        actorId: input.actorId,
        actorMemberId: input.actorMemberId,
        note: `Dispute: ${input.reason}${input.note !== undefined ? ` — ${input.note}` : ''}`,
      },
    );
    return { settlement: updated };
  }
}

export interface DisputeSettlementInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  readonly reason: SettlementDisputeReason;
  readonly note?: string;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
}

export interface DisputeSettlementOutput {
  readonly settlement: Settlement;
}
