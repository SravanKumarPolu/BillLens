/**
 * CreateInviteUseCase — Phase 3 Prompt 26.
 *
 * Mints a new GroupInvite for a group. Only owner or admin of the group
 * can create invites. The use case:
 *
 *   1. Loads the actor's membership and verifies they are owner/admin.
 *   2. Loads the group and verifies it is active.
 *   3. Generates a cryptographically random 32-hex-char token via the
 *      injected generator port (production wires this to expo-crypto,
 *      tests inject a deterministic stub).
 *   4. Hashes the token via the injected hasher port (SHA-256 in prod).
 *   5. Validates `expiresInDays` (1–30, default 7) and `maxUses`
 *      (1–50, default 1).
 *   6. Persists the invite via {@link GroupInviteRepository.save}, storing
 *      the hash and the plain token (the latter is for the legacy
 *      local-SQLite lookup path; cloud storage persists only the hash).
 *   7. Writes an audit entry recording the actor and the (intendedRole,
 *      maxUses, expiresAt) configuration. The plain token is NEVER
 *      written to the audit log.
 *   8. Returns the plain token to the caller for one-time display.
 *
 * SECURITY:
 *   - The plain token is returned exactly once and never re-read from
 *     storage by any subsequent use case. Storage lookups go through
 *     `findByTokenHash`.
 *   - The audit log records `tokenHash`, never `token`.
 *   - No `console.*` call in this file logs the token or hash.
 */

import { isGroupActive } from '@domain/entities/group';
import type { Group } from '@domain/entities/group';
import {
  type GroupInvite,
  type IntendedRole,
  asInviteId,
  createGroupInvite,
  DEFAULT_INVITE_EXPIRES_IN_DAYS,
  MAX_INVITE_USES,
} from '@domain/entities/group-invite';
import { isMemberActive } from '@domain/entities/group-member';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GroupInviteRepository } from '@domain/repositories/group-invite.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import type { GroupId, MemberId } from '@shared-types/index';

import { buildJoinDeepLink } from './deep-link-handler';
import type { GenerateInviteToken, HashInviteToken } from './invite-token-port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface CreateInviteInput {
  readonly groupId: GroupId;
  /** The actor's member ID — must be owner or admin of the group. */
  readonly actorMemberId: MemberId;
  readonly expiresInDays?: number;
  readonly maxUses?: number;
  readonly intendedRole?: IntendedRole;
  readonly inviteeDisplayName?: string;
  readonly inviteeEmail?: string;
}

export interface CreateInviteOutput {
  /** The persisted invite (contains the tokenHash, never re-shared). */
  readonly invite: GroupInvite;
  /** Plain token — return to the UI for one-time display/sharing. */
  readonly plainToken: string;
  /** Deep-link URL for QR encoding. */
  readonly deepLinkUrl: string;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class CreateInviteUseCase {
  constructor(
    private readonly groupRepo: GroupRepository,
    private readonly memberRepo: GroupMemberRepository,
    private readonly inviteRepo: GroupInviteRepository,
    private readonly auditRepo: AuditRepository,
    private readonly generateToken: GenerateInviteToken,
    private readonly hashToken: HashInviteToken,
    private readonly generateId: () => string,
  ) {}

  async execute(input: CreateInviteInput): Promise<CreateInviteOutput> {
    // 1. Resolve the actor's membership in the group.
    const actor = await this.memberRepo.findById(input.actorMemberId);
    if (!actor) {
      throw new InvalidEntityError(
        `Actor member ${input.actorMemberId} not found`,
      );
    }
    if (actor.groupId !== input.groupId) {
      throw new InvalidEntityError(
        `Actor member ${input.actorMemberId} does not belong to group ${input.groupId}`,
      );
    }
    if (!isMemberActive(actor)) {
      throw new InvalidEntityError(
        `Actor member ${input.actorMemberId} is no longer active in the group`,
      );
    }
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      throw new InvalidEntityError(
        `Only owners or admins can create invites; actor role is ${actor.role}`,
      );
    }

    // 2. Validate group existence and active state.
    const group: Group | null = await this.groupRepo.findById(input.groupId);
    if (!group) {
      throw new InvalidEntityError(`Group ${input.groupId} not found`);
    }
    if (!isGroupActive(group)) {
      throw new InvalidEntityError(
        `Group ${input.groupId} is archived and cannot accept new invites`,
      );
    }

    // 3. Validate intendedRole: only owner may mint admin invites.
    const intendedRole: IntendedRole = input.intendedRole ?? 'member';
    if (intendedRole === 'admin' && actor.role !== 'owner') {
      throw new InvalidEntityError(
        'Only the owner can mint admin-role invites',
      );
    }

    // 4. Validate expiry and maxUses.
    const expiresInDays = input.expiresInDays ?? DEFAULT_INVITE_EXPIRES_IN_DAYS;
    if (!Number.isInteger(expiresInDays) || expiresInDays <= 0) {
      throw new InvalidEntityError(
        `expiresInDays must be a positive integer, got ${expiresInDays}`,
      );
    }
    if (expiresInDays > 30) {
      throw new InvalidEntityError(
        `expiresInDays must be at most 30, got ${expiresInDays}`,
      );
    }
    const maxUses = input.maxUses ?? 1;
    if (!Number.isInteger(maxUses) || maxUses <= 0) {
      throw new InvalidEntityError(`maxUses must be a positive integer, got ${maxUses}`);
    }
    if (maxUses > MAX_INVITE_USES) {
      throw new InvalidEntityError(`maxUses must be at most ${MAX_INVITE_USES}, got ${maxUses}`);
    }

    // 5. Generate + hash the token.
    const plainToken = this.generateToken();
    if (!plainToken || plainToken.length < 32) {
      throw new InvalidEntityError(
        `Generated token must be at least 32 chars, got ${plainToken?.length ?? 0}`,
      );
    }
    const tokenHash = this.hashToken(plainToken);

    // 6. Build the invite entity (validates token format + hash + role + maxUses).
    const inviteId = asInviteId(this.generateId());
    const invite: GroupInvite = createGroupInvite({
      id: inviteId,
      groupId: input.groupId,
      token: plainToken,
      tokenHash,
      inviterMemberId: input.actorMemberId,
      ...(input.inviteeDisplayName !== undefined
        ? { inviteeDisplayName: input.inviteeDisplayName }
        : {}),
      ...(input.inviteeEmail !== undefined
        ? { inviteeEmail: input.inviteeEmail }
        : {}),
      expiresInDays,
      intendedRole,
      maxUses,
    });

    // 7. Persist.
    await this.inviteRepo.save(invite);

    // 8. Audit. CRITICAL: only the tokenHash is written — never the plain token.
    await this.auditRepo.append({
      id: this.generateId(),
      entityType: 'group_invite',
      entityId: invite.id as string,
      action: 'create',
      groupId: input.groupId,
      changeSummary: {
        intendedRole,
        maxUses,
        expiresInDays,
        expiresAt: invite.expiresAt,
        tokenHash, // safe: hash is non-reversible
      },
      newVersion: invite.version as number,
    });

    return {
      invite,
      plainToken,
      deepLinkUrl: buildJoinDeepLink(plainToken),
    };
  }
}
