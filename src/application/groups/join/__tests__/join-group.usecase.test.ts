/**
 * JoinGroupUseCase unit tests — Phase 3 Prompt 27.
 *
 * Exercises every join outcome variant:
 *
 *   - create_new_membership (guest + authenticated)
 *   - already_member (authenticated profile + guest with same name as linked)
 *   - requires_member_selection (guest name matches a placeholder)
 *   - link_existing_membership (historical membership with same userId/name)
 *   - invite_invalid with reason 'offline' (token not found locally)
 *   - invite_invalid with reason 'expired' / 'revoked' / 'exhausted'
 *   - repeated accept request returns already_member
 *
 * Plus the ResolvePlaceholderMemberUseCase happy-path: linking preserves
 * the placeholder's member id and records an audit entry containing the
 * previous display name.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { asGroupId, createGroup, type Group } from '@domain/entities/group';
import {
  asInviteId,
  createGroupInvite,
  type GroupInvite,
} from '@domain/entities/group-invite';
import {
  asMemberId,
  createGroupMember,
  type GroupMember,
  leaveGroup,
} from '@domain/entities/group-member';
import { asUserId } from '@domain/entities/user';
import { InvalidEntityError } from '@domain/errors';
import type {
  AuditLogEntry,
  AuditRepository,
} from '@domain/repositories/audit.repository';
import type { GroupInviteRepository } from '@domain/repositories/group-invite.repository';
import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import { asDateTime, asVersionNumber } from '@domain/value-objects';
import type {
  GroupId,
  InviteId,
  InviteToken,
  MemberId,
  UserId,
} from '@shared-types/index';

import { JoinGroupUseCase } from '../join-group.usecase';
import { ResolvePlaceholderMemberUseCase } from '../resolve-placeholder-member.usecase';

// ---------------------------------------------------------------------------
// In-memory test doubles
// ---------------------------------------------------------------------------

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const OWNER_ID = asUserId('user-owner');
const GROUP_ID = asGroupId('group-1');
const OWNER_MEMBER_ID = asMemberId('member-owner');

const TEST_TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const hashFn = (input: string): string => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- node builtin in a jest test
  const { createHash } = require('crypto') as {
    createHash: (alg: string) => {
      update: (s: string) => { digest: (enc: string) => string };
    };
  };
  return createHash('sha256').update(input).digest('hex');
};

class InMemoryGroupRepository {
  private readonly groups = new Map<string, Group>();

  seed(group: Group): void {
    this.groups.set(group.id as string, group);
  }

  async findById(id: GroupId): Promise<Group | null> {
    return this.groups.get(id as string) ?? null;
  }
  async save(group: Group): Promise<void> {
    this.groups.set(group.id as string, group);
  }
  async softDelete(): Promise<SoftDeleteResult> {
    return { id: 'g', deletedAt: NOW, version: asVersionNumber(2) };
  }
  async listByUser(): Promise<PaginatedResult<Group>> {
    return { items: Array.from(this.groups.values()), hasMore: false };
  }
  async listByCurrency(): Promise<PaginatedResult<Group>> {
    return { items: Array.from(this.groups.values()), hasMore: false };
  }
}

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
      if (m.groupId === groupId && m.leftAt === undefined) {
        out.push(m);
      }
    }
    return out;
  }
  async listAllByGroup(
    groupId: GroupId,
    _pagination: Pagination,
  ): Promise<PaginatedResult<GroupMember>> {
    const items = Array.from(this.members.values()).filter(
      (m) => m.groupId === groupId,
    );
    return { items, hasMore: false };
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

class InMemoryInviteRepository implements GroupInviteRepository {
  private readonly invites = new Map<string, GroupInvite>();

  seed(invite: GroupInvite): void {
    this.invites.set(invite.id as string, invite);
  }

  async findById(id: InviteId): Promise<GroupInvite | null> {
    return this.invites.get(id as string) ?? null;
  }
  async findByToken(token: InviteToken): Promise<GroupInvite | null> {
    for (const i of this.invites.values()) {
      if (i.token === token) return i;
    }
    return null;
  }
  async findByTokenHash(tokenHash: string): Promise<GroupInvite | null> {
    for (const i of this.invites.values()) {
      if (i.tokenHash === tokenHash) return i;
    }
    return null;
  }
  async listPendingByGroup(groupId: GroupId): Promise<readonly GroupInvite[]> {
    return Array.from(this.invites.values()).filter(
      (i) => i.groupId === groupId && i.status === 'pending',
    );
  }
  async listByGroup(groupId: GroupId): Promise<readonly GroupInvite[]> {
    return Array.from(this.invites.values()).filter(
      (i) => i.groupId === groupId,
    );
  }
  async save(invite: GroupInvite): Promise<void> {
    this.invites.set(invite.id as string, invite);
  }
  async accept(
    id: InviteId,
    acceptingMemberId: MemberId,
  ): Promise<GroupInvite> {
    const current = this.invites.get(id as string);
    if (!current) throw new Error(`Invite ${id} not found`);
    const next: GroupInvite = {
      ...current,
      status: 'accepted',
      acceptedByMemberId: acceptingMemberId,
      acceptedAt: NOW,
      version: asVersionNumber((current.version as number) + 1),
    };
    this.invites.set(id as string, next);
    return next;
  }
  async revoke(id: InviteId): Promise<GroupInvite> {
    const current = this.invites.get(id as string);
    if (!current) throw new Error(`Invite ${id} not found`);
    const next: GroupInvite = {
      ...current,
      status: 'revoked',
      revokedAt: NOW,
      version: asVersionNumber((current.version as number) + 1),
    };
    this.invites.set(id as string, next);
    return next;
  }
  async hardDelete(
    _id: InviteId,
    _metadata: DeleteMetadata,
  ): Promise<SoftDeleteResult> {
    return { id: 'i', deletedAt: NOW, version: asVersionNumber(2) };
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
  async listByEntity(): Promise<readonly AuditLogEntry[]> {
    return this.entries;
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

function makeGroup(): Group {
  return createGroup({
    id: GROUP_ID,
    name: 'Goa Trip',
    currencyCode: 'INR',
    createdBy: OWNER_ID,
    now: NOW,
  });
}

function makeOwner(): GroupMember {
  return createGroupMember({
    id: OWNER_MEMBER_ID,
    groupId: GROUP_ID,
    userId: OWNER_ID,
    displayName: 'Owner',
    role: 'owner',
    now: NOW,
  });
}

function makeInvite(overrides?: Partial<GroupInvite>): GroupInvite {
  return createGroupInvite({
    id: overrides?.id ?? asInviteId('invite-1'),
    groupId: GROUP_ID,
    token: TEST_TOKEN,
    tokenHash: hashFn(TEST_TOKEN),
    inviterMemberId: OWNER_MEMBER_ID,
    expiresInDays: 7,
    intendedRole: overrides?.intendedRole ?? 'member',
    maxUses: overrides?.maxUses ?? 1,
    now: NOW,
  });
}

let idCounter = 0;
const generateIdFn = () => `id-${++idCounter}`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Prompt 27: join-group + placeholder resolution', () => {
  let groupRepo: InMemoryGroupRepository;
  let memberRepo: InMemoryMemberRepository;
  let inviteRepo: InMemoryInviteRepository;
  let auditRepo: InMemoryAuditRepository;

  beforeEach(() => {
    groupRepo = new InMemoryGroupRepository();
    memberRepo = new InMemoryMemberRepository();
    inviteRepo = new InMemoryInviteRepository();
    auditRepo = new InMemoryAuditRepository();
    idCounter = 0;

    groupRepo.seed(makeGroup());
    memberRepo.seed(makeOwner());
  });

  // --------------------------------------------------------------------------
  // JoinGroupUseCase — happy paths
  // --------------------------------------------------------------------------

  describe('JoinGroupUseCase', () => {
    let useCase: JoinGroupUseCase;

    beforeEach(() => {
      useCase = new JoinGroupUseCase(
        groupRepo,
        memberRepo,
        inviteRepo,
        auditRepo,
        hashFn,
        generateIdFn,
      );
    });

    it('creates a new membership for a guest with no duplicates', async () => {
      inviteRepo.seed(makeInvite());
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'Sravan' },
        now: NOW,
      });
      expect(result.outcome).toBe('create_new_membership');
      expect(result.memberId).toBeDefined();
      const member = await memberRepo.findById(result.memberId!);
      expect(member?.displayName as string).toBe('Sravan');
      expect(member?.role).toBe('member');
      expect(member?.userId).toBeUndefined();
      // Audit entry written.
      expect(auditRepo.entries).toHaveLength(1);
      expect(auditRepo.entries[0]?.action).toBe('create');
      // SECURITY: plain token not in audit log.
      expect(JSON.stringify(auditRepo.entries)).not.toContain(TEST_TOKEN);
    });

    it('creates a new membership for an authenticated user with no duplicates', async () => {
      inviteRepo.seed(makeInvite());
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { userId: asUserId('user-new') },
        now: NOW,
      });
      expect(result.outcome).toBe('create_new_membership');
      const member = await memberRepo.findById(result.memberId!);
      expect(member?.userId as string).toBe('user-new');
    });

    it('honours the intendedRole=admin from the invite', async () => {
      inviteRepo.seed(makeInvite({ intendedRole: 'admin' }));
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'CoOrg' },
        now: NOW,
      });
      const member = await memberRepo.findById(result.memberId!);
      expect(member?.role).toBe('admin');
    });

    it('returns already_member when the same authenticated profile is already active', async () => {
      inviteRepo.seed(makeInvite());
      const existingId = asMemberId('m-existing');
      memberRepo.seed(
        createGroupMember({
          id: existingId,
          groupId: GROUP_ID,
          userId: asUserId('user-1'),
          displayName: 'Existing',
          role: 'member',
          now: NOW,
        }),
      );
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { userId: asUserId('user-1') },
        now: NOW,
      });
      expect(result.outcome).toBe('already_member');
      expect(result.memberId).toBe(existingId);
    });

    it('returns already_member when a guest name matches an already-linked active member', async () => {
      inviteRepo.seed(makeInvite());
      const existingId = asMemberId('m-existing');
      memberRepo.seed(
        createGroupMember({
          id: existingId,
          groupId: GROUP_ID,
          userId: asUserId('user-1'),
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'Rahul' },
        now: NOW,
      });
      expect(result.outcome).toBe('already_member');
      expect(result.memberId).toBe(existingId);
    });

    it('returns requires_member_selection when a guest name matches an unlinked placeholder', async () => {
      inviteRepo.seed(makeInvite());
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
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'Rahul' },
        now: NOW,
      });
      expect(result.outcome).toBe('requires_member_selection');
      expect(result.placeholderCandidates).toEqual([placeholderId]);
    });

    it('returns link_existing_membership when the same guest name matches a removed member', async () => {
      inviteRepo.seed(makeInvite());
      const removedId = asMemberId('m-removed');
      const removed = createGroupMember({
        id: removedId,
        groupId: GROUP_ID,
        displayName: 'Rahul',
        role: 'member',
        now: NOW,
      });
      memberRepo.seed(
        leaveGroup(removed, { expectedVersion: removed.version, now: NOW }),
      );
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'Rahul' },
        now: NOW,
      });
      expect(result.outcome).toBe('link_existing_membership');
      expect(result.historicalMemberId).toBe(removedId);
    });

    it('returns link_existing_membership when an authenticated user matches a removed member by userId', async () => {
      inviteRepo.seed(makeInvite());
      const removedId = asMemberId('m-removed');
      const removed = createGroupMember({
        id: removedId,
        groupId: GROUP_ID,
        userId: asUserId('user-removed'),
        displayName: 'Rahul',
        role: 'member',
        now: NOW,
      });
      memberRepo.seed(
        leaveGroup(removed, { expectedVersion: removed.version, now: NOW }),
      );
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { userId: asUserId('user-removed') },
        now: NOW,
      });
      expect(result.outcome).toBe('link_existing_membership');
      expect(result.historicalMemberId).toBe(removedId);
    });

    it('repeated join request returns already_member (idempotent)', async () => {
      inviteRepo.seed(makeInvite());
      const userId = asUserId('user-new');
      const first = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { userId },
        now: NOW,
      });
      expect(first.outcome).toBe('create_new_membership');
      // Second request: the invite has been accepted (single-use) AND the
      // user is now an active member. The duplicate-membership check wins
      // before the invite-status check (active membership is checked first
      // in step 3a), so we get `already_member`.
      const second = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { userId },
        now: NOW,
      });
      expect(second.outcome).toBe('already_member');
      expect(second.memberId).toBe(first.memberId);
    });
  });

  // --------------------------------------------------------------------------
  // JoinGroupUseCase — failure modes
  // --------------------------------------------------------------------------

  describe('JoinGroupUseCase failure modes', () => {
    let useCase: JoinGroupUseCase;

    beforeEach(() => {
      useCase = new JoinGroupUseCase(
        groupRepo,
        memberRepo,
        inviteRepo,
        auditRepo,
        hashFn,
        generateIdFn,
      );
    });

    it('returns invite_invalid:offline when the invite is not present locally', async () => {
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'Sravan' },
        now: NOW,
      });
      expect(result.outcome).toBe('invite_invalid');
      expect(result.invalidReason).toBe('offline');
    });

    it('returns invite_invalid:invalid_token for too-short tokens', async () => {
      const result = await useCase.execute({
        inviteToken: 'short',
        currentIdentity: { guestDisplayName: 'Sravan' },
        now: NOW,
      });
      expect(result.outcome).toBe('invite_invalid');
      expect(result.invalidReason).toBe('invalid_token');
    });

    it('returns invite_invalid:revoked for a revoked invite', async () => {
      const invite = makeInvite();
      inviteRepo.seed({ ...invite, status: 'revoked', revokedAt: NOW });
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'Sravan' },
        now: NOW,
      });
      expect(result.outcome).toBe('invite_invalid');
      expect(result.invalidReason).toBe('revoked');
    });

    it('returns invite_invalid:expired for an expired invite', async () => {
      inviteRepo.seed({
        ...makeInvite(),
        expiresAt: asDateTime('2020-01-01T00:00:00.000Z'),
      });
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'Sravan' },
        now: NOW,
      });
      expect(result.outcome).toBe('invite_invalid');
      expect(result.invalidReason).toBe('expired');
    });

    it('returns invite_invalid:exhausted for an already-accepted single-use invite', async () => {
      const invite = makeInvite();
      inviteRepo.seed({
        ...invite,
        status: 'accepted',
        acceptedByMemberId: asMemberId('m-other'),
        acceptedAt: NOW,
        useCount: 1,
      });
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'Sravan' },
        now: NOW,
      });
      expect(result.outcome).toBe('invite_invalid');
      expect(result.invalidReason).toBe('exhausted');
    });

    it('returns invite_invalid:group_archived when the group is soft-deleted', async () => {
      inviteRepo.seed(makeInvite());
      const archived = await groupRepo.findById(GROUP_ID);
      if (!archived) throw new Error('test setup failed');
      groupRepo.seed({ ...archived, deletedAt: NOW });
      const result = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'Sravan' },
        now: NOW,
      });
      expect(result.outcome).toBe('invite_invalid');
      expect(result.invalidReason).toBe('group_archived');
    });

    it('falls back to findByToken when findByTokenHash throws', async () => {
      inviteRepo.seed(makeInvite());
      const throwingHashRepo: GroupInviteRepository = {
        findById: (id) => inviteRepo.findById(id),
        findByToken: (t) => inviteRepo.findByToken(t),
        async findByTokenHash() {
          throw new Error('not implemented');
        },
        listPendingByGroup: (g) => inviteRepo.listPendingByGroup(g),
        listByGroup: (g) => inviteRepo.listByGroup(g),
        save: (i) => inviteRepo.save(i),
        accept: (id, m) => inviteRepo.accept(id, m),
        revoke: (id) => inviteRepo.revoke(id),
        hardDelete: (id, m) => inviteRepo.hardDelete(id, m),
      };
      const fallbackUseCase = new JoinGroupUseCase(
        groupRepo,
        memberRepo,
        throwingHashRepo,
        auditRepo,
        hashFn,
        generateIdFn,
      );
      const result = await fallbackUseCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'Sravan' },
        now: NOW,
      });
      expect(result.outcome).toBe('create_new_membership');
    });

    it('multi-use invite increments useCount instead of transitioning to accepted', async () => {
      const multiUse = makeInvite({ maxUses: 3 });
      inviteRepo.seed(multiUse);
      const r1 = await useCase.execute({
        inviteToken: TEST_TOKEN,
        currentIdentity: { guestDisplayName: 'User1' },
        now: NOW,
      });
      expect(r1.outcome).toBe('create_new_membership');
      const stored = await inviteRepo.findById(multiUse.id);
      expect(stored?.useCount).toBe(1);
      expect(stored?.status).toBe('pending');
    });
  });

  // --------------------------------------------------------------------------
  // ResolvePlaceholderMemberUseCase
  // --------------------------------------------------------------------------

  describe('ResolvePlaceholderMemberUseCase', () => {
    let useCase: ResolvePlaceholderMemberUseCase;

    beforeEach(() => {
      useCase = new ResolvePlaceholderMemberUseCase(
        memberRepo,
        auditRepo,
        generateIdFn,
      );
    });

    it('links a placeholder to a profile, preserving the member id and recording the previous name', async () => {
      const placeholderId = asMemberId('m-placeholder');
      const placeholder = createGroupMember({
        id: placeholderId,
        groupId: GROUP_ID,
        displayName: 'Rahul',
        role: 'member',
        now: NOW,
      });
      memberRepo.seed(placeholder);

      const result = await useCase.execute({
        placeholderMemberId: placeholderId,
        userId: asUserId('user-rahul'),
        newDisplayName: 'Rahul K',
        confirmedCandidateIds: [placeholderId],
      });

      expect(result.previousDisplayName).toBe('Rahul');
      expect(result.member.id).toBe(placeholderId); // id preserved
      expect(result.member.userId as string).toBe('user-rahul');
      expect(result.member.displayName as string).toBe('Rahul K');

      const stored = await memberRepo.findById(placeholderId);
      expect(stored?.userId as string).toBe('user-rahul');

      // Audit captures before/after identity mapping.
      expect(auditRepo.entries).toHaveLength(1);
      const entry = auditRepo.entries[0]!;
      expect(entry.action).toBe('update');
      expect(entry.changeSummary).toMatchObject({
        action_type: 'link_placeholder_to_profile',
        memberIdPreserved: true,
        previous: { userId: null, displayName: 'Rahul' },
        next: { userId: 'user-rahul', displayName: 'Rahul K' },
      });
    });

    it('rejects linking without explicit confirmation (candidate not in confirmed list)', async () => {
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
        useCase.execute({
          placeholderMemberId: placeholderId,
          userId: asUserId('user-rahul'),
          // confirmed list does NOT include placeholderId
          confirmedCandidateIds: [asMemberId('m-other')],
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('rejects linking a placeholder that has already left the group', async () => {
      const placeholderId = asMemberId('m-placeholder');
      const placeholder = createGroupMember({
        id: placeholderId,
        groupId: GROUP_ID,
        displayName: 'Rahul',
        role: 'member',
        now: NOW,
      });
      memberRepo.seed(
        leaveGroup(placeholder, { expectedVersion: placeholder.version, now: NOW }),
      );
      await expect(
        useCase.execute({
          placeholderMemberId: placeholderId,
          userId: asUserId('user-rahul'),
          confirmedCandidateIds: [placeholderId],
        }),
      ).rejects.toThrow();
    });

    it('rejects linking a placeholder that is already linked to a profile', async () => {
      const placeholderId = asMemberId('m-placeholder');
      memberRepo.seed(
        createGroupMember({
          id: placeholderId,
          groupId: GROUP_ID,
          userId: asUserId('user-already'),
          displayName: 'Rahul',
          role: 'member',
          now: NOW,
        }),
      );
      await expect(
        useCase.execute({
          placeholderMemberId: placeholderId,
          userId: asUserId('user-other'),
          confirmedCandidateIds: [placeholderId],
        }),
      ).rejects.toThrow(/already linked/i);
    });
  });
});
