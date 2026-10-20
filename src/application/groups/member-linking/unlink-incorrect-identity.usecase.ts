/**
 * UnlinkIncorrectIdentityUseCase — Phase 3 Prompt 28.
 *
 * Reverses a previous link operation by clearing the `userId` field on
 * a member record. The member's historical expense references are
 * PRESERVED (as with the link operation — historical refs are append-only).
 *
 * CRITICAL: this use case does NOT delete the link-history audit entries.
 * The audit trail of the original link remains intact; a new audit entry
 * records the unlink so the full history is traceable.
 *
 * Requires owner/admin permission (verified via the same
 * `LinkPermissionGate` used by `LinkMembershipToProfileUseCase`).
 */

import type { GroupMember } from '@domain/entities/group-member';
import { DeletedEntityError, InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { MemberId } from '@shared-types/index';

import type { LinkPermissionGate } from './link-membership-to-profile.usecase';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface UnlinkIdentityInput {
  readonly memberId: MemberId;
  readonly actorMemberId: MemberId;
  /** Optional reason the operator is reversing the link (audit only). */
  readonly reason?: string;
}

export interface UnlinkIdentityOutput {
  readonly member: GroupMember;
  readonly previousUserId: string;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class UnlinkIncorrectIdentityUseCase {
  constructor(
    private readonly memberRepo: GroupMemberRepository,
    private readonly auditRepo: AuditRepository,
    private readonly generateId: () => string,
    private readonly canPerform: LinkPermissionGate,
  ) {}

  async execute(input: UnlinkIdentityInput): Promise<UnlinkIdentityOutput> {
    const decision = await this.canPerform(
      input.actorMemberId,
      'resolve_member_identity_links',
    );
    if (!decision.allowed) {
      throw new InvalidEntityError(
        `Actor ${input.actorMemberId} is not permitted to unlink identities: ${decision.reason ?? 'denied'}`,
      );
    }

    const member = await this.memberRepo.findById(input.memberId);
    if (!member) {
      throw new InvalidEntityError(`Member ${input.memberId} not found`);
    }
    if (member.leftAt) {
      throw new DeletedEntityError(
        `Member ${input.memberId} has left the group`,
        'GroupMember',
        input.memberId as string,
      );
    }
    if (member.userId === undefined) {
      throw new InvalidEntityError(
        `Member ${input.memberId} is not currently linked to any profile`,
      );
    }

    // Cross-group check: actor must be in the same group.
    const actor = await this.memberRepo.findById(input.actorMemberId);
    if (!actor) {
      throw new InvalidEntityError(
        `Actor member ${input.actorMemberId} not found`,
      );
    }
    if (actor.groupId !== member.groupId) {
      throw new InvalidEntityError(
        `Cross-group unlink rejected: actor ${input.actorMemberId} is in group ${actor.groupId}, member is in ${member.groupId}`,
      );
    }

    // Owners cannot be unlinked (they must transfer ownership first).
    if (member.role === 'owner') {
      throw new InvalidEntityError(
        `Cannot unlink owner ${input.memberId}. Transfer ownership first.`,
      );
    }

    const previousUserId = member.userId as string;
    const previousDisplayName = member.displayName as string;
    const nowIso = new Date().toISOString();

    // Clear userId by building a new member object without it.
    // The historical expense references remain intact (they reference
    // the member.id, not the userId).
    const updated: GroupMember = {
      ...member,
      // Strip userId by overriding with undefined through spread.
      userId: undefined,
      updatedAt: nowIso as GroupMember['updatedAt'],
      version: ((member.version as number) + 1) as GroupMember['version'],
    };
    await this.memberRepo.save(updated);

    // Audit — note that link history is NOT deleted.
    await this.auditRepo.append({
      id: this.generateId(),
      entityType: 'group_member',
      entityId: updated.id as string,
      action: 'update',
      groupId: updated.groupId,
      changeSummary: {
        action_type: 'unlink_membership_from_profile',
        actor: input.actorMemberId as string,
        previous: {
          userId: previousUserId,
          displayName: previousDisplayName,
        },
        next: {
          userId: null,
          displayName: updated.displayName as string,
        },
        reason: input.reason ?? null,
        memberIdPreserved: true,
        linkHistoryDeleted: false,
        historicalExpensesRewritten: false,
      },
      previousVersion: member.version as number,
      newVersion: updated.version as number,
    });

    return { member: updated, previousUserId };
  }
}
