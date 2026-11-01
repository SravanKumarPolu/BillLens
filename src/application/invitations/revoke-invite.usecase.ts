/**
 * RevokeInviteUseCase — Phase 3 Prompt 26.
 *
 * Marks a pending invite as `revoked`. Only the owner or an admin of
 * the group can revoke an invite. Once revoked, the invite can never
 * be reused — the join-group use case refuses revoked tokens.
 *
 * Flow:
 *   1. Load the invite by ID.
 *   2. Verify the actor is owner/admin of the invite's group.
 *   3. Verify the invite is still `pending` (no-op on revoked/expired).
 *   4. Call the repository's `revoke` method, which transitions the
 *      status atomically.
 *   5. Write an audit entry. The plain token is NEVER logged — only
 *      the invite id and `tokenHash`.
 */

import type { GroupInvite } from '@domain/entities/group-invite';
import { isMemberActive } from '@domain/entities/group-member';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GroupInviteRepository } from '@domain/repositories/group-invite.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { InviteId, MemberId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface RevokeInviteInput {
  readonly inviteId: InviteId;
  /** The actor's member ID — must be owner or admin of the group. */
  readonly actorMemberId: MemberId;
}

export interface RevokeInviteOutput {
  readonly invite: GroupInvite;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class RevokeInviteUseCase {
  constructor(
    private readonly inviteRepo: GroupInviteRepository,
    private readonly memberRepo: GroupMemberRepository,
    private readonly auditRepo: AuditRepository,
    private readonly generateId: () => string,
  ) {}

  async execute(input: RevokeInviteInput): Promise<RevokeInviteOutput> {
    const invite = await this.inviteRepo.findById(input.inviteId);
    if (!invite) {
      throw new InvalidEntityError(`Invite ${input.inviteId} not found`);
    }

    const actor = await this.memberRepo.findById(input.actorMemberId);
    if (!actor) {
      throw new InvalidEntityError(
        `Actor member ${input.actorMemberId} not found`,
      );
    }
    if (actor.groupId !== invite.groupId) {
      throw new InvalidEntityError(
        `Actor ${input.actorMemberId} is not a member of group ${invite.groupId}`,
      );
    }
    if (!isMemberActive(actor)) {
      throw new InvalidEntityError(
        `Actor ${input.actorMemberId} is no longer active in the group`,
      );
    }
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      throw new InvalidEntityError(
        `Only owners or admins can revoke invites; actor role is ${actor.role}`,
      );
    }

    if (invite.status !== 'pending') {
      // Idempotent: revoking an already-revoked or expired invite is a no-op.
      return { invite };
    }

    const revoked = await this.inviteRepo.revoke(invite.id);

    await this.auditRepo.append({
      id: this.generateId(),
      entityType: 'group_invite',
      entityId: revoked.id as string,
      action: 'update',
      groupId: revoked.groupId,
      changeSummary: {
        previousStatus: invite.status,
        newStatus: revoked.status,
        tokenHash: revoked.tokenHash, // safe: non-reversible hash
      },
      previousVersion: invite.version as number,
      newVersion: revoked.version as number,
    });

    return { invite: revoked };
  }
}
