
import {
  asSettlementId,
  createSettlement,
} from '@domain/entities/settlement';
import type { Settlement } from '@domain/entities/settlement';
import { InvalidEntityError } from '@domain/errors/index';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import { nowDateTime, type DateTime } from '@domain/value-objects';
import type { SettlementId, UserId, MemberId, GroupId } from '@shared-types/index';

/**
 * Use case: Create a new settlement in the `draft` state.
 *
 * Phase 6 Prompt 52 — required use case `CreateSettlementDraftUseCase`.
 *
 * A draft settlement has not yet been sent to the receiver or recorded
 * as a payment. It can transition to:
 *   - `requested`    (payer asks the receiver to settle)
 *   - `pending_confirmation` (payer records a payment directly)
 *   - `completed`     (self-cash with explicit policy)
 *
 * The settlement amount, currency, payer, and receiver must be valid.
 * The `operationId` is a client-generated stable UUID for offline
 * idempotency: two `createSettlementDraft` calls with the same
 * `operationId` return the same existing draft, not a duplicate.
 *
 * GROUP-LEVEL ACCESS CONTROL (Phase 7): the payer and receiver MUST be
 * ACTIVE members of the target group. Without this check a
 * programmatic / deep-link caller could persist a settlement between
 * member ids that belong to a different group (or no group at all) and
 * corrupt the balance engine's per-group aggregation.
 *
 * ARCHITECTURE: this use case writes via the repository's `save`
 * method (not through UnitOfWork — settlements are single-row writes,
 * unlike expenses which save expense + payers + splits atomically).
 * Audit log entry is appended in the same call sequence.
 */
export class CreateSettlementDraftUseCase {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly audit: AuditRepository,
    private readonly members: GroupMemberRepository,
    private readonly groups?: GroupRepository,
  ) {}

  async execute(input: CreateSettlementDraftInput): Promise<CreateSettlementDraftOutput> {
    // ── Group-level access control (Phase 7) ──────────────────
    // The payer AND the receiver must be active members of the target
    // group. Checked FIRST so an unauthorized idempotency probe cannot
    // distinguish existing operationIds (the check runs before any
    // repository read).
    if (this.groups !== undefined) {
      const group = await this.groups.findById(input.groupId as never as GroupId);
      if (group === null || group.deletedAt !== undefined) {
        throw new InvalidEntityError(`Group ${input.groupId} not found`);
      }
      if (group.archivedAt !== undefined) {
        throw new InvalidEntityError('This group is archived and read-only. Restore it first.');
      }
    }

    const activeMembers = await this.members.listActiveByGroup(
      input.groupId as never as GroupId,
    );
    const activeIds = new Set(activeMembers.map((m) => m.id as string));
    if (activeIds.size === 0) {
      throw new InvalidEntityError(
        `Group ${input.groupId} has no active members`,
      );
    }
    if (!activeIds.has(input.fromMemberId)) {
      throw new InvalidEntityError(
        `Payer ${input.fromMemberId} is not an active member of group ${input.groupId}`,
      );
    }
    if (!activeIds.has(input.toMemberId)) {
      throw new InvalidEntityError(
        `Receiver ${input.toMemberId} is not an active member of group ${input.groupId}`,
      );
    }

    // ── Idempotency check ────────────────────────────────────────
    // If the caller supplied an operationId and a settlement with
    // that operationId already exists, return it (this is a retry,
    // not a duplicate). This is the offline-idempotency contract
    // from Prompt 53.
    if (input.operationId) {
      const existing = await this.settlements.findByOperationId(input.operationId);
      if (existing !== null) {
        return {
          settlementId: existing.id,
          status: existing.status ?? 'draft',
          created: false,
        };
      }
    }

    // ── Duplicate payment-reference check ───────────────────────
    // If a paymentReferenceHash is supplied, refuse to create a
    // duplicate. The unique index uq_settlements_payment_ref would
    // also catch this at the DB layer, but failing here gives a
    // clearer error and avoids the DB round-trip.
    if (input.paymentReferenceHash) {
      const existing = await this.settlements.findByPaymentReferenceHash(
        input.groupId as never as GroupId,
        input.paymentReferenceHash,
      );
      if (existing !== null) {
        throw new InvalidEntityError(
          `A settlement with this payment reference already exists: ${existing.id as string}`,
        );
      }
    }

    // ── Create the entity ────────────────────────────────────────
    const id = asSettlementId(generateId());
    const now = nowDateTime();
    const settlement = createSettlement({
      id,
      groupId: input.groupId as never as GroupId,
      fromMemberId: input.fromMemberId as never as MemberId,
      toMemberId: input.toMemberId as never as MemberId,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode,
      method: input.method,
      settlementDate: input.settlementDate ?? now,
      ...(input.note !== undefined ? { note: input.note } : {}),
      createdBy: input.createdBy as never as UserId,
      now,
      status: 'draft',
      ...(input.paymentReferenceHash !== undefined
        ? { paymentReferenceHash: input.paymentReferenceHash }
        : {}),
      ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
      ...(input.evidenceHash !== undefined ? { evidenceHash: input.evidenceHash } : {}),
    });

    // ── Persist + audit ──────────────────────────────────────────
    await this.settlements.save(settlement);
    await this.audit.append({
      id: generateId(),
      entityType: 'settlement',
      entityId: id as string,
      action: 'create',
      actorId: input.createdBy as never as UserId,
      groupId: input.groupId as never as GroupId,
      newVersion: settlement.version as number,
      changeSummary: {
        status: 'draft',
        method: settlement.method,
        amountMinor: settlement.amountMinor,
        currencyCode: settlement.currencyCode as string,
        fromMemberId: settlement.fromMemberId as string,
        toMemberId: settlement.toMemberId as string,
      },
    });

    return { settlementId: id, status: 'draft', created: true };
  }
}

export interface CreateSettlementDraftInput {
  readonly groupId: string;
  readonly fromMemberId: string;
  readonly toMemberId: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly method: Settlement['method'];
  readonly settlementDate?: DateTime;
  readonly note?: string;
  readonly createdBy: string;
  /** Client-generated stable UUID for offline idempotency. */
  readonly operationId?: string;
  /** sha256 (hex) of payment reference — for duplicate detection. */
  readonly paymentReferenceHash?: string;
  /** sha256 (hex) of attached evidence — for duplicate-evidence detection. */
  readonly evidenceHash?: string;
}

export interface CreateSettlementDraftOutput {
  readonly settlementId: SettlementId;
  readonly status: NonNullable<Settlement['status']>;
  /** True if a new draft was created; false if an existing draft was returned (idempotent retry). */
  readonly created: boolean;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

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
