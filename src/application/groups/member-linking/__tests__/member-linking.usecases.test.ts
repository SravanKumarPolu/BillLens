/**
 * Member-linking use-case unit tests — Phase 3 Prompt 28.
 *
 * Exercises:
 *
 *   - FindLinkCandidatesUseCase: same-name + shared-token + placeholder.
 *   - PreviewLinkImpactUseCase: counts payer/participant/settlement
 *     references + historical names from audit entries; balance unchanged.
 *   - LinkMembershipToProfileUseCase: links a placeholder, preserves id,
 *     rejects already-linked, rejects cross-group, rejects permission failure.
 *   - ResolveDuplicateMembersUseCase: keep_both + transfer_active_identity
 *     (with confirmFinancialImpact gate).
 *   - UnlinkIncorrectIdentityUseCase: reverses a link, preserves audit history.
 *
 * Financial invariants:
 *   - Balances are NEVER recomputed by any linking operation.
 *   - Historical expense/settlement references remain valid (member ids
 *     preserved).
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import type {
  Expense,
  ExpenseId,
  ExpensePayer,
  ExpenseSplit,
  GroupId,
  MemberId,
  Settlement,
  SettlementId,
  UserId,
} from '@domain/entities';
import { asExpenseId } from '@domain/entities/expense';
import { createExpensePayer } from '@domain/entities/expense-payer';
import { createExpenseSplit } from '@domain/entities/expense-split';
import { asGroupId } from '@domain/entities/group';
import {
  asMemberId,
  createGroupMember,
  type GroupMember,
  leaveGroup,
} from '@domain/entities/group-member';
import { asSettlementId, createSettlement } from '@domain/entities/settlement';
import { asUserId } from '@domain/entities/user';
import type {
  AuditLogEntry,
  AuditRepository,
} from '@domain/repositories/audit.repository';
import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import type {
  SettlementRepository,
  SettlementListFilter,
  SettlementStateHistoryEntry,
} from '@domain/repositories/settlement.repository';
import { asDateTime, asVersionNumber } from '@domain/value-objects';

import { FindLinkCandidatesUseCase } from '../find-link-candidates.usecase';
import { LinkMembershipToProfileUseCase } from '../link-membership-to-profile.usecase';
import { PreviewLinkImpactUseCase } from '../preview-link-impact.usecase';
import {
  ResolveDuplicateMembersUseCase,
} from '../resolve-duplicate-members.usecase';
import { UnlinkIncorrectIdentityUseCase } from '../unlink-incorrect-identity.usecase';

// ---------------------------------------------------------------------------
// In-memory test doubles
// ---------------------------------------------------------------------------

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const OWNER_ID = asUserId('user-owner');
const GROUP_ID = asGroupId('group-1');
const OWNER_MEMBER_ID = asMemberId('member-owner');
const OTHER_GROUP_ID = asGroupId('group-2');

class InMemoryMemberRepository {
  private readonly members = new Map<string, GroupMember>();

  seed(member: GroupMember): void {
    this.members.set(member.id as string, member);
  }

  async findById(id: MemberId): Promise<GroupMember | null> {
    return this.members.get(id as string) ?? null;
  }
  async findActiveByGroupAndUser(
    groupId: GroupId,
    userId: UserId,
  ): Promise<GroupMember | null> {
    for (const m of this.members.values()) {
      if (
        m.groupId === groupId &&
        m.userId === userId &&
        m.leftAt === undefined
      ) {
        return m;
      }
    }
    return null;
  }
  async listActiveByGroup(groupId: GroupId): Promise<readonly GroupMember[]> {
    const out: GroupMember[] = [];
    for (const m of this.members.values()) {
      if (m.groupId === groupId && m.leftAt === undefined) out.push(m);
    }
    return out;
  }
  async listAllByGroup(
    groupId: GroupId,
    _pagination: Pagination,
  ): Promise<PaginatedResult<GroupMember>> {
    return {
      items: Array.from(this.members.values()).filter(
        (m) => m.groupId === groupId,
      ),
      hasMore: false,
    };
  }
  async findActiveOwner(groupId: GroupId): Promise<GroupMember | null> {
    for (const m of this.members.values()) {
      if (m.groupId === groupId && m.role === 'owner' && m.leftAt === undefined) {
        return m;
      }
    }
    return null;
  }
  async updateRole(): Promise<GroupMember> {
    throw new Error('Not implemented in test double');
  }
  async save(member: GroupMember): Promise<void> {
    this.members.set(member.id as string, member);
  }
  async softDelete(
    id: MemberId,
    _metadata: DeleteMetadata,
  ): Promise<SoftDeleteResult> {
    const m = this.members.get(id as string);
    if (m) {
      this.members.set(id as string, { ...m, leftAt: NOW });
    }
    return { id: id as string, deletedAt: NOW, version: asVersionNumber(2) };
  }
}

class InMemoryExpenseRepository implements ExpenseRepository {
  private readonly expenses = new Map<string, Expense>();
  private readonly payers = new Map<string, ExpensePayer[]>();
  private readonly splits = new Map<string, ExpenseSplit[]>();

  seedExpense(
    expense: Expense,
    payers: readonly ExpensePayer[],
    splits: readonly ExpenseSplit[],
  ): void {
    this.expenses.set(expense.id as string, expense);
    this.payers.set(expense.id as string, [...payers]);
    this.splits.set(expense.id as string, [...splits]);
  }

  async findById(id: ExpenseId): Promise<Expense | null> {
    return this.expenses.get(id as string) ?? null;
  }
  async listByGroup(
    groupId: GroupId,
    _pagination: Pagination,
  ): Promise<PaginatedResult<Expense>> {
    return {
      items: Array.from(this.expenses.values()).filter(
        (e) => e.groupId === groupId,
      ),
      hasMore: false,
    };
  }
  async listUpdatedSince(): Promise<PaginatedResult<Expense>> {
    return { items: [], hasMore: false };
  }
  async listByReceipt(): Promise<readonly Expense[]> {
    return [];
  }
  async listPayers(expenseId: ExpenseId): Promise<readonly ExpensePayer[]> {
    return this.payers.get(expenseId as string) ?? [];
  }
  async listSplits(expenseId: ExpenseId): Promise<readonly ExpenseSplit[]> {
    return this.splits.get(expenseId as string) ?? [];
  }
  async save(): Promise<void> {
    throw new Error('Not implemented in test double');
  }
  async softDelete(): Promise<SoftDeleteResult> {
    throw new Error('Not implemented in test double');
  }
  async countByPayer(): Promise<number> {
    return 0;
  }
}

class InMemorySettlementRepository implements SettlementRepository {
  private readonly settlements = new Map<string, Settlement>();
  private readonly stateHistory = new Map<string, SettlementStateHistoryEntry[]>();

  seed(s: Settlement): void {
    this.settlements.set(s.id as string, s);
  }

  async findById(id: SettlementId): Promise<Settlement | null> {
    return this.settlements.get(id as string) ?? null;
  }
  async listByGroup(
    groupId: GroupId,
    _pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    return {
      items: Array.from(this.settlements.values()).filter(
        (s) => s.groupId === groupId,
      ),
      hasMore: false,
    };
  }
  async listSentByMember(
    memberId: MemberId,
    _pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    return {
      items: Array.from(this.settlements.values()).filter(
        (s) => s.fromMemberId === memberId,
      ),
      hasMore: false,
    };
  }
  async listReceivedByMember(
    memberId: MemberId,
    _pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    return {
      items: Array.from(this.settlements.values()).filter(
        (s) => s.toMemberId === memberId,
      ),
      hasMore: false,
    };
  }
  async listUpdatedSince(): Promise<PaginatedResult<Settlement>> {
    return { items: [], hasMore: false };
  }
  async save(): Promise<void> {
    throw new Error('Not implemented in test double');
  }
  async softDelete(): Promise<SoftDeleteResult> {
    throw new Error('Not implemented in test double');
  }
  async saveReversal(): Promise<Settlement> {
    throw new Error('Not implemented in test double');
  }
  // Phase 6 Track 1 — minimal in-memory implementations
  async listByFilter(
    groupId: GroupId,
    filter: SettlementListFilter,
    _pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    let items = Array.from(this.settlements.values()).filter((s) => s.groupId === groupId);
    if (filter.payerMemberId) items = items.filter((s) => s.fromMemberId === filter.payerMemberId);
    if (filter.receiverMemberId) items = items.filter((s) => s.toMemberId === filter.receiverMemberId);
    if (filter.currencyCode) items = items.filter((s) => s.currencyCode === filter.currencyCode);
    if (filter.method) items = items.filter((s) => s.method === filter.method);
    if (filter.statuses) {
      items = items.filter((s) => filter.statuses!.includes((s.status ?? 'completed') as never));
    } else if (filter.status) {
      items = items.filter((s) => (s.status ?? 'completed') === filter.status);
    }
    return { items, hasMore: false };
  }
  async listPendingConfirmation(
    groupId: GroupId,
    _pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const items = Array.from(this.settlements.values()).filter(
      (s) => s.groupId === groupId && s.status === 'pending_confirmation',
    );
    return { items, hasMore: false };
  }
  async listDisputed(
    groupId: GroupId,
    _pagination: Pagination,
  ): Promise<PaginatedResult<Settlement>> {
    const items = Array.from(this.settlements.values()).filter(
      (s) => s.groupId === groupId && s.status === 'disputed',
    );
    return { items, hasMore: false };
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
    const id = `sh-${settlementId as string}-${transition.newVersion}`;
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
      createdAt: NOW,
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
}

class InMemoryAuditRepository implements AuditRepository {
  readonly entries: AuditLogEntry[] = [];

  async append(
    entry: Omit<AuditLogEntry, 'createdAt'>,
  ): Promise<AuditLogEntry> {
    const full: AuditLogEntry = { ...entry, createdAt: NOW };
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
  async listByActor(): Promise<PaginatedResult<AuditLogEntry>> {
    return { items: this.entries, hasMore: false };
  }
  async listByGroup(): Promise<PaginatedResult<AuditLogEntry>> {
    return { items: this.entries, hasMore: false };
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let idCounter = 0;
const generateIdFn = () => `id-${++idCounter}`;

/** Permission gate stub that always allows. */
const allowGate = async (): Promise<{ allowed: boolean; reason?: string }> => ({
  allowed: true,
});
/** Permission gate stub that always denies. */
const denyGate = async (): Promise<{ allowed: boolean; reason?: string }> => ({
  allowed: false,
  reason: 'admin_required',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Prompt 28: member-linking', () => {
  let memberRepo: InMemoryMemberRepository;
  let expenseRepo: InMemoryExpenseRepository;
  let settlementRepo: InMemorySettlementRepository;
  let auditRepo: InMemoryAuditRepository;

  beforeEach(() => {
    memberRepo = new InMemoryMemberRepository();
    expenseRepo = new InMemoryExpenseRepository();
    settlementRepo = new InMemorySettlementRepository();
    auditRepo = new InMemoryAuditRepository();
    idCounter = 0;
    memberRepo.seed(
      createGroupMember({
        id: OWNER_MEMBER_ID,
        groupId: GROUP_ID,
        userId: OWNER_ID,
        displayName: 'Owner',
        role: 'owner',
        now: NOW,
      }),
    );
  });

  // --------------------------------------------------------------------------
  // FindLinkCandidatesUseCase
  // --------------------------------------------------------------------------

  describe('FindLinkCandidatesUseCase', () => {
    let useCase: FindLinkCandidatesUseCase;

    beforeEach(() => {
      useCase = new FindLinkCandidatesUseCase(memberRepo);
    });

    it('returns a same-name candidate with score 1.0', async () => {
      const a = asMemberId('m-a');
      const b = asMemberId('m-b');
      memberRepo.seed(
        createGroupMember({
          id: a,
          groupId: GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      memberRepo.seed(
        createGroupMember({
          id: b,
          groupId: GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      const result = await useCase.execute({ groupId: GROUP_ID, memberId: a });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.memberId).toBe(b);
      expect(result.candidates[0]?.score).toBe(1);
      expect(result.candidates[0]?.reason).toBe('same_name');
    });

    it('returns a shared-token candidate with score 0.5', async () => {
      const a = asMemberId('m-a');
      const b = asMemberId('m-b');
      memberRepo.seed(
        createGroupMember({
          id: a,
          groupId: GROUP_ID,
          displayName: 'Rahul Kumar',
          role: 'member',
          now: NOW,
        }),
      );
      memberRepo.seed(
        createGroupMember({
          id: b,
          groupId: GROUP_ID,
          displayName: 'Rahul Sharma',
          role: 'member',
          now: NOW,
        }),
      );
      const result = await useCase.execute({ groupId: GROUP_ID, memberId: a });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.score).toBe(0.5);
      expect(result.candidates[0]?.reason).toBe('shared_token');
    });

    it('returns placeholder_target when source has a userId and candidate does not', async () => {
      const a = asMemberId('m-a');
      const b = asMemberId('m-b');
      memberRepo.seed(
        createGroupMember({
          id: a,
          groupId: GROUP_ID,
          userId: asUserId('user-1'),
          displayName: 'Alice',
          role: 'member',
          now: NOW,
        }),
      );
      memberRepo.seed(
        createGroupMember({
          id: b,
          groupId: GROUP_ID,
          displayName: 'Bob',
          role: 'member',
          now: NOW,
        }),
      );
      const result = await useCase.execute({ groupId: GROUP_ID, memberId: a });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.reason).toBe('placeholder_target');
      expect(result.candidates[0]?.score).toBe(0.3);
    });

    it('returns no candidates from a different group', async () => {
      const a = asMemberId('m-a');
      memberRepo.seed(
        createGroupMember({
          id: a,
          groupId: OTHER_GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      const result = await useCase.execute({ groupId: GROUP_ID, memberId: a });
      expect(result.candidates).toEqual([]);
    });

    it('excludes left members from candidates', async () => {
      const a = asMemberId('m-a');
      const b = asMemberId('m-b');
      const bMember = createGroupMember({
        id: b,
        groupId: GROUP_ID,
        displayName: 'Rahul',
        role: 'member',
        now: NOW,
      });
      memberRepo.seed(
        leaveGroup(bMember, { expectedVersion: bMember.version, now: NOW }),
      );
      memberRepo.seed(
        createGroupMember({
          id: a,
          groupId: GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      const result = await useCase.execute({ groupId: GROUP_ID, memberId: a });
      expect(result.candidates).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // PreviewLinkImpactUseCase
  // --------------------------------------------------------------------------

  describe('PreviewLinkImpactUseCase', () => {
    let useCase: PreviewLinkImpactUseCase;

    beforeEach(() => {
      useCase = new PreviewLinkImpactUseCase(
        memberRepo,
        expenseRepo,
        settlementRepo,
        auditRepo,
      );
    });

    it('counts expenses as payer + participant and returns historical names', async () => {
      const a = asMemberId('m-a');
      const b = asMemberId('m-b');
      memberRepo.seed(
        createGroupMember({
          id: a,
          groupId: GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      memberRepo.seed(
        createGroupMember({
          id: b,
          groupId: GROUP_ID,
          displayName: 'Rahul K',
          role: 'member',
          now: NOW,
        }),
      );

      // Expense where `a` is payer and `b` is a participant.
      const expenseId = asExpenseId('exp-1');
      const expense: Expense = {
        id: expenseId,
        groupId: GROUP_ID,
        title: 'Dinner',
        amountMinor: 1000,
        currencyCode: 'INR' as Expense['currencyCode'],
        expenseDate: NOW,
        splitType: 'equal',
        createdBy: OWNER_ID,
        createdAt: NOW,
        updatedAt: NOW,
        version: asVersionNumber(1),
      };
      const payers: readonly ExpensePayer[] = [
        createExpensePayer({
          id: 'p-1' as never,
          expenseId,
          memberId: a,
          amountMinor: 1000,
        }),
      ];
      const splits: readonly ExpenseSplit[] = [
        createExpenseSplit({
          id: 's-1' as never,
          expenseId,
          memberId: b,
          amountMinor: 500,
        }),
        createExpenseSplit({
          id: 's-2' as never,
          expenseId,
          memberId: a,
          amountMinor: 500,
        }),
      ];
      expenseRepo.seedExpense(expense, payers, splits);

      const result = await useCase.execute({
        sourceMemberId: a,
        targetMemberId: b,
      });

      expect(result.source.expenseCountAsPayer).toBe(1);
      expect(result.source.expenseCountAsParticipant).toBe(1);
      expect(result.target.expenseCountAsPayer).toBe(0);
      expect(result.target.expenseCountAsParticipant).toBe(1);
      // Balance is unchanged (preview returns 0).
      expect(result.source.balanceMinor).toBe(0);
      expect(result.target.balanceMinor).toBe(0);
      expect(result.totalHistoricalReferencesPreserved).toBe(3);
      // Both members' display names should be in historical names.
      expect(result.source.historicalNames).toContain('Rahul');
      expect(result.target.historicalNames).toContain('Rahul K');
    });

    it('counts settlements sent and received', async () => {
      const a = asMemberId('m-a');
      const b = asMemberId('m-b');
      memberRepo.seed(
        createGroupMember({
          id: a,
          groupId: GROUP_ID,
          displayName: 'A',
          role: 'member',
          now: NOW,
        }),
      );
      memberRepo.seed(
        createGroupMember({
          id: b,
          groupId: GROUP_ID,
          displayName: 'B',
          role: 'member',
          now: NOW,
        }),
      );
      const settlement: Settlement = createSettlement({
        id: asSettlementId('set-1'),
        groupId: GROUP_ID,
        fromMemberId: a,
        toMemberId: b,
        amountMinor: 200,
        currencyCode: 'INR',
        method: 'cash',
        createdBy: OWNER_ID,
        now: NOW,
      });
      settlementRepo.seed(settlement);

      const result = await useCase.execute({
        sourceMemberId: a,
        targetMemberId: b,
      });
      expect(result.source.settlementCountSent).toBe(1);
      expect(result.target.settlementCountReceived).toBe(1);
    });

    it('rejects cross-group previews', async () => {
      const a = asMemberId('m-a');
      const b = asMemberId('m-b');
      memberRepo.seed(
        createGroupMember({
          id: a,
          groupId: GROUP_ID,
          displayName: 'A',
          role: 'member',
          now: NOW,
        }),
      );
      memberRepo.seed(
        createGroupMember({
          id: b,
          groupId: OTHER_GROUP_ID,
          displayName: 'A',
          role: 'member',
          now: NOW,
        }),
      );
      await expect(
        useCase.execute({ sourceMemberId: a, targetMemberId: b }),
      ).rejects.toThrow(/Cross-group/i);
    });

    it('rejects previewing a member against itself', async () => {
      const a = asMemberId('m-a');
      memberRepo.seed(
        createGroupMember({
          id: a,
          groupId: GROUP_ID,
          displayName: 'A',
          role: 'member',
          now: NOW,
        }),
      );
      await expect(
        useCase.execute({ sourceMemberId: a, targetMemberId: a }),
      ).rejects.toThrow(/must differ/i);
    });
  });

  // --------------------------------------------------------------------------
  // LinkMembershipToProfileUseCase
  // --------------------------------------------------------------------------

  describe('LinkMembershipToProfileUseCase', () => {
    let useCase: LinkMembershipToProfileUseCase;

    beforeEach(() => {
      useCase = new LinkMembershipToProfileUseCase(
        memberRepo,
        auditRepo,
        generateIdFn,
        allowGate,
      );
    });

    it('links a placeholder to a profile, preserving the member id', async () => {
      const placeholderId = asMemberId('m-placeholder');
      memberRepo.seed(
        createGroupMember({
          id: placeholderId,
          groupId: GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      const result = await useCase.execute({
        placeholderMemberId: placeholderId,
        userId: asUserId('user-rahul'),
        actorMemberId: OWNER_MEMBER_ID,
      });
      expect(result.member.id).toBe(placeholderId);
      expect(result.member.userId as string).toBe('user-rahul');
      expect(result.previousDisplayName).toBe('Rahul');

      const stored = await memberRepo.findById(placeholderId);
      expect(stored?.userId as string).toBe('user-rahul');

      // Audit captures before/after + proves history preserved.
      const entry = auditRepo.entries[0]!;
      expect(entry.changeSummary).toMatchObject({
        action_type: 'link_membership_to_profile',
        memberIdPreserved: true,
        balancesRecomputed: false,
        historicalExpensesRewritten: false,
      });
    });

    it('rejects linking a member that is already linked', async () => {
      const mId = asMemberId('m-already');
      memberRepo.seed(
        createGroupMember({
          id: mId,
          groupId: GROUP_ID,
          userId: asUserId('user-1'),
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      await expect(
        useCase.execute({
          placeholderMemberId: mId,
          userId: asUserId('user-2'),
          actorMemberId: OWNER_MEMBER_ID,
        }),
      ).rejects.toThrow(/already linked/i);
    });

    it('rejects cross-group linking (actor in a different group)', async () => {
      const placeholderId = asMemberId('m-placeholder');
      const actorId = asMemberId('m-actor-other');
      memberRepo.seed(
        createGroupMember({
          id: placeholderId,
          groupId: GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      memberRepo.seed(
        createGroupMember({
          id: actorId,
          groupId: OTHER_GROUP_ID,
          userId: asUserId('user-other'),
          displayName: 'Other Owner',
          role: 'owner',
          now: NOW,
        }),
      );
      await expect(
        useCase.execute({
          placeholderMemberId: placeholderId,
          userId: asUserId('user-1'),
          actorMemberId: actorId,
        }),
      ).rejects.toThrow(/Cross-group/i);
    });

    it('rejects when the permission gate denies the action', async () => {
      const deniedUseCase = new LinkMembershipToProfileUseCase(
        memberRepo,
        auditRepo,
        generateIdFn,
        denyGate,
      );
      const placeholderId = asMemberId('m-placeholder');
      memberRepo.seed(
        createGroupMember({
          id: placeholderId,
          groupId: GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      await expect(
        deniedUseCase.execute({
          placeholderMemberId: placeholderId,
          userId: asUserId('user-1'),
          actorMemberId: OWNER_MEMBER_ID,
        }),
      ).rejects.toThrow(/not permitted/i);
    });
  });

  // --------------------------------------------------------------------------
  // ResolveDuplicateMembersUseCase
  // --------------------------------------------------------------------------

  describe('ResolveDuplicateMembersUseCase', () => {
    let useCase: ResolveDuplicateMembersUseCase;

    beforeEach(() => {
      useCase = new ResolveDuplicateMembersUseCase(
        memberRepo,
        auditRepo,
        generateIdFn,
        allowGate,
      );
    });

    it('keep_both records a no-op audit entry', async () => {
      const a = asMemberId('m-a');
      const b = asMemberId('m-b');
      memberRepo.seed(
        createGroupMember({
          id: a,
          groupId: GROUP_ID,
          userId: asUserId('user-a'),
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      memberRepo.seed(
        createGroupMember({
          id: b,
          groupId: GROUP_ID,
          userId: asUserId('user-b'),
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      const result = await useCase.execute({
        strategy: 'keep_both',
        sourceMemberId: a,
        targetMemberId: b,
        actorMemberId: OWNER_MEMBER_ID,
      });
      expect(result.strategy).toBe('keep_both');
      expect(result.survivingMemberId).toBe(b);
      // Both members remain active.
      const storedA = await memberRepo.findById(a);
      const storedB = await memberRepo.findById(b);
      expect(storedA?.leftAt).toBeUndefined();
      expect(storedB?.leftAt).toBeUndefined();
      // Audit entry recorded.
      const entry = auditRepo.entries[0]!;
      expect(entry.changeSummary).toMatchObject({
        action_type: 'resolve_duplicate_keep_both',
      });
    });

    it('transfer_active_identity requires confirmFinancialImpact', async () => {
      const source = asMemberId('m-source');
      const target = asMemberId('m-target');
      memberRepo.seed(
        createGroupMember({
          id: source,
          groupId: GROUP_ID,
          userId: asUserId('user-source'),
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      memberRepo.seed(
        createGroupMember({
          id: target,
          groupId: GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      await expect(
        useCase.execute({
          strategy: 'transfer_active_identity',
          sourceMemberId: source,
          targetMemberId: target,
          userId: asUserId('user-source'),
          actorMemberId: OWNER_MEMBER_ID,
          // confirmFinancialImpact omitted
        }),
      ).rejects.toThrow(/confirmFinancialImpact/i);
    });

    it('transfer_active_identity moves the userId and marks source as left', async () => {
      const source = asMemberId('m-source');
      const target = asMemberId('m-target');
      memberRepo.seed(
        createGroupMember({
          id: source,
          groupId: GROUP_ID,
          userId: asUserId('user-source'),
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      memberRepo.seed(
        createGroupMember({
          id: target,
          groupId: GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      const result = await useCase.execute({
        strategy: 'transfer_active_identity',
        sourceMemberId: source,
        targetMemberId: target,
        userId: asUserId('user-source'),
        actorMemberId: OWNER_MEMBER_ID,
        confirmFinancialImpact: true,
      });
      expect(result.survivingMemberId).toBe(target);

      const storedSource = await memberRepo.findById(source);
      const storedTarget = await memberRepo.findById(target);
      expect(storedSource?.leftAt).toBeDefined();
      expect(storedTarget?.userId as string).toBe('user-source');
      // Source member id preserved (not deleted).
      expect(storedSource).toBeDefined();
    });

    it('link_identity_only delegates to LinkMembershipToProfileUseCase', async () => {
      const placeholder = asMemberId('m-placeholder');
      memberRepo.seed(
        createGroupMember({
          id: placeholder,
          groupId: GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      const result = await useCase.execute({
        strategy: 'link_identity_only',
        sourceMemberId: placeholder,
        targetMemberId: placeholder,
        userId: asUserId('user-1'),
        actorMemberId: OWNER_MEMBER_ID,
      });
      expect(result.strategy).toBe('link_identity_only');
      const stored = await memberRepo.findById(placeholder);
      expect(stored?.userId as string).toBe('user-1');
    });
  });

  // --------------------------------------------------------------------------
  // UnlinkIncorrectIdentityUseCase
  // --------------------------------------------------------------------------

  describe('UnlinkIncorrectIdentityUseCase', () => {
    let useCase: UnlinkIncorrectIdentityUseCase;

    beforeEach(() => {
      useCase = new UnlinkIncorrectIdentityUseCase(
        memberRepo,
        auditRepo,
        generateIdFn,
        allowGate,
      );
    });

    it('reverses a link by clearing userId, preserving audit history', async () => {
      const mId = asMemberId('m-linked');
      memberRepo.seed(
        createGroupMember({
          id: mId,
          groupId: GROUP_ID,
          userId: asUserId('user-1'),
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      // Pre-existing link audit entry that should NOT be deleted.
      await auditRepo.append({
        id: 'audit-1',
        entityType: 'group_member',
        entityId: mId as string,
        action: 'update',
        changeSummary: { action_type: 'link_membership_to_profile' },
        newVersion: 2,
      });

      const result = await useCase.execute({
        memberId: mId,
        actorMemberId: OWNER_MEMBER_ID,
        reason: 'wrong profile',
      });

      expect(result.member.userId).toBeUndefined();
      expect(result.previousUserId).toBe('user-1');

      // Two audit entries now: the original link + the unlink.
      expect(auditRepo.entries).toHaveLength(2);
      const unlinkEntry = auditRepo.entries[1]!;
      expect(unlinkEntry.changeSummary).toMatchObject({
        action_type: 'unlink_membership_from_profile',
        linkHistoryDeleted: false,
        memberIdPreserved: true,
      });
    });

    it('rejects unlinking a member that is not currently linked', async () => {
      const mId = asMemberId('m-unlinked');
      memberRepo.seed(
        createGroupMember({
          id: mId,
          groupId: GROUP_ID,
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      await expect(
        useCase.execute({
          memberId: mId,
          actorMemberId: OWNER_MEMBER_ID,
        }),
      ).rejects.toThrow(/not currently linked/i);
    });

    it('rejects unlinking the owner (must transfer ownership first)', async () => {
      await expect(
        useCase.execute({
          memberId: OWNER_MEMBER_ID,
          actorMemberId: OWNER_MEMBER_ID,
        }),
      ).rejects.toThrow(/owner/i);
    });

    it('rejects when the permission gate denies the action', async () => {
      const deniedUseCase = new UnlinkIncorrectIdentityUseCase(
        memberRepo,
        auditRepo,
        generateIdFn,
        denyGate,
      );
      const mId = asMemberId('m-linked');
      memberRepo.seed(
        createGroupMember({
          id: mId,
          groupId: GROUP_ID,
          userId: asUserId('user-1'),
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      await expect(
        deniedUseCase.execute({
          memberId: mId,
          actorMemberId: OWNER_MEMBER_ID,
        }),
      ).rejects.toThrow(/not permitted/i);
    });
  });
});
