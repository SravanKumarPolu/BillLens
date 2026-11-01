/**
 * LinkMembershipToProfileUseCase — Phase 3 Prompt 28.
 *
 * Links a placeholder GroupMember (one without a `userId`) to a real
 * profile by setting the `userId` field on the member record.
 *
 * INVARIANTS:
 *
 *   - The placeholder's `id` is PRESERVED. Historical expense references
 *     (ExpensePayer.memberId, ExpenseSplit.memberId, Settlement.from/to)
 *     remain valid — they are NOT rewritten.
 *   - Financial totals are NOT recomputed. Balances remain identical.
 *   - The link is reversible: `UnlinkIncorrectIdentityUseCase` can
 *     restore the previous state by clearing the `userId` again. The
 *     audit trail records before/after identity mappings so the
 *     operation is fully traceable.
 *   - Cross-group linking is explicitly rejected.
 *   - The actor must be the group owner or an admin (verified by the
 *     `GroupAuthorizationService` injected via the `canPerform` port).
 */

import type { GroupMember } from '@domain/entities/group-member';
import { DeletedEntityError, InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { MemberId, UserId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// Ports (function-shaped; injected from composition root)
// ---------------------------------------------------------------------------

/**
 * Permission gate port. The composition root wires this to the
 * `GroupAuthorizationService`'s `canPerform` method for the
 * `resolve_member_identity_links` action.
 */
export interface LinkPermissionGate {
  (actorMemberId: MemberId, action: 'resolve_member_identity_links'): Promise<{
    allowed: boolean;
    reason?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface LinkMembershipInput {
  readonly placeholderMemberId: MemberId;
  readonly userId: UserId;
  readonly actorMemberId: MemberId;
  /** Optional new display name (the joining user's preferred name). */
  readonly newDisplayName?: string;
}

export interface LinkMembershipOutput {
  readonly member: GroupMember;
  readonly previousDisplayName: string;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class LinkMembershipToProfileUseCase {
  constructor(
    private readonly memberRepo: GroupMemberRepository,
    private readonly auditRepo: AuditRepository,
    private readonly generateId: () => string,
    private readonly canPerform: LinkPermissionGate,
  ) {}

  async execute(input: LinkMembershipInput): Promise<LinkMembershipOutput> {
    // 1. Permission check — centralised, not duplicated in screens.
    const decision = await this.canPerform(
      input.actorMemberId,
      'resolve_member_identity_links',
    );
    if (!decision.allowed) {
      throw new InvalidEntityError(
        `Actor ${input.actorMemberId} is not permitted to link identities: ${decision.reason ?? 'denied'}`,
      );
    }

    const placeholder = await this.memberRepo.findById(input.placeholderMemberId);
    if (!placeholder) {
      throw new InvalidEntityError(
        `Placeholder member ${input.placeholderMemberId} not found`,
      );
    }
    if (placeholder.leftAt) {
      throw new DeletedEntityError(
        `Placeholder member ${input.placeholderMemberId} has left the group`,
        'GroupMember',
        input.placeholderMemberId as string,
      );
    }
    if (placeholder.userId !== undefined) {
      throw new InvalidEntityError(
        `Member ${input.placeholderMemberId} is already linked to profile ${placeholder.userId}`,
      );
    }

    // 2. Cross-group linking check: verify the actor is in the same group.
    const actor = await this.memberRepo.findById(input.actorMemberId);
    if (!actor) {
      throw new InvalidEntityError(
        `Actor member ${input.actorMemberId} not found`,
      );
    }
    if (actor.groupId !== placeholder.groupId) {
      throw new InvalidEntityError(
        `Cross-group linking rejected: actor ${input.actorMemberId} is in group ${actor.groupId}, placeholder is in ${placeholder.groupId}`,
      );
    }

    // 3. Apply the link — preserve the member id and all historical refs.
    const previousDisplayName = placeholder.displayName as string;
    const nowIso = new Date().toISOString();
    const updated: GroupMember = {
      ...placeholder,
      userId: input.userId,
      ...(input.newDisplayName !== undefined
        ? { displayName: input.newDisplayName as GroupMember['displayName'] }
        : {}),
      updatedAt: nowIso as GroupMember['updatedAt'],
      version: ((placeholder.version as number) + 1) as GroupMember['version'],
    };
    await this.memberRepo.save(updated);

    // 4. Audit — capture before/after identity mapping + prove member id
    //    was preserved (so historical expense references remain valid).
    await this.auditRepo.append({
      id: this.generateId(),
      entityType: 'group_member',
      entityId: updated.id as string,
      action: 'update',
      groupId: updated.groupId,
      changeSummary: {
        action_type: 'link_membership_to_profile',
        actor: input.actorMemberId as string,
        previous: { userId: null, displayName: previousDisplayName },
        next: {
          userId: input.userId as string,
          displayName: updated.displayName as string,
        },
        memberIdPreserved: true,
        balancesRecomputed: false,
        historicalExpensesRewritten: false,
      },
      previousVersion: placeholder.version as number,
      newVersion: updated.version as number,
    });

    return { member: updated, previousDisplayName };
  }
}
