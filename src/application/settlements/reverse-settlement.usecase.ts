
import { reverseSettlement, createSettlementReversal } from '@domain/entities/settlement';
import { asSettlementId } from '@domain/entities/settlement';
import type { Settlement } from '@domain/entities/settlement';
import { InvalidEntityError } from '@domain/errors/index';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { UnitOfWork } from '@domain/repositories/unit-of-work';
import { nowDateTime, type DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

import { applySettlementTransition } from './_transition-helper';

/**
 * Use case: Reverse a completed settlement.
 *
 * Phase 6 Prompt 52 — required use case `ReverseSettlementUseCase`.
 *
 * A completed settlement is reversed by:
 *   1. Creating a new reversal settlement record (via
 *      `createSettlementReversal` — swaps from/to, same amount,
 *      status = 'completed'). This cancellation record is what the
 *      balance engine sees — it neutralises the original's amount.
 *   2. Transitioning the original settlement `completed → reversed`
 *      and linking it to the reversal record via
 *      `reversesSettlementId`.
 *
 * Financial history is preserved: the original settlement keeps its
 * `status = 'reversed'` and its amount, but
 * `contributesToCompletedBalance('reversed')` returns false, so the
 * balance engine no longer counts it. The reversal record's amount
 * cancels the original. The pair is the audit trail.
 *
 * The reversal use case is the spec's "completed records are
 * corrected through reversal" rule. Do NOT silently edit a completed
 * settlement's amount — that would erase financial history.
 */
export class ReverseSettlementUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
    /**
     * v2.5.0: when provided, the reversal pair (new reversal record +
     * original transition) is written in ONE transaction. Previously
     * the two writes committed separately — a crash or concurrent edit
     * between them left the original still `completed` PLUS a
     * `completed` reversal, double-counting the neutralized payment.
     */
    private readonly unitOfWork?: UnitOfWork,
  ) {}

  async execute(input: ReverseSettlementInput): Promise<ReverseSettlementOutput> {
    if (this.unitOfWork !== undefined) {
      return this.unitOfWork.execute((ctx) =>
        this.reverseWithin(ctx.settlements, ctx.audit, input),
      );
    }
    return this.reverseWithin(this.settlements, this.audit, input);
  }

  private async reverseWithin(
    settlements: SettlementRepository,
    audit: AuditRepository,
    input: ReverseSettlementInput,
  ): Promise<ReverseSettlementOutput> {
    // 1. Load the original to verify it exists and is in the right state.
    const original = await settlements.findById(input.settlementId);
    if (original === null) {
      throw new InvalidEntityError(
        `Settlement ${input.settlementId as string} not found`,
      );
    }
    if (original.deletedAt !== undefined) {
      throw new InvalidEntityError(
        `Settlement ${input.settlementId as string} is deleted; cannot reverse`,
      );
    }
    // Defensive — the state machine will also enforce this, but
    // we give a clearer error message.
    if ((original.status ?? 'completed') !== 'completed') {
      throw new InvalidEntityError(
        `Settlement ${input.settlementId as string} is in status "${original.status ?? 'completed'}"; only completed settlements can be reversed`,
      );
    }

    // 2. Create the reversal settlement record (separate financial record).
    const reversalId = asSettlementId(generateId());
    const now: DateTime = input.now ?? nowDateTime();
    const reversal = createSettlementReversal({
      id: reversalId,
      originalSettlement: original,
      createdBy: input.actorId as never,
      now,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });

    // 3. Save the reversal record (same tx as step 4 when a UoW is wired).
    await settlements.saveReversal(reversal);

    // 4. Transition the original: completed → reversed + link.
    const reversed = await applySettlementTransition(
      settlements,
      audit,
      input.settlementId,
      (s) => reverseSettlement(s, {
        expectedVersion: input.expectedVersion as never,
        now,
        reversalSettlementId: reversalId,
      }),
      {
        actorId: input.actorId,
        actorMemberId: input.actorMemberId,
        note: input.reason,
      },
    );

    return { settlement: reversed, reversalId, reversal };
  }
}

export interface ReverseSettlementInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
  readonly reason?: string;
}

export interface ReverseSettlementOutput {
  /** The original settlement, now in the `reversed` state. */
  readonly settlement: Settlement;
  /** The id of the new reversal settlement record. */
  readonly reversalId: SettlementId;
  /** The reversal settlement record itself. */
  readonly reversal: Settlement;
}

/**
 * Generate a v4 UUID. Uses Web Crypto when available, falls back to
 * timestamp + random.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
