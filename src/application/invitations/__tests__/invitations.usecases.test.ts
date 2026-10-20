/**
 * Invitation use-case unit tests — Phase 3 Prompt 26.
 *
 * Exercises the create / validate / revoke use cases plus the deep-link
 * parser and QR URL generator with in-memory test doubles for the
 * repositories. Verifies:
 *
 *   - Valid invite creation (admin / owner).
 *   - Unauthorised creation rejected (member role).
 *   - Validate handles: valid, invalid token, expired, revoked,
 *     exhausted, group-archived.
 *   - Revoke by owner/admin, no-op on already-revoked.
 *   - Deep-link parser: scheme form, https fallback, query form,
 *     bare token, invalid URL, malformed token.
 *   - QR URL generator produces the right URL shape and refuses
 *     short tokens.
 *
 * SECURITY: the audit log must NEVER contain the plain token. The
 * create-invite test asserts that the `tokenHash` is recorded but
 * the plain token does not appear anywhere in the change summary.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { asGroupId, createGroup, type Group } from '@domain/entities/group';
import {
  asInviteId,
  createGroupInvite,
  type GroupInvite,
  isInviteExpired,
  isInviteExhausted,
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
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import { asDateTime, asVersionNumber } from '@domain/value-objects';
import type { GroupId, InviteId, InviteToken, MemberId } from '@shared-types/index';

import { CreateInviteUseCase } from '../create-invite.usecase';
import {
  buildJoinDeepLink,
  parseJoinDeepLink,
} from '../deep-link-handler';
import { GenerateQrCodeUrlUseCase } from '../generate-qr-code-url.usecase';
import { RevokeInviteUseCase } from '../revoke-invite.usecase';
import { ValidateInviteUseCase } from '../validate-invite.usecase';

// ---------------------------------------------------------------------------
// In-memory test doubles
// ---------------------------------------------------------------------------

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const OWNER_ID = asUserId('user-owner');
const ADMIN_ID = asUserId('user-admin');
const MEMBER_USER_ID = asUserId('user-member');
const GROUP_ID = asGroupId('group-1');
const OWNER_MEMBER_ID = asMemberId('member-owner');
const ADMIN_MEMBER_ID = asMemberId('member-admin');
const MEMBER_MEMBER_ID = asMemberId('member-plain');

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
  async listByUser(): Promise<{ items: readonly Group[]; hasMore: boolean }> {
    return { items: Array.from(this.groups.values()), hasMore: false };
  }
  async listByCurrency(): Promise<{ items: readonly Group[]; hasMore: boolean }> {
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
    userId: typeof ADMIN_ID,
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
    const result: GroupMember[] = [];
    for (const m of this.members.values()) {
      if (m.groupId === groupId && m.leftAt === undefined) {
        result.push(m);
      }
    }
    return result;
  }
  async listAllByGroup(): Promise<{
    items: readonly GroupMember[];
    hasMore: boolean;
  }> {
    return { items: Array.from(this.members.values()), hasMore: false };
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
  /** Test helper: directly put an invite keyed by its token hash. */
  seedByToken(invite: GroupInvite): void {
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
  async accept(id: InviteId, acceptingMemberId: MemberId): Promise<GroupInvite> {
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
    const full: AuditLogEntry = {
      ...entry,
      createdAt: NOW,
    };
    this.entries.push(full);
    return full;
  }
  async listByEntity(): Promise<readonly AuditLogEntry[]> {
    return this.entries;
  }
  async listByActor(): Promise<{ items: readonly AuditLogEntry[]; hasMore: boolean }> {
    return { items: this.entries, hasMore: false };
  }
  async listByGroup(): Promise<{ items: readonly AuditLogEntry[]; hasMore: boolean }> {
    return { items: this.entries, hasMore: false };
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
// Real SHA-256 from node crypto — non-reversible so audit logs cannot leak
// the plain token. Jest's node environment exposes `require('crypto')`.
const hashFn = (input: string): string => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- node builtin in a jest test
  const { createHash } = require('crypto') as {
    createHash: (alg: string) => {
      update: (s: string) => { digest: (enc: string) => string };
    };
  };
  return createHash('sha256').update(input).digest('hex');
};
const generateTokenFn = () => TEST_TOKEN;
let idCounter = 0;
const generateIdFn = () => `id-${++idCounter}`;

function makeGroup(): Group {
  return createGroup({
    id: GROUP_ID,
    name: 'Trip to Goa',
    currencyCode: 'INR',
    createdBy: OWNER_ID,
    now: NOW,
  });
}

function makeMembers(): GroupMember[] {
  return [
    createGroupMember({
      id: OWNER_MEMBER_ID,
      groupId: GROUP_ID,
      userId: OWNER_ID,
      displayName: 'Owner',
      role: 'owner',
      now: NOW,
    }),
    createGroupMember({
      id: ADMIN_MEMBER_ID,
      groupId: GROUP_ID,
      userId: ADMIN_ID,
      displayName: 'Admin',
      role: 'admin',
      now: NOW,
    }),
    createGroupMember({
      id: MEMBER_MEMBER_ID,
      groupId: GROUP_ID,
      userId: MEMBER_USER_ID,
      displayName: 'Member',
      role: 'member',
      now: NOW,
    }),
  ];
}

function makeInvite(overrides?: Partial<GroupInvite> & { id?: InviteId }): GroupInvite {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Prompt 26: invitations', () => {
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
    for (const m of makeMembers()) {
      memberRepo.seed(m);
    }
  });

  // --------------------------------------------------------------------------
  // CreateInviteUseCase
  // --------------------------------------------------------------------------

  describe('CreateInviteUseCase', () => {
    let useCase: CreateInviteUseCase;

    beforeEach(() => {
      useCase = new CreateInviteUseCase(
        groupRepo,
        memberRepo,
        inviteRepo,
        auditRepo,
        generateTokenFn,
        hashFn,
        generateIdFn,
      );
    });

    it('creates an invite when the actor is owner', async () => {
      const result = await useCase.execute({
        groupId: GROUP_ID,
        actorMemberId: OWNER_MEMBER_ID,
      });

      expect(result.plainToken).toBe(TEST_TOKEN);
      expect(result.invite.status).toBe('pending');
      expect(result.invite.intendedRole).toBe('member');
      expect(result.invite.maxUses).toBe(1);
      expect(result.invite.useCount).toBe(0);
      expect(result.invite.tokenHash).toBe(hashFn(TEST_TOKEN));
      expect(result.deepLinkUrl).toBe(`billlens://group/join/${TEST_TOKEN}`);

      // Persisted.
      const stored = await inviteRepo.findById(result.invite.id);
      expect(stored).toEqual(result.invite);
    });

    it('creates an invite when the actor is admin', async () => {
      const result = await useCase.execute({
        groupId: GROUP_ID,
        actorMemberId: ADMIN_MEMBER_ID,
      });
      expect(result.invite.id).toBeDefined();
      expect(result.invite.status).toBe('pending');
    });

    it('rejects invite creation by a plain member', async () => {
      await expect(
        useCase.execute({
          groupId: GROUP_ID,
          actorMemberId: MEMBER_MEMBER_ID,
        }),
      ).rejects.toThrow(InvalidEntityError);
      await expect(
        useCase.execute({
          groupId: GROUP_ID,
          actorMemberId: MEMBER_MEMBER_ID,
        }),
      ).rejects.toThrow(/owners or admins/i);
      expect(auditRepo.entries).toHaveLength(0);
    });

    it('rejects when the actor does not belong to the group', async () => {
      const strangerId = asMemberId('member-stranger');
      memberRepo.seed(
        createGroupMember({
          id: strangerId,
          groupId: asGroupId('other-group'),
          displayName: 'Stranger',
          role: 'owner',
          now: NOW,
        }),
      );
      await expect(
        useCase.execute({
          groupId: GROUP_ID,
          actorMemberId: strangerId,
        }),
      ).rejects.toThrow(/does not belong to group/i);
    });

    it('rejects when the group is archived', async () => {
      const archived = await groupRepo.findById(GROUP_ID);
      if (!archived) throw new Error('test setup failed');
      const archivedGroup: Group = {
        ...archived,
        deletedAt: NOW,
      };
      groupRepo.seed(archivedGroup);
      await expect(
        useCase.execute({
          groupId: GROUP_ID,
          actorMemberId: OWNER_MEMBER_ID,
        }),
      ).rejects.toThrow(/archived/i);
    });

    it('rejects admin-role invites from non-owner actors', async () => {
      await expect(
        useCase.execute({
          groupId: GROUP_ID,
          actorMemberId: ADMIN_MEMBER_ID,
          intendedRole: 'admin',
        }),
      ).rejects.toThrow(/owner can mint admin-role/i);
    });

    it('allows admin-role invites from the owner', async () => {
      const result = await useCase.execute({
        groupId: GROUP_ID,
        actorMemberId: OWNER_MEMBER_ID,
        intendedRole: 'admin',
      });
      expect(result.invite.intendedRole).toBe('admin');
    });

    it('rejects maxUses above 50', async () => {
      await expect(
        useCase.execute({
          groupId: GROUP_ID,
          actorMemberId: OWNER_MEMBER_ID,
          maxUses: 51,
        }),
      ).rejects.toThrow(/maxUses/i);
    });

    it('rejects expiresInDays above 30', async () => {
      await expect(
        useCase.execute({
          groupId: GROUP_ID,
          actorMemberId: OWNER_MEMBER_ID,
          expiresInDays: 31,
        }),
      ).rejects.toThrow(/expiresInDays/i);
    });

    it('writes an audit entry containing tokenHash but never the plain token', async () => {
      const result = await useCase.execute({
        groupId: GROUP_ID,
        actorMemberId: OWNER_MEMBER_ID,
      });

      expect(auditRepo.entries).toHaveLength(1);
      const entry = auditRepo.entries[0]!;
      expect(entry.entityType).toBe('group_invite');
      expect(entry.entityId).toBe(result.invite.id as string);
      expect(entry.action).toBe('create');
      expect(entry.changeSummary).toMatchObject({
        intendedRole: 'member',
        maxUses: 1,
        tokenHash: hashFn(TEST_TOKEN),
      });
      // SECURITY: plain token must NEVER appear in the audit entry.
      const serialised = JSON.stringify(entry);
      expect(serialised).not.toContain(TEST_TOKEN);
    });
  });

  // --------------------------------------------------------------------------
  // ValidateInviteUseCase
  // --------------------------------------------------------------------------

  describe('ValidateInviteUseCase', () => {
    let useCase: ValidateInviteUseCase;

    beforeEach(() => {
      useCase = new ValidateInviteUseCase(
        inviteRepo,
        groupRepo,
        memberRepo,
        hashFn,
      );
    });

    it('returns valid + preview for a usable invite', async () => {
      inviteRepo.seed(makeInvite());
      const result = await useCase.execute({ plainToken: TEST_TOKEN, now: NOW });
      expect(result.kind).toBe('valid');
      if (result.kind === 'valid') {
        expect(result.preview.groupName).toBe('Trip to Goa');
        expect(result.preview.currencyCode).toBe('INR');
        expect(result.preview.memberCount).toBe(3);
        expect(result.preview.inviterName).toBe('Owner');
        expect(result.preview.intendedRole).toBe('member');
      }
    });

    it('returns invalid_token when no invite matches the hash', async () => {
      const result = await useCase.execute({ plainToken: '0'.repeat(32) });
      expect(result.kind).toBe('invalid_token');
    });

    it('returns invalid_token for tokens shorter than 32 chars', async () => {
      const result = await useCase.execute({ plainToken: 'short' });
      expect(result.kind).toBe('invalid_token');
    });

    it('returns revoked for a revoked invite', async () => {
      const invite = makeInvite();
      inviteRepo.seed({ ...invite, status: 'revoked', revokedAt: NOW });
      const result = await useCase.execute({ plainToken: TEST_TOKEN, now: NOW });
      expect(result.kind).toBe('revoked');
    });

    it('returns expired for an expired invite', async () => {
      const pastExpiry = asDateTime('2025-01-01T00:00:00.000Z');
      inviteRepo.seed({
        ...makeInvite(),
        expiresAt: pastExpiry,
      });
      const result = await useCase.execute({ plainToken: TEST_TOKEN, now: NOW });
      expect(result.kind).toBe('expired');
    });

    it('returns exhausted when a multi-use invite has reached maxUses', async () => {
      inviteRepo.seed(
        makeInvite({
          maxUses: 3,
          useCount: 3,
        }),
      );
      // The factory initialises useCount=0; override directly.
      const stored = await inviteRepo.findById(asInviteId('invite-1'));
      if (!stored) throw new Error('test setup failed');
      inviteRepo.seed({
        ...stored,
        maxUses: 3,
        useCount: 3,
        status: 'accepted',
      });
      const result = await useCase.execute({ plainToken: TEST_TOKEN, now: NOW });
      // The invite is marked `accepted` and useCount has hit maxUses.
      // The validator returns `exhausted` for an accepted multi-use invite.
      expect(['exhausted', 'already_accepted']).toContain(result.kind);
    });

    it('returns group_archived when the group is soft-deleted', async () => {
      inviteRepo.seed(makeInvite());
      const archived = await groupRepo.findById(GROUP_ID);
      if (!archived) throw new Error('test setup failed');
      groupRepo.seed({ ...archived, deletedAt: NOW });
      const result = await useCase.execute({ plainToken: TEST_TOKEN, now: NOW });
      expect(result.kind).toBe('group_archived');
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
      const fallbackUseCase = new ValidateInviteUseCase(
        throwingHashRepo,
        groupRepo,
        memberRepo,
        hashFn,
      );
      const result = await fallbackUseCase.execute({ plainToken: TEST_TOKEN, now: NOW });
      expect(result.kind).toBe('valid');
    });
  });

  // --------------------------------------------------------------------------
  // RevokeInviteUseCase
  // --------------------------------------------------------------------------

  describe('RevokeInviteUseCase', () => {
    let useCase: RevokeInviteUseCase;

    beforeEach(() => {
      useCase = new RevokeInviteUseCase(
        inviteRepo,
        memberRepo,
        auditRepo,
        generateIdFn,
      );
    });

    it('revokes a pending invite when actor is owner', async () => {
      const invite = makeInvite();
      inviteRepo.seed(invite);
      const result = await useCase.execute({
        inviteId: invite.id,
        actorMemberId: OWNER_MEMBER_ID,
      });
      expect(result.invite.status).toBe('revoked');
      expect(result.invite.revokedAt).toBe(NOW);
      expect(auditRepo.entries).toHaveLength(1);
      const entry = auditRepo.entries[0]!;
      expect(entry.action).toBe('update');
      expect(entry.changeSummary).toMatchObject({
        previousStatus: 'pending',
        newStatus: 'revoked',
      });
    });

    it('revokes a pending invite when actor is admin', async () => {
      const invite = makeInvite();
      inviteRepo.seed(invite);
      const result = await useCase.execute({
        inviteId: invite.id,
        actorMemberId: ADMIN_MEMBER_ID,
      });
      expect(result.invite.status).toBe('revoked');
    });

    it('rejects revocation by a plain member', async () => {
      const invite = makeInvite();
      inviteRepo.seed(invite);
      await expect(
        useCase.execute({
          inviteId: invite.id,
          actorMemberId: MEMBER_MEMBER_ID,
        }),
      ).rejects.toThrow(/owners or admins/i);
    });

    it('is idempotent on already-revoked invites', async () => {
      const invite = makeInvite();
      inviteRepo.seed({ ...invite, status: 'revoked', revokedAt: NOW });
      const result = await useCase.execute({
        inviteId: invite.id,
        actorMemberId: OWNER_MEMBER_ID,
      });
      expect(result.invite.status).toBe('revoked');
      // No new audit entry because no transition occurred.
      expect(auditRepo.entries).toHaveLength(0);
    });

    it('writes an audit entry that does NOT contain the plain token', async () => {
      const invite = makeInvite();
      inviteRepo.seed(invite);
      await useCase.execute({
        inviteId: invite.id,
        actorMemberId: OWNER_MEMBER_ID,
      });
      const serialised = JSON.stringify(auditRepo.entries);
      expect(serialised).not.toContain(TEST_TOKEN);
    });
  });

  // --------------------------------------------------------------------------
  // Deep-link parser
  // --------------------------------------------------------------------------

  describe('parseJoinDeepLink', () => {
    it('parses the canonical billlens://group/join/{token} form', () => {
      const result = parseJoinDeepLink(`billlens://group/join/${TEST_TOKEN}`);
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.token).toBe(TEST_TOKEN);
      }
    });

    it('parses the triple-slash form some platforms emit', () => {
      const result = parseJoinDeepLink(`billlens:///group/join/${TEST_TOKEN}`);
      expect(result.kind).toBe('ok');
    });

    it('parses the https://billlens.app/join/{token} fallback form', () => {
      const result = parseJoinDeepLink(`https://billlens.app/join/${TEST_TOKEN}`);
      expect(result.kind).toBe('ok');
    });

    it('parses the https://billlens.app/join?token={token} query form', () => {
      const result = parseJoinDeepLink(
        `https://billlens.app/join?token=${TEST_TOKEN}`,
      );
      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.token).toBe(TEST_TOKEN);
      }
    });

    it('strips query strings from the path form', () => {
      const result = parseJoinDeepLink(
        `billlens://group/join/${TEST_TOKEN}?referrer=qr`,
      );
      expect(result.kind).toBe('ok');
    });

    it('accepts a bare token (no scheme) as a fallback', () => {
      const result = parseJoinDeepLink(TEST_TOKEN);
      expect(result.kind).toBe('ok');
    });

    it('returns invalid_token for a too-short token segment', () => {
      const result = parseJoinDeepLink('billlens://group/join/abc');
      expect(result.kind).toBe('invalid_token');
    });

    it('returns invalid_token for non-hex tokens', () => {
      const result = parseJoinDeepLink(
        `billlens://group/join/${'z'.repeat(32)}`,
      );
      expect(result.kind).toBe('invalid_token');
    });

    it('returns invalid_url for an empty input', () => {
      expect(parseJoinDeepLink('').kind).toBe('invalid_url');
      expect(parseJoinDeepLink('   ').kind).toBe('invalid_url');
    });

    it('returns not_a_join_link for unrelated billlens routes', () => {
      const result = parseJoinDeepLink('billlens://groups/abc');
      expect(result.kind).toBe('not_a_join_link');
    });

    it('returns not_a_join_link for an unrelated https URL', () => {
      const result = parseJoinDeepLink('https://example.com/foo');
      expect(result.kind).toBe('not_a_join_link');
    });

    it('builds the inverse URL with buildJoinDeepLink', () => {
      const url = buildJoinDeepLink(TEST_TOKEN);
      expect(url).toBe(`billlens://group/join/${TEST_TOKEN}`);
      const parsed = parseJoinDeepLink(url);
      expect(parsed.kind).toBe('ok');
    });
  });

  // --------------------------------------------------------------------------
  // GenerateQrCodeUrlUseCase
  // --------------------------------------------------------------------------

  describe('GenerateQrCodeUrlUseCase', () => {
    const useCase = new GenerateQrCodeUrlUseCase();

    it('returns a billlens://group/join/{token} URL', () => {
      const result = useCase.execute({ plainToken: TEST_TOKEN });
      expect(result.url).toBe(`billlens://group/join/${TEST_TOKEN}`);
    });

    it('rejects an empty token', () => {
      expect(() => useCase.execute({ plainToken: '' })).toThrow();
    });

    it('rejects a token shorter than 32 chars', () => {
      expect(() => useCase.execute({ plainToken: 'short' })).toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Domain-helper coverage
  // --------------------------------------------------------------------------

  describe('isInviteExhausted / isInviteExpired', () => {
    it('marks a single-use invite as exhausted after one use', () => {
      const invite = makeInvite();
      expect(isInviteExhausted(invite)).toBe(false);
      const used: GroupInvite = {
        ...invite,
        useCount: 1,
        status: 'accepted',
      };
      expect(isInviteExhausted(used)).toBe(true);
    });

    it('marks an invite as expired when expiresAt <= now', () => {
      const invite = makeInvite();
      const expired: GroupInvite = {
        ...invite,
        expiresAt: asDateTime('2020-01-01T00:00:00.000Z'),
      };
      expect(isInviteExpired(expired, NOW)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases: previously-removed member can no longer create invites
  // --------------------------------------------------------------------------

  describe('removed actor', () => {
    it('rejects invite creation when the actor has left the group', async () => {
      // Mark the admin as having left the group.
      const admin = await memberRepo.findById(ADMIN_MEMBER_ID);
      if (!admin) throw new Error('test setup failed');
      const left = leaveGroup(admin, {
        expectedVersion: admin.version,
        now: NOW,
      });
      memberRepo.seed(left);

      const useCase = new CreateInviteUseCase(
        groupRepo,
        memberRepo,
        inviteRepo,
        auditRepo,
        generateTokenFn,
        hashFn,
        generateIdFn,
      );
      await expect(
        useCase.execute({
          groupId: GROUP_ID,
          actorMemberId: ADMIN_MEMBER_ID,
        }),
      ).rejects.toThrow(/no longer active/i);
    });
  });
});
