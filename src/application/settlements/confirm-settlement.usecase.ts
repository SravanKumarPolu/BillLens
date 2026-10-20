
import { confirmSettlement } from '@domain/entities/settlement';
import type { Settlement } from '@domain/entities/settlement';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

import { applySettlementTransition } from './_transition-helper';

/**
 * Use case: Transition a settlement from `pending_confirmation` to
 * `completed`.
 *
 * Phase 6 Prompt 52 — required use case `ConfirmSettlementUseCase`.
 *
 * The receiver confirms the payment. Sets `confirmedByMemberId` and
 * `confirmedAt` on the entity for the audit trail. After this
 * transition, the settlement contributes to the completed balance
 * (see `contributesToCompletedBalance` in the state machine).
 *
 * Only valid from `pending_confirmation`. The receiver (the
 * `toMemberId` of the settlement) is the only member permitted to
 * confirm; this use case trusts the caller to enforce that
 * permission check (via the `GroupAuthorizationService`) before
 * invoking.
 *
 * SAFETY: admins MUST NOT be able to fabricate confirmation silently.
 * The `confirmedByMemberId` field preserves who actually confirmed,
 * enabling later audit if a permission violation is suspected.
 */
export class ConfirmSettlementUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: ConfirmSettlementInput): Promise<ConfirmSettlementOutput> {
    // v2.5.0: ENFORCE the receiver-only rule here (defense-in-depth).
    // This use case previously "trusted the caller" to check that the
    // confirmer is the settlement's receiver — nothing did, so any
    // caller could confirm someone else's payment and move balances.
    // The repository load is the authoritative check: an attacker-
    // controlled caller cannot bypass it without replacing the repo.
    const existing = await this.settlements.findById(input.settlementId);
    if (existing === null) {
      throw new Error(`Settlement ${input.settlementId} not found`);
    }
    if ((existing.toMemberId as string) !== (input.confirmedByMemberId as string)) {
      throw new Error(
        'Only the payment recipient can confirm this settlement ' +
        `(expected member ${String(existing.toMemberId)}, got ${String(input.confirmedByMemberId)}).`,
      );
    }

    const updated = await applySettlementTransition(
      this.settlements,
      this.audit,
      input.settlementId,
      (s) => confirmSettlement(s, {
        expectedVersion: input.expectedVersion as never,
        ...(input.now !== undefined ? { now: input.now } : {}),
        confirmedByMemberId: input.confirmedByMemberId as never,
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

export interface ConfirmSettlementInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  /** The member who is confirming — must be the settlement's toMemberId. */
  readonly confirmedByMemberId: MemberId;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
  readonly note?: string;
}

export interface ConfirmSettlementOutput {
  readonly settlement: Settlement;
}
