
import { softDeleteSettlement } from '@domain/entities/settlement';
import { InvalidEntityError } from '@domain/errors/index';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import { nowDateTime, type DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

/**
 * Use case: Soft-delete a settlement.
 *
 * Phase 6 Prompt 52 — required use case `DeleteSettlementUseCase`.
 *
 * Soft-deletes preserve financial audit history — the settlement is
 * NOT hard-deleted. The `deletedAt` field is set; the row remains in
 * the database for the audit trail and the state history.
 *
 * Spec rule (Prompt 52): "Do not hard-delete financial audit records."
 * This use case enforces that — there is no `hardDelete` method on
 * the repository contract.
 *
 * The settlement can be in ANY state when deleted — the spec does not
 * restrict soft-delete to terminal states. After deletion, no
 * further state transitions are allowed (the entity factory throws
 * `DeletedEntityError` on any transition).
 */
export class DeleteSettlementUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: DeleteSettlementInput): Promise<void> {
    const current = await this.settlements.findById(input.settlementId);
    if (current === null) {
      throw new InvalidEntityError(
        `Settlement ${input.settlementId as string} not found`,
      );
    }
    if (current.deletedAt !== undefined) {
      // Idempotent: already deleted — return without error.
      return;
    }
    const now: DateTime = input.now ?? nowDateTime();
    const deleted = softDeleteSettlement(current, {
      expectedVersion: input.expectedVersion as never,
      now,
    });
    await this.settlements.save(deleted);
    await this.audit.append({
      id: generateId(),
      entityType: 'settlement',
      entityId: input.settlementId as string,
      action: 'delete',
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(current.groupId !== undefined ? { groupId: current.groupId } : {}),
      previousVersion: current.version as number,
      newVersion: deleted.version as number,
      changeSummary: {
        deleted: true,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
    });
  }
}

export interface DeleteSettlementInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
  readonly reason?: string;
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
