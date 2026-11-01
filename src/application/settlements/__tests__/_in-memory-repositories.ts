
import {
  createGroupMember,
  isMemberActive,
  type GroupMember,
  type MemberRole,
} from '@domain/entities/group-member';
import {
  type Settlement,
} from '@domain/entities/settlement';
import type {
  AuditRepository,
  AuditLogEntry,
} from '@domain/repositories/audit.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type {
  PaginatedResult,
  Pagination,
  DeleteMetadata,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import type {
  SettlementRepository,
  SettlementListFilter,
  SettlementStateHistoryEntry,
} from '@domain/repositories/settlement.repository';
import { asDateTime, type DateTime } from '@domain/value-objects';
import type {
  SettlementId,
  MemberId,
  UserId,
  GroupId,
} from '@shared-types/index';

/**
 * In-memory settlement repository for use case tests.
 *
 * Stores settlements in a Map keyed by id. Implements every method
 * of the `SettlementRepository` contract so it can be passed to any
 * use case constructor.
 *
 * The `stateHistory` map stores the per-settlement state-transition
 * audit trail (Prompt 58). Each entry is appended by `appendStateHistory`
 * and read by `listStateHistory`.
 */
export class InMemorySettlementRepository implements SettlementRepository {
  private readonly settlements = new Map<string, Settlement>();
  private readonly stateHistory = new Map<string, SettlementStateHistoryEntry[]>();
  private historyIdCounter = 0;

  /** Test helper: seed a settlement directly into the store. */
  seed(s: Settlement): void {
    this.settlements.set(s.id as string, s);
  }

  /** Test helper: get all stored settlements (including deleted). */
  allSettlements(): readonly Settlement[] {
    return Array.from(this.settlements.values());
  }

  async findById(id: SettlementId): Promise<Settlement | null> {
    return this.settlements.get(id as string) ?? null;
  }

  async listByGroup(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const all = Array.from(this.settlements.values()).filter(
      (s) => s.groupId === groupId && s.deletedAt === undefined,
    );
    return this.paginate(all, pagination);
  }

  async listSentByMember(
    memberId: MemberId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const all = Array.from(this.settlements.values()).filter(
      (s) => s.fromMemberId === memberId && s.deletedAt === undefined,
    );
    return this.paginate(all, pagination);
  }

  async listReceivedByMember(
    memberId: MemberId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const all = Array.from(this.settlements.values()).filter(
      (s) => s.toMemberId === memberId && s.deletedAt === undefined,
    );
    return this.paginate(all, pagination);
  }

  async listUpdatedSince(
    _groupId: GroupId,
    _since: DateTime,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    return this.paginate([], pagination);
  }

  async save(settlement: Settlement): Promise<void> {
    this.settlements.set(settlement.id as string, settlement);
  }

  async softDelete(
    id: SettlementId,
    metadata: DeleteMetadata,
  ): Promise<SoftDeleteResult> {
    const current = this.settlements.get(id as string);
    if (!current) throw new Error('Settlement not found');
    const deleted: Settlement = {
      ...current,
      deletedAt: metadata.deletedAt,
      version: (current.version + 1) as never,
    };
    this.settlements.set(id as string, deleted);
    return {
      id: id as string,
      deletedAt: metadata.deletedAt,
      version: deleted.version,
    };
  }

  async saveReversal(reversal: Settlement): Promise<Settlement> {
    this.settlements.set(reversal.id as string, reversal);
    return reversal;
  }

  // ── Phase 6 Track 1 additions ────────────────────────────────────

  async listByFilter(
    groupId: GroupId,
    filter: SettlementListFilter,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    let items = Array.from(this.settlements.values()).filter(
      (s) => s.groupId === groupId && s.deletedAt === undefined,
    );
    if (filter.payerMemberId) {
      items = items.filter((s) => s.fromMemberId === filter.payerMemberId);
    }
    if (filter.receiverMemberId) {
      items = items.filter((s) => s.toMemberId === filter.receiverMemberId);
    }
    if (filter.currencyCode) {
      items = items.filter((s) => s.currencyCode === filter.currencyCode);
    }
    if (filter.method) {
      items = items.filter((s) => s.method === filter.method);
    }
    if (filter.statuses) {
      items = items.filter((s) =>
        filter.statuses!.includes((s.status ?? 'completed') as never),
      );
    } else if (filter.status) {
      items = items.filter((s) => (s.status ?? 'completed') === filter.status);
    }
    return this.paginate(items, pagination);
  }

  async listPendingConfirmation(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const items = Array.from(this.settlements.values()).filter(
      (s) => s.groupId === groupId && s.status === 'pending_confirmation' && !s.deletedAt,
    );
    return this.paginate(items, pagination);
  }

  async listDisputed(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const items = Array.from(this.settlements.values()).filter(
      (s) => s.groupId === groupId && s.status === 'disputed' && !s.deletedAt,
    );
    return this.paginate(items, pagination);
  }

  async findByOperationId(operationId: string): Promise<Settlement | null> {
    return (
      Array.from(this.settlements.values()).find(
        (s) => s.operationId === operationId && !s.deletedAt,
      ) ?? null
    );
  }

  async findByPaymentReferenceHash(
    _groupId: GroupId,
    paymentReferenceHash: string,
  ): Promise<Settlement | null> {
    return (
      Array.from(this.settlements.values()).find(
        (s) => s.paymentReferenceHash === paymentReferenceHash && !s.deletedAt,
      ) ?? null
    );
  }

  async appendStateHistory(
    settlementId: SettlementId,
    transition: {
      readonly fromStatus: NonNullable<Settlement['status']>;
      readonly toStatus: NonNullable<Settlement['status']>;
      readonly actorId?: UserId;
      readonly actorMemberId?: MemberId;
      readonly note?: string;
      readonly newVersion: number;
    },
  ): Promise<void> {
    const id = `sh-${++this.historyIdCounter}`;
    const entry: SettlementStateHistoryEntry = {
      id,
      settlementId,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      ...(transition.actorId !== undefined ? { actorId: transition.actorId } : {}),
      ...(transition.actorMemberId !== undefined
        ? { actorMemberId: transition.actorMemberId }
        : {}),
      ...(transition.note !== undefined ? { note: transition.note } : {}),
      newVersion: transition.newVersion,
      createdAt: '2026-10-10T00:00:00.000Z' as DateTime,
    };
    const list = this.stateHistory.get(settlementId as string) ?? [];
    list.push(entry);
    this.stateHistory.set(settlementId as string, list);
  }

  async listStateHistory(
    settlementId: SettlementId,
  ): Promise<readonly SettlementStateHistoryEntry[]> {
    return this.stateHistory.get(settlementId as string) ?? [];
  }

  /** Test helper: read the recorded state history for assertions. */
  stateHistoryFor(id: SettlementId): readonly SettlementStateHistoryEntry[] {
    return this.stateHistory.get(id as string) ?? [];
  }

  private paginate(
    items: readonly Settlement[],
    pagination: Pagination,
  ): PaginatedResult<Settlement> {
    const start = pagination.cursor ? parseInt(pagination.cursor, 10) : 0;
    const end = start + pagination.limit;
    const slice = items.slice(start, end);
    return {
      items: slice,
      nextCursor: end < items.length ? String(end) : undefined,
      hasMore: end < items.length,
    };
  }
}

/**
 * In-memory audit repository for use case tests.
 *
 * Stores `AuditLogEntry` records in an array. The `entries` field is
 * exposed for test assertions.
 */
export class InMemoryAuditRepository implements AuditRepository {
  readonly entries: AuditLogEntry[] = [];

  async append(
    entry: Omit<AuditLogEntry, 'createdAt'>,
  ): Promise<AuditLogEntry> {
    const full: AuditLogEntry = {
      ...entry,
      createdAt: '2026-10-10T00:00:00.000Z' as DateTime,
    };
    this.entries.push(full);
    return full;
  }

  async listByEntity(
    entityType: string,
    entityId: string,
  ): Promise<readonly AuditLogEntry[]> {
    return this.entries.filter(
      (e) => e.entityType === entityType && e.entityId === entityId,
    );
  }

  async listByActor(
    actorId: UserId,
    _pagination: Pagination,
  ): Promise<PaginatedResult<AuditLogEntry>> {
    return {
      items: this.entries.filter((e) => e.actorId === actorId),
      hasMore: false,
    };
  }

  async listByGroup(
    groupId: GroupId,
    _pagination: Pagination,
  ): Promise<PaginatedResult<AuditLogEntry>> {
    return {
      items: this.entries.filter((e) => e.groupId === groupId),
      hasMore: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Group member repository (Phase 7 — membership validation in
// CreateSettlementDraftUseCase)
// ---------------------------------------------------------------------------

/**
 * Minimal in-memory `GroupMemberRepository` backing the group-level
 * access-control checks in the settlement use cases. Members are
 * seeded via `seedActive`; everything else operates on the same map.
 */
export class InMemoryGroupMemberRepository implements GroupMemberRepository {
  private readonly members = new Map<string, GroupMember>();

  /** Seed an active member into a group (test fixture helper). */
  seedActive(groupId: string, memberId: string): GroupMember {
    const member = createGroupMember({
      id: memberId as never,
      groupId: groupId as never,
      displayName: `Member ${memberId}`,
      role: 'member',
    });
    this.members.set(memberId, member);
    return member;
  }

  async findById(id: MemberId): Promise<GroupMember | null> {
    return this.members.get(id as string) ?? null;
  }

  async findActiveByGroupAndUser(
    groupId: GroupId,
    userId: UserId,
  ): Promise<GroupMember | null> {
    for (const m of this.members.values()) {
      if (m.groupId === groupId && m.userId === userId && isMemberActive(m)) {
        return m;
      }
    }
    return null;
  }

  async listActiveByGroup(groupId: GroupId): Promise<readonly GroupMember[]> {
    return [...this.members.values()].filter(
      (m) => m.groupId === groupId && isMemberActive(m),
    );
  }

  async listAllByGroup(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<GroupMember>> {
    const items = [...this.members.values()].filter((m) => m.groupId === groupId);
    return {
      items: items.slice(0, pagination.limit),
      hasMore: items.length > pagination.limit,
    };
  }

  async findActiveOwner(groupId: GroupId): Promise<GroupMember | null> {
    for (const m of this.members.values()) {
      if (m.groupId === groupId && m.role === 'owner' && isMemberActive(m)) {
        return m;
      }
    }
    return null;
  }

  async updateRole(id: MemberId, newRole: MemberRole): Promise<GroupMember> {
    const m = this.members.get(id as string);
    if (!m) throw new Error(`Member ${id} not found`);
    const updated = { ...m, role: newRole };
    this.members.set(id as string, updated);
    return updated;
  }

  async save(member: GroupMember): Promise<void> {
    this.members.set(member.id as string, member);
  }

  async softDelete(id: MemberId, _metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    const m = this.members.get(id as string);
    if (m) {
      const leftAt = asDateTime('2026-10-11T00:00:00.000Z');
      this.members.set(id as string, { ...m, leftAt });
      return { id: id as string, deletedAt: leftAt, version: m.version };
    }
    throw new Error(`Member ${id} not found`);
  }
}
