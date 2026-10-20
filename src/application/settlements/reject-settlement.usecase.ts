
import { rejectSettlement } from '@domain/entities/settlement';
import type { Settlement } from '@domain/entities/settlement';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

import { applySettlementTransition } from './_transition-helper';

/**
 * Use case: Transition a settlement from `pending_confirmation` to
 * `failed`.
 *
 * Phase 6 Prompt 52 — required use case `RejectSettlementUseCase`.
 *
 * The receiver rejected the settlement (e.g. wrong amount, payment
 * not received). The payer can retry by transitioning `failed → draft`
 * via `RetrySettlementAsDraftUseCase`.
 *
 * A `failed` settlement does NOT contribute to the balance — it is
 * excluded by `contributesToCompletedBalance`. This is a safety
 * property: a rejected payment never alters the completed balance.
 */
export class RejectSettlementUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: RejectSettlementInput): Promise<RejectSettlementOutput> {
    const updated = await applySettlementTransition(
      this.settlements,
      this.audit,
      input.settlementId,
      (s) => rejectSettlement(s, {
        expectedVersion: input.expectedVersion as never,
        ...(input.now !== undefined ? { now: input.now } : {}),
      }),
      {
        actorId: input.actorId,
        actorMemberId: input.actorMemberId,
        note: input.reason ?? input.note,
      },
    );
    return { settlement: updated };
  }
}

export interface RejectSettlementInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
  readonly reason?: string;
  readonly note?: string;
}

export interface RejectSettlementOutput {
  readonly settlement: Settlement;
}
