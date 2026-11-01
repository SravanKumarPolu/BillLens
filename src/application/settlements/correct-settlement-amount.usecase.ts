
import {
  asSettlementId,
  createSettlement,
  disputeSettlement,
  type Settlement,
} from '@domain/entities/settlement';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import { nowDateTime, type DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

import { applySettlementTransition } from './_transition-helper';

/**
 * Use case: Correct the amount on a pending settlement.
 *
 * Phase 6 Track 5 / Prompt 57 — the receiver confirms the payment
 * BUT for a different amount than the payer recorded. The spec
 * says:
 *
 *   "If the receiver confirms a different amount:
 *     - Do not mutate the original amount silently.
 *     - Create a revision proposal or corrected settlement version.
 *     - Preserve original evidence.
 *     - Require appropriate confirmation.
 *     - Recalculate balance preview."
 *
 * ── The correction flow ──
 *
 * This use case implements the "revision proposal" approach:
 *
 *   1. The original settlement is disputed with reason `wrong_amount`
 *      and a note specifying the correct amount. The original's
 *      evidence is preserved (disputeSettlement does not touch
 *      paymentReferenceHash or evidenceHash).
 *
 *   2. A NEW draft settlement is created with the corrected amount,
 *      the same from/to/currency/method as the original, and a note
 *      linking back to the original (`Correction of settlement {id}`).
 *      The new draft has status `draft` so it can go through the
 *      normal lifecycle (request, record, confirm).
 *
 * The original settlement is NOT mutated — its amount stays as
 * recorded. Financial history is preserved. The new draft carries
 * the corrected amount and will replace the original in the
 * balance once it reaches `completed`.
 *
 * ── Permission ──
 *
 * Only the receiver (the `toMemberId` of the settlement) may
 * correct the amount. The use case trusts the caller to enforce
 * that permission check.
 *
 * ── Balance impact ──
 *
 * The original settlement transitions to `disputed` → it no longer
 * contributes to the balance. The new draft starts at `draft` → it
 * also does not contribute. The balance will reflect the correction
 * only when the new draft reaches `completed` via the normal
 * confirmation flow.
 */
export class CorrectSettlementAmountUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: CorrectSettlementAmountInput): Promise<CorrectSettlementAmountOutput> {
    // ── Load the original ──
    const original = await this.settlements.findById(input.settlementId);
    if (original === null) {
      throw new InvalidEntityError(
        `CorrectSettlementAmount: settlement ${input.settlementId as string} not found`,
      );
    }
    if (original.deletedAt !== undefined) {
      throw new InvalidEntityError(
        `CorrectSettlementAmount: settlement ${input.settlementId as string} is deleted`,
      );
    }
    if ((original.status ?? 'completed') !== 'pending_confirmation') {
      throw new InvalidEntityError(
        `CorrectSettlementAmount: settlement ${input.settlementId as string} is in status "${original.status ?? 'completed'}"; only pending_confirmation settlements can be corrected`,
      );
    }

    // ── Validate the corrected amount ──
    if (!Number.isInteger(input.correctedAmountMinor) || input.correctedAmountMinor <= 0) {
      throw new InvalidEntityError(
        `CorrectSettlementAmount: correctedAmountMinor must be a positive integer, got ${input.correctedAmountMinor}`,
      );
    }
    if (input.correctedAmountMinor === original.amountMinor) {
      throw new InvalidEntityError(
        `CorrectSettlementAmount: correctedAmountMinor (${input.correctedAmountMinor}) is the same as the original — no correction needed`,
      );
    }

    const now: DateTime = input.now ?? nowDateTime();

    // ── Step 1: Dispute the original with reason 'wrong_amount' ──
    const disputed = await applySettlementTransition(
      this.settlements,
      this.audit,
      input.settlementId,
      (s) => disputeSettlement(s, {
        expectedVersion: input.expectedVersion as never,
        now,
        reason: 'wrong_amount',
        note: `Correct amount: ${input.correctedAmountMinor} minor (was ${original.amountMinor})`,
      }),
      {
        actorId: input.actorId,
        actorMemberId: input.actorMemberId,
        note: `Correction: original ${original.amountMinor} → corrected ${input.correctedAmountMinor}`,
      },
    );

    // ── Step 2: Create a new draft with the corrected amount ──
    const correctedId = asSettlementId(generateId());
    const correctedDraft = createSettlement({
      id: correctedId,
      groupId: original.groupId,
      fromMemberId: original.fromMemberId,
      toMemberId: original.toMemberId,
      amountMinor: input.correctedAmountMinor,
      currencyCode: original.currencyCode as string,
      method: original.method,
      settlementDate: now,
      note: `Correction of settlement ${original.id as string}`,
      createdBy: (input.actorId ?? original.createdBy) as never,
      now,
      status: 'draft',
      // Preserve the original's payment reference and evidence hashes
      // so duplicate detection still works on the corrected version.
      ...(original.paymentReferenceHash !== undefined
        ? { paymentReferenceHash: original.paymentReferenceHash }
        : {}),
      ...(original.evidenceHash !== undefined
        ? { evidenceHash: original.evidenceHash }
        : {}),
    });

    await this.settlements.save(correctedDraft);

    // ── Audit the corrected draft creation ──
    await this.audit.append({
      id: generateId(),
      entityType: 'settlement',
      entityId: correctedId as string,
      action: 'create',
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(original.groupId !== undefined ? { groupId: original.groupId } : {}),
      newVersion: 1,
      changeSummary: {
        correctionOf: input.settlementId as string,
        originalAmountMinor: original.amountMinor,
        correctedAmountMinor: input.correctedAmountMinor,
      },
    });

    return {
      disputedSettlement: disputed,
      correctedDraft,
    };
  }
}

export interface CorrectSettlementAmountInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  /** The corrected amount in minor units (e.g. paise, pence). */
  readonly correctedAmountMinor: number;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
}

export interface CorrectSettlementAmountOutput {
  /** The original settlement, now disputed with reason 'wrong_amount'. */
  readonly disputedSettlement: Settlement;
  /** The new draft settlement with the corrected amount. */
  readonly correctedDraft: Settlement;
}

/**
 * Generate a v4 UUID.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
