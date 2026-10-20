
import { cancelSettlement } from '@domain/entities/settlement';
import type { Settlement } from '@domain/entities/settlement';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

import { applySettlementTransition } from './_transition-helper';

/**
 * Use case: Cancel a settlement.
 *
 * Phase 6 Prompt 52 — required use case `CancelSettlementUseCase`.
 *
 * Either party cancels. Terminal state — the settlement cannot
 * transition out of `cancelled` (except soft-delete for audit).
 *
 * Valid from `requested` or `pending_confirmation`. A `cancelled`
 * settlement does NOT contribute to the balance.
 */
export class CancelSettlementUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: CancelSettlementInput): Promise<CancelSettlementOutput> {
    const updated = await applySettlementTransition(
      this.settlements,
      this.audit,
      input.settlementId,
      (s) => cancelSettlement(s, {
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

export interface CancelSettlementInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
  readonly reason?: string;
  readonly note?: string;
}

export interface CancelSettlementOutput {
  readonly settlement: Settlement;
}
