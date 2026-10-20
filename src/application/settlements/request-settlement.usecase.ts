
import { requestSettlement } from '@domain/entities/settlement';
import type { Settlement } from '@domain/entities/settlement';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

import { applySettlementTransition } from './_transition-helper';

/**
 * Use case: Transition a settlement from `draft` to `requested`.
 *
 * Phase 6 Prompt 52 — required use case `RequestSettlementUseCase`.
 *
 * The payer has asked the receiver to settle. No payment has been
 * recorded yet. The settlement now awaits either:
 *   - the payer recording a payment (`recordSettlement` → `pending_confirmation`), or
 *   - either party cancelling (`cancelSettlement` → `cancelled`).
 *
 * Only valid from the `draft` state. Throws
 * `InvalidStateTransitionError` for any other source state.
 */
export class RequestSettlementUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: RequestSettlementInput): Promise<RequestSettlementOutput> {
    const updated = await applySettlementTransition(
      this.settlements,
      this.audit,
      input.settlementId,
      (s) => requestSettlement(s, {
        expectedVersion: input.expectedVersion as never,
        ...(input.now !== undefined ? { now: input.now } : {}),
      }),
      {
        actorId: input.actorId,
        actorMemberId: input.actorMemberId,
      },
    );
    return { settlement: updated };
  }
}

export interface RequestSettlementInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
}

export interface RequestSettlementOutput {
  readonly settlement: Settlement;
}
