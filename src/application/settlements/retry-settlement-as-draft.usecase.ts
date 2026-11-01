
import { retrySettlementAsDraft } from '@domain/entities/settlement';
import type { Settlement } from '@domain/entities/settlement';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

import { applySettlementTransition } from './_transition-helper';

/**
 * Use case: Retry a failed settlement as a fresh draft.
 *
 * Phase 6 Prompt 52 — supports the `failed → draft` transition.
 *
 * The receiver rejected the settlement (status = `failed`). The
 * payer can retry: this transitions the settlement back to `draft`,
 * from which the payer can again `requestSettlement` or
 * `recordSettlement`.
 *
 * Only valid from `failed`. Throws
 * `InvalidStateTransitionError` for any other source state.
 *
 * The retried settlement retains its id, amount, currency, payer,
 * and receiver — only the status changes. A new
 * `settlement_state_history` row records the `failed → draft`
 * transition.
 */
export class RetrySettlementAsDraftUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: RetrySettlementAsDraftInput): Promise<RetrySettlementAsDraftOutput> {
    const updated = await applySettlementTransition(
      this.settlements,
      this.audit,
      input.settlementId,
      (s) => retrySettlementAsDraft(s, {
        expectedVersion: input.expectedVersion as never,
        ...(input.now !== undefined ? { now: input.now } : {}),
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

export interface RetrySettlementAsDraftInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
  readonly note?: string;
}

export interface RetrySettlementAsDraftOutput {
  readonly settlement: Settlement;
}
