
import { resolveDispute } from '@domain/entities/settlement';
import type { Settlement } from '@domain/entities/settlement';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

import { applySettlementTransition } from './_transition-helper';

/**
 * Use case: Resolve a disputed settlement.
 *
 * Phase 6 Track 5 / Prompt 57 — resolves a dispute by either
 * accepting the payment (`disputed → completed`) or rejecting it
 * (`disputed → cancelled`).
 *
 * ── Permission ──
 *
 * Only the receiver (the `toMemberId` of the settlement) may
 * resolve a dispute in favour of the payment (the `completed`
 * resolution requires `confirmedByMemberId`). The `cancelled`
 * resolution can be invoked by either party. The use case trusts
 * the caller to enforce these permission checks.
 *
 * ── Balance impact ──
 *
 * On `completed` resolution, the settlement begins contributing to
 * the balance (`contributesToCompletedBalance('completed') === true`).
 * On `cancelled` resolution, the settlement does NOT contribute
 * (terminal state).
 *
 * ── Audit ──
 *
 * The state-history entry records the `disputed → completed` (or
 * `disputed → cancelled`) transition, the actor, and the note. The
 * `confirmedByMemberId` and `confirmedAt` fields are set on the
 * entity for the `completed` resolution.
 */
export class ResolveDisputeUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: ResolveDisputeInput): Promise<ResolveDisputeOutput> {
    // ── Defensive: verify the settlement is actually disputed ──
    // The entity's resolveDispute function calls applyTransition with
    // 'completed' or 'cancelled', which would accept the transition
    // from pending_confirmation as well (since pending_confirmation →
    // completed is a valid transition in the state machine). We need
    // to guard that this use case is only called on disputed settlements.
    const current = await this.settlements.findById(input.settlementId);
    if (current === null) {
      throw new InvalidEntityError(
        `ResolveDispute: settlement ${input.settlementId as string} not found`,
      );
    }
    if (current.deletedAt !== undefined) {
      throw new InvalidEntityError(
        `ResolveDispute: settlement ${input.settlementId as string} is deleted`,
      );
    }
    if ((current.status ?? 'completed') !== 'disputed') {
      throw new InvalidEntityError(
        `ResolveDispute: settlement ${input.settlementId as string} is in status "${current.status ?? 'completed'}"; only disputed settlements can be resolved via this use case`,
      );
    }

    const updated = await applySettlementTransition(
      this.settlements,
      this.audit,
      input.settlementId,
      (s) => resolveDispute(s, {
        expectedVersion: input.expectedVersion as never,
        ...(input.now !== undefined ? { now: input.now } : {}),
        resolution: input.resolution,
        ...(input.confirmedByMemberId !== undefined
          ? { confirmedByMemberId: input.confirmedByMemberId as never }
          : {}),
      }),
      {
        actorId: input.actorId,
        actorMemberId: input.actorMemberId ?? input.confirmedByMemberId,
        note: input.note,
      },
    );
    return { settlement: updated };
  }
}

export interface ResolveDisputeInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  /** 'completed' = accept the payment; 'cancelled' = reject. */
  readonly resolution: 'completed' | 'cancelled';
  /** Required for 'completed' resolution — the receiver who accepts. */
  readonly confirmedByMemberId?: MemberId;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
  readonly note?: string;
}

export interface ResolveDisputeOutput {
  readonly settlement: Settlement;
}
