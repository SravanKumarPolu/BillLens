import type { Settlement, SettlementId, MemberId, UserId } from '@domain/entities/index';
import { DeletedEntityError, InvalidEntityError } from '@domain/errors/index';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';

/**
 * Shared transition helper for settlement use cases.
 *
 * Every Prompt 52 transition use case (request, record, confirm,
 * reject, cancel, dispute, reverse, retry-as-draft) follows the
 * same five-step pattern:
 *
 *   1. Load the settlement (or fail with `InvalidEntityError`).
 *   2. Apply the transition via the entity factory function (which
 *      validates the state-machine transition and bumps the
 *      version). If the transition is invalid, the entity throws
 *      `InvalidStateTransitionError`; if the version is stale, it
 *      throws `VersionConflictError`.
 *   3. Persist the updated settlement via `settlementRepo.save`.
 *   4. Append an entry to the `settlement_state_history` table via
 *      `settlementRepo.appendStateHistory` — this is the audit
 *      trail of state transitions, used by the settlement-detail
 *      screen (Prompt 58) and by forensic analysis.
 *   5. Append a coarse `audit_logs` entry via `audit.append` — this
 *      is the cross-entity audit log used by the audit screen.
 *
 * This helper centralises steps 1, 3, 4, and 5 so the individual use
 * case files only differ in step 2 (the transition function).
 *
 * Returns the updated settlement so the caller can extract any
 * transition-specific fields (e.g. `confirmedByMemberId` set by
 * `confirmSettlement`).
 */
export async function applySettlementTransition(
  settlements: SettlementRepository,
  audit: AuditRepository,
  settlementId: SettlementId,
  transitionFn: (settlement: Settlement) => Settlement,
  transitionMetadata: {
    readonly actorId?: UserId;
    readonly actorMemberId?: MemberId;
    readonly note?: string;
  },
): Promise<Settlement> {
  // 1. Load.
  const current = await settlements.findById(settlementId);
  if (current === null) {
    throw new InvalidEntityError(`Settlement ${settlementId as string} not found`);
  }
  if (current.deletedAt !== undefined) {
    throw new DeletedEntityError(
      `Settlement ${settlementId as string} is deleted; no transitions allowed`,
      'Settlement',
      settlementId,
    );
  }

  const previousStatus = current.status ?? 'completed';
  const previousVersion = current.version as number;

  // 2. Apply transition (throws on invalid transition / version conflict).
  const updated = transitionFn(current);
  const newStatus = updated.status ?? 'completed';

  // 3. Persist.
  await settlements.save(updated);

  // 4. State-history entry.
  await settlements.appendStateHistory(settlementId, {
    fromStatus: previousStatus as never,
    toStatus: newStatus as never,
    ...(transitionMetadata.actorId !== undefined
      ? { actorId: transitionMetadata.actorId }
      : {}),
    ...(transitionMetadata.actorMemberId !== undefined
      ? { actorMemberId: transitionMetadata.actorMemberId }
      : {}),
    ...(transitionMetadata.note !== undefined ? { note: transitionMetadata.note } : {}),
    newVersion: updated.version as number,
  });

  // 5. Coarse audit log entry.
  await audit.append({
    id: generateId(),
    entityType: 'settlement',
    entityId: settlementId as string,
    action: 'update',
    ...(transitionMetadata.actorId !== undefined
      ? { actorId: transitionMetadata.actorId }
      : {}),
    ...(current.groupId !== undefined ? { groupId: current.groupId } : {}),
    previousVersion,
    newVersion: updated.version as number,
    changeSummary: {
      status: { from: previousStatus, to: newStatus },
    },
  });

  return updated;
}

/**
 * Generate a v4 UUID. Same helper as in the create use case.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
