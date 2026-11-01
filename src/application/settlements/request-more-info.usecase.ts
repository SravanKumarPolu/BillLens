
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

/**
 * Use case: Request more information from the payer.
 *
 * Phase 6 Track 5 / Prompt 57 — the receiver needs more context
 * before they can confirm or dispute a pending settlement (e.g.
 * "Which UPI app did you use?" or "Can you attach the screenshot?").
 *
 * ── State change ──
 *
 * This use case does NOT change the settlement's status. The
 * settlement remains in `pending_confirmation`. It only appends an
 * audit entry with the request, so the payer sees it in their
 * notification feed and can respond.
 *
 * The spec (Prompt 57) lists "Request more information" as one of
 * the receiver's confirmation actions — alongside confirm, dispute,
 * and mark duplicate. It is the gentlest action: no state change,
 * just a request.
 *
 * ── Permission ──
 *
 * Only the receiver (the `toMemberId` of the settlement) may
 * request more info. The use case trusts the caller to enforce
 * that permission check.
 *
 * ── Audit ──
 *
 * The audit entry records the request with the `requestMoreInfo`
 * action label and the receiver's note. The payer sees this in
 * their notification feed.
 */
export class RequestMoreInfoUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: RequestMoreInfoInput): Promise<void> {
    // ── Load the settlement ──
    const current = await this.settlements.findById(input.settlementId);
    if (current === null) {
      throw new InvalidEntityError(
        `RequestMoreInfo: settlement ${input.settlementId as string} not found`,
      );
    }
    if (current.deletedAt !== undefined) {
      throw new InvalidEntityError(
        `RequestMoreInfo: settlement ${input.settlementId as string} is deleted`,
      );
    }
    // Only pending_confirmation settlements can receive "request more info"
    // — the spec lists this as a receiver confirmation action.
    if ((current.status ?? 'completed') !== 'pending_confirmation') {
      throw new InvalidEntityError(
        `RequestMoreInfo: settlement ${input.settlementId as string} is in status "${current.status ?? 'completed'}"; only pending_confirmation settlements can receive a request for more info`,
      );
    }

    // ── Validate the note is non-empty ──
    const note = input.note?.trim();
    if (!note || note.length === 0) {
      throw new InvalidEntityError(
        'RequestMoreInfo: note must not be empty (the receiver must say what info they need)',
      );
    }
    if (note.length > 1000) {
      throw new InvalidEntityError(
        `RequestMoreInfo: note must be at most 1000 chars, got ${note.length}`,
      );
    }

    // ── Append an audit entry (no state change) ──
    await this.audit.append({
      id: generateId(),
      entityType: 'settlement',
      entityId: input.settlementId as string,
      action: 'update',
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(current.groupId !== undefined ? { groupId: current.groupId } : {}),
      previousVersion: current.version as number,
      newVersion: current.version as number, // version unchanged — no state transition
      changeSummary: {
        requestMoreInfo: true,
        note,
      },
    });
  }
}

export interface RequestMoreInfoInput {
  readonly settlementId: SettlementId;
  readonly note: string;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
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
