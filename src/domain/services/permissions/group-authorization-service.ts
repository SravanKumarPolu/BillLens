/**
 * GroupAuthorizationService — Phase 3 Prompt 29.
 *
 * The application-layer wrapper around the pure permission matrix. It
 * resolves the actor's membership (via {@link GroupMemberRepository})
 * and delegates the actual decision to {@link checkPermission}.
 *
 * Centralisation: every use case that needs to perform a privileged
 * action MUST call `canPerform` rather than reading `member.role`
 * directly. This makes future permission changes (e.g. adding a
 * `viewer` role) a single-file edit.
 *
 * Offline handling: if the actor's membership cannot be loaded (e.g.
 * the local SQLite store is empty because the user is offline and
 * hasn't yet synced), `canPerform` returns `{ allowed: false, reason }`
 * rather than throwing. The caller can then surface an
 * `action_unavailable_offline` error code to the UI.
 */

import type { GroupMember, MemberRole } from '@domain/entities/group-member';
import { isMemberActive } from '@domain/entities/group-member';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import type { MemberId } from '@shared-types/index';

import type { GroupAction } from './group-actions';
import {
  type AuthorizationDecision,
  checkPermission,
} from './permission-matrix';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface AuthorizationContext {
  readonly targetMemberId?: MemberId;
  readonly isOwnResource?: boolean;
}

export interface GroupAuthorizationService {
  canPerform(
    actorMemberId: MemberId,
    action: GroupAction,
    context?: AuthorizationContext,
  ): Promise<AuthorizationDecision>;
  /**
   * Resolve the actor's role WITHOUT making an authorization decision.
   * Useful for UI elements that want to show "you are an admin" without
   * going through the matrix.
   */
  getRole(actorMemberId: MemberId): Promise<MemberRole | null>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

/**
 * Production-grade `GroupAuthorizationService` backed by the
 * {@link GroupMemberRepository} and the pure {@link checkPermission}
 * matrix.
 *
 * The constructor takes the `GroupMemberRepository` (to resolve the
 * actor) and optionally a `GroupRepository` (to verify group active
 * state for actions that depend on it, e.g. `archive_group`).
 */
export class DefaultGroupAuthorizationService
  implements GroupAuthorizationService
{
  constructor(
    private readonly memberRepo: GroupMemberRepository,
    private readonly groupRepo?: GroupRepository,
  ) {}

  async canPerform(
    actorMemberId: MemberId,
    action: GroupAction,
    context?: AuthorizationContext,
  ): Promise<AuthorizationDecision> {
    const actor = await this.memberRepo.findById(actorMemberId);
    if (!actor) {
      return {
        allowed: false,
        reason: 'action_unavailable_offline',
      };
    }
    if (!isMemberActive(actor)) {
      return {
        allowed: false,
        reason: 'access_removed',
      };
    }

    // For actions on a target member, verify the actor and target are in
    // the same group (cross-group access is never allowed).
    if (context?.targetMemberId) {
      const target = await this.memberRepo.findById(context.targetMemberId);
      if (!target) {
        return {
          allowed: false,
          reason: 'target_member_not_found',
        };
      }
      if (target.groupId !== actor.groupId) {
        return {
          allowed: false,
          reason: 'cross_group_access_denied',
        };
      }
    }

    // Group-active check for actions that require an active group.
    if (
      this.groupRepo !== undefined &&
      (action === 'archive_group' ||
        action === 'delete_group' ||
        action === 'change_privacy_defaults' ||
        action === 'invite_members')
    ) {
      const group = await this.groupRepo.findById(actor.groupId);
      if (!group || group.deletedAt) {
        return {
          allowed: false,
          reason: 'group_archived',
        };
      }
    }

    const isOwnResource = context?.isOwnResource ?? false;
    return checkPermission(actor.role, action, isOwnResource);
  }

  async getRole(actorMemberId: MemberId): Promise<MemberRole | null> {
    const actor: GroupMember | null = await this.memberRepo.findById(
      actorMemberId,
    );
    if (!actor || !isMemberActive(actor)) return null;
    return actor.role;
  }
}
