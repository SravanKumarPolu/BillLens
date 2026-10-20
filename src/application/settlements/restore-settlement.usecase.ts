
import type { Settlement } from '@domain/entities/settlement';
import { DeletedEntityError, InvalidEntityError } from '@domain/errors/index';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { DateTime } from '@domain/value-objects';
import type { SettlementId, MemberId, UserId } from '@shared-types/index';

/**
 * Use case: Restore a soft-deleted settlement.
 *
 * Phase 6 Prompt 52 — required use case `RestoreSettlementUseCase`.
 *
 * Undoes a soft-delete by clearing `deletedAt` and bumping the
 * version. The settlement returns to whatever `status` it had before
 * deletion (status is preserved through soft-delete — see
 * `softDeleteSettlement` in the entity).
 *
 * The spec says: "Do not hard-delete financial audit records." Soft-
 * delete preserves the row; restore un-deletes it. Restore is the
 * inverse of `DeleteSettlementUseCase`.
 *
 * SAFETY: restore only un-deletes — it does NOT change the status.
 * If a `completed` settlement was soft-deleted and then restored, it
 * returns to `completed` status (and again contributes to the
 * balance). The caller is responsible for any status correction
 * (e.g. immediately reversing a restored-but-erroneously-completed
 * settlement via `ReverseSettlementUseCase`).
 */
export class RestoreSettlementUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: RestoreSettlementInput): Promise<RestoreSettlementOutput> {
    const current = await this.settlements.findById(input.settlementId);
    if (current === null) {
      throw new InvalidEntityError(
        `Settlement ${input.settlementId as string} not found`,
      );
    }
    if (current.deletedAt === undefined) {
      throw new DeletedEntityError(
        `Settlement ${input.settlementId as string} is not deleted; cannot restore`,
        'Settlement',
        input.settlementId,
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new InvalidEntityError(
        `Settlement ${input.settlementId as string} version conflict: expected ${input.expectedVersion}, got ${current.version as number}`,
      );
    }
    const now: DateTime = input.now ?? current.updatedAt;
    const restored: Settlement = {
      ...current,
      deletedAt: undefined,
      version: (current.version + 1) as never,
      updatedAt: now,
    };
    await this.settlements.save(restored);
    await this.audit.append({
      id: generateId(),
      entityType: 'settlement',
      entityId: input.settlementId as string,
      action: 'restore',
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(current.groupId !== undefined ? { groupId: current.groupId } : {}),
      previousVersion: current.version as number,
      newVersion: restored.version as number,
      changeSummary: { restored: true },
    });
    return { settlement: restored };
  }
}

export interface RestoreSettlementInput {
  readonly settlementId: SettlementId;
  readonly expectedVersion: number;
  readonly actorId?: UserId;
  readonly actorMemberId?: MemberId;
  readonly now?: DateTime;
}

export interface RestoreSettlementOutput {
  readonly settlement: Settlement;
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
