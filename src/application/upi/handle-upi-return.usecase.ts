
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import {
  handleUpiReturn,
  type UpiReturnInput,
  type UpiReturnResult,
} from '@domain/services/upi/upi-return-handler';
import type { SettlementId, UserId, MemberId } from '@shared-types/index';

import { RecordSettlementUseCase } from '../settlements/record-settlement.usecase';

/**
 * Use case: Handle a UPI return — the user came back from the UPI app.
 *
 * Phase 6 Track 4 — wraps the domain `handleUpiReturn` function and
 * connects its result to the settlement state machine:
 *
 *   - If the result is `returned_pending_confirmation`, the use case
 *     advances the settlement to `pending_confirmation` via the
 *     `RecordSettlementUseCase`. The receiver must then confirm
 *     explicitly (Phase 6 Track 1).
 *
 *   - If the result is `cancelled`, the use case leaves the settlement
 *     in its current state (typically `draft`) and does NOT advance
 *     to `pending_confirmation`.
 *
 * ── CRITICAL SAFETY INVARIANT (spec rule, Prompt 56) ──
 *
 *   "BillLens must never claim 'Payment completed' only because a
 *    UPI deep link was opened, a QR code was displayed, a payment
 *    screenshot was attached, the user left BillLens and returned,
 *    or a payment reference was manually entered."
 *
 * This use case NEVER marks a settlement as `completed`. The only
 * path to `completed` is via `ConfirmSettlementUseCase`, which the
 * receiver invokes explicitly. By construction.
 *
 * The use case DOES NOT trust the platform's "user returned" signal
 * as evidence of payment. It only trusts the receiver's explicit
 * confirmation. The user's own statement ("paid" / "did_not_pay" /
 * "unknown") helps decide whether to advance to
 * `pending_confirmation` or stay in `draft` — but it NEVER advances
 * to `completed`.
 */
export class HandleUpiReturnUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: HandleUpiReturnInput): Promise<HandleUpiReturnOutput> {
    // ── Run the domain handler (pure) ──
    const result: UpiReturnResult = handleUpiReturn({
      platformSignal: input.platformSignal,
      ...(input.userStatement !== undefined ? { userStatement: input.userStatement } : {}),
    });

    if (result.kind === 'cancelled') {
      // Leave the settlement alone. Record an audit entry noting the
      // cancellation reason.
      await this.audit.append({
        id: generateId(),
        entityType: 'settlement',
        entityId: input.settlementId as string,
        action: 'update',
        ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
        changeSummary: {
          upiReturn: 'cancelled',
          reason: result.reason,
        },
      });
      return {
        kind: 'cancelled',
        reason: result.reason,
        settlementId: input.settlementId,
      };
    }

    // result.kind === 'returned_pending_confirmation'
    // Advance the settlement from its current state (typically
    // `draft` or `requested`) to `pending_confirmation` via the
    // RecordSettlementUseCase. This is the spec's MVP policy: "User
    // records settlement → Status becomes pending_confirmation →
    // Receiver confirms → Status becomes completed."
    //
    // We need to load the settlement first to know its current
    // version (for optimistic concurrency).
    const current = await this.settlements.findById(input.settlementId);
    if (current === null) {
      throw new InvalidEntityError(
        `HandleUpiReturn: settlement ${input.settlementId as string} not found`,
      );
    }
    if (current.deletedAt !== undefined) {
      throw new InvalidEntityError(
        `HandleUpiReturn: settlement ${input.settlementId as string} is deleted`,
      );
    }

    const recordUseCase = new RecordSettlementUseCase(this.settlements, this.audit);
    const recorded = await recordUseCase.execute({
      settlementId: input.settlementId,
      expectedVersion: current.version as number,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.actorMemberId !== undefined ? { actorMemberId: input.actorMemberId } : {}),
      ...(input.paymentReferenceHash !== undefined
        ? { paymentReferenceHash: input.paymentReferenceHash }
        : {}),
      ...(input.evidenceHash !== undefined ? { evidenceHash: input.evidenceHash } : {}),
      note: 'UPI return: pending receiver confirmation',
    });

    return {
      kind: 'returned_pending_confirmation',
      settlementId: input.settlementId,
      newStatus: recorded.settlement.status ?? 'pending_confirmation',
      newVersion: recorded.settlement.version as number,
    };
  }
}

export interface HandleUpiReturnInput extends UpiReturnInput {
  /** The settlement this return is for. */
  readonly settlementId: SettlementId;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  /** Optional payment reference hash (sha256 of the UPI UTR). */
  readonly paymentReferenceHash?: string;
  /** Optional evidence hash (sha256 of an attached screenshot). */
  readonly evidenceHash?: string;
}

export type HandleUpiReturnOutput =
  | {
      readonly kind: 'returned_pending_confirmation';
      readonly settlementId: SettlementId;
      readonly newStatus: string;
      readonly newVersion: number;
    }
  | {
      readonly kind: 'cancelled';
      readonly reason: string;
      readonly settlementId: SettlementId;
    };

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
