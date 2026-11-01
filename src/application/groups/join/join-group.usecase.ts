/**
 * JoinGroupUseCase — Phase 3 Prompt 27.
 *
 * Resolves an invite token to a join outcome and, when appropriate,
 * creates a new GroupMember record for the joining user.
 *
 * Duplicate-membership detection rules (evaluated in order):
 *
 *   1. The joining user is an authenticated profile that already has
 *      an ACTIVE membership in this group
 *        → `already_member` (return the existing member id).
 *
 *   2. The joining user is a guest whose display name matches an
 *      ACTIVE member's display name AND that member has no `userId`
 *      (i.e. it is a placeholder)
 *        → `requires_member_selection` (caller offers to link).
 *
 *   3. The joining user is a guest whose display name matches an
 *      ACTIVE member's display name AND that member IS already linked
 *      to a profile
 *        → `already_member` (the active linked member wins).
 *
 *   4. There exists a HISTORICAL (leftAt set) membership for the same
 *      display name OR the same `userId`
 *        → `link_existing_membership` (caller can reactivate it; for
 *          Phase 27 we return the outcome and the candidate member id,
 *          the actual reactivation is performed by a separate use case
 *          in the member-linking module).
 *
 *   5. None of the above:
 *        → `create_new_membership`. Create a new GroupMember with the
 *          invite's `intendedRole`, mark the invite as accepted (or
 *          increment its useCount for multi-use invites), and audit.
 *
 * Offline handling:
 *   - If the validate-invite step cannot locate the invite locally
 *     (e.g. the invite was opened offline and has not yet synced),
 *     the join-group use case returns `invite_invalid` with
 *     `invalidReason: 'offline'`. The caller NEVER sees a "membership
 *     active" claim when validation could not be performed.
 *
 * The use case does NOT change financial totals — adding a new member
 * with no historical expenses produces no balance changes. The
 * placeholder-link flow (when applicable) is handled by
 * `ResolvePlaceholderMemberUseCase`, which preserves historical
 * expense references by keeping the original member id intact.
 */

import {
  type GroupInvite,
  incrementInviteUseCount,
  isInviteExhausted,
  isInviteUsable,
} from '@domain/entities/group-invite';
import {
  asMemberId,
  createGroupMember,
  type GroupMember,
  type MemberRole,
} from '@domain/entities/group-member';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GroupInviteRepository } from '@domain/repositories/group-invite.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import type { GroupId, MemberId, UserId } from '@shared-types/index';

import type { HashInviteToken } from '../../invitations/invite-token-port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export type JoinOutcome =
  | 'create_new_membership'
  | 'link_existing_membership'
  | 'already_member'
  | 'requires_member_selection'
  | 'requires_admin_approval'
  | 'invite_invalid'
  | 'access_blocked';

export type InviteInvalidReason =
  | 'offline'
  | 'expired'
  | 'revoked'
  | 'exhausted'
  | 'invalid_token'
  | 'group_archived';

/** Identity of the joining user. Exactly one of `userId` / `guestName`. */
export interface CurrentIdentity {
  readonly userId?: UserId;
  readonly guestDisplayName?: string;
}

export interface JoinGroupInput {
  readonly inviteToken: string;
  readonly currentIdentity: CurrentIdentity;
  /** Optional override for the current time (used in tests). Defaults to now. */
  readonly now?: string;
}

export interface JoinGroupOutput {
  readonly outcome: JoinOutcome;
  readonly memberId?: MemberId;
  /**
   * Set when outcome is `requires_member_selection` — the candidate
   * placeholder members the user might link to.
   */
  readonly placeholderCandidates?: readonly MemberId[];
  /**
   * Set when outcome is `link_existing_membership` — the historical
   * member that can be reactivated.
   */
  readonly historicalMemberId?: MemberId;
  /** Set when outcome is `invite_invalid`. */
  readonly invalidReason?: InviteInvalidReason;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class JoinGroupUseCase {
  constructor(
    private readonly groupRepo: GroupRepository,
    private readonly memberRepo: GroupMemberRepository,
    private readonly inviteRepo: GroupInviteRepository,
    private readonly auditRepo: AuditRepository,
    private readonly hashToken: HashInviteToken,
    private readonly generateId: () => string,
  ) {}

  async execute(input: JoinGroupInput): Promise<JoinGroupOutput> {
    // 1. Resolve the invite via the local repositories.
    //    The validate step does NOT call the cloud — the join-group use
    //    case assumes the caller already attempted cloud validation
    //    (handled by the deep-link handler + validate-invite use case).
    //    If the invite cannot be found locally we treat it as offline.
    if (!input.inviteToken || input.inviteToken.length < 32) {
      return { outcome: 'invite_invalid', invalidReason: 'invalid_token' };
    }

    const tokenHash = this.hashToken(input.inviteToken);
    let invite: GroupInvite | null = null;
    try {
      invite = await this.inviteRepo.findByTokenHash(tokenHash);
    } catch {
      invite = null;
    }
    if (!invite) {
      try {
        invite = await this.inviteRepo.findByToken(
          input.inviteToken as GroupInvite['token'],
        );
      } catch {
        invite = null;
      }
    }

    if (!invite) {
      // Cannot validate locally — caller must be online to validate.
      return { outcome: 'invite_invalid', invalidReason: 'offline' };
    }

    if (invite.status === 'revoked') {
      return { outcome: 'invite_invalid', invalidReason: 'revoked' };
    }

    // 2. Group existence + active state — checked early so we can use
    //    the duplicate-membership check below even when the invite is
    //    technically exhausted or expired. A user who is ALREADY an
    //    active member should see `already_member` regardless of the
    //    invite's current status (so repeated join requests are
    //    idempotent).
    const group = await this.groupRepo.findById(invite.groupId);
    if (!group) {
      return { outcome: 'invite_invalid', invalidReason: 'invalid_token' };
    }
    if (group.deletedAt) {
      return { outcome: 'invite_invalid', invalidReason: 'group_archived' };
    }

    // 3. Duplicate-membership detection — evaluated BEFORE the
    //    invite-status checks so a user who is already an active member
    //    gets `already_member` even if the invite has since been
    //    exhausted by another user.
    const activeMembers = await this.memberRepo.listActiveByGroup(invite.groupId);

    // 3a. Authenticated profile: look up by userId.
    if (input.currentIdentity.userId) {
      const existingActive = activeMembers.find(
        (m) => m.userId === input.currentIdentity.userId,
      );
      if (existingActive) {
        return { outcome: 'already_member', memberId: existingActive.id };
      }
    }

    // 3b. Guest identity: match by display name.
    const guestName = input.currentIdentity.guestDisplayName?.trim();
    if (guestName) {
      const sameNameActive = activeMembers.filter(
        (m) => (m.displayName as string).toLowerCase() === guestName.toLowerCase(),
      );
      if (sameNameActive.length > 0) {
        const placeholders = sameNameActive.filter((m) => m.userId === undefined);
        if (placeholders.length > 0) {
          return {
            outcome: 'requires_member_selection',
            placeholderCandidates: placeholders.map((m) => m.id),
          };
        }
        // The active same-name member is already linked → already_member.
        const first = sameNameActive[0]!;
        return { outcome: 'already_member', memberId: first.id };
      }
    }

    // 4. Invite-status checks (after duplicate-membership detection).
    if (invite.status === 'accepted' && isInviteExhausted(invite)) {
      return { outcome: 'invite_invalid', invalidReason: 'exhausted' };
    }
    if (invite.status === 'accepted') {
      // Single-use already accepted → exhausted.
      return { outcome: 'invite_invalid', invalidReason: 'exhausted' };
    }
    if (!isInviteUsable(invite, input.now as never)) {
      // Either expired, revoked, or exhausted — narrow down for the UI.
      const nowStr = input.now ?? new Date().toISOString();
      if (invite.expiresAt <= nowStr) {
        return { outcome: 'invite_invalid', invalidReason: 'expired' };
      }
      return { outcome: 'invite_invalid', invalidReason: 'invalid_token' };
    }

    // 5. Historical-membership lookup (only relevant for new joiners).
    if (input.currentIdentity.userId) {
      const historical = await this.findHistoricalMember(
        invite.groupId,
        input.currentIdentity.userId,
        undefined,
      );
      if (historical) {
        return {
          outcome: 'link_existing_membership',
          historicalMemberId: historical.id,
        };
      }
    }
    if (guestName) {
      const historical = await this.findHistoricalMember(
        invite.groupId,
        undefined,
        guestName,
      );
      if (historical) {
        return {
          outcome: 'link_existing_membership',
          historicalMemberId: historical.id,
        };
      }
    }

    // 6. No duplicate. Create a new membership.
    const role: MemberRole = invite.intendedRole === 'admin' ? 'admin' : 'member';
    const memberId = asMemberId(this.generateId());
    const newMember: GroupMember = createGroupMember({
      id: memberId,
      groupId: invite.groupId,
      ...(input.currentIdentity.userId
        ? { userId: input.currentIdentity.userId }
        : {}),
      displayName: guestName ?? 'New Member',
      role,
    });
    await this.memberRepo.save(newMember);

    // 5. Mark the invite as accepted (single-use) or bump useCount (multi-use).
    if ((invite.maxUses ?? 1) === 1) {
      await this.inviteRepo.accept(invite.id, newMember.id);
    } else {
      const incremented = incrementInviteUseCount(invite, {
        expectedVersion: invite.version,
        ...(input.now !== undefined ? { now: input.now as never } : {}),
      });
      await this.inviteRepo.save(incremented);
    }

    // 6. Audit. CRITICAL: never log the plain token.
    await this.auditRepo.append({
      id: this.generateId(),
      entityType: 'group_member',
      entityId: newMember.id as string,
      action: 'create',
      groupId: invite.groupId,
      changeSummary: {
        role,
        viaInviteId: invite.id as string,
        viaInviteTokenHash: invite.tokenHash,
      },
      newVersion: newMember.version as number,
    });

    return { outcome: 'create_new_membership', memberId: newMember.id };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /**
   * Look up a historical (leftAt set) membership for the given group,
   * optionally matching by userId or display name. Used to suggest
   * `link_existing_membership` instead of creating a duplicate.
   */
  private async findHistoricalMember(
    groupId: GroupId,
    userId: UserId | undefined,
    displayName: string | undefined,
  ): Promise<GroupMember | null> {
    const allPaginated = await this.memberRepo.listAllByGroup(groupId, {
      limit: 200,
    });
    const matches = allPaginated.items.filter((m) => {
      if (m.leftAt === undefined) return false;
      if (userId !== undefined && m.userId === userId) return true;
      if (
        displayName !== undefined &&
        (m.displayName as string).toLowerCase() === displayName.toLowerCase()
      ) {
        return true;
      }
      return false;
    });
    return matches[0] ?? null;
  }
}
