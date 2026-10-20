/**
 * Permission matrix — Phase 3 Prompt 29.
 *
 * Centralised permission decisions for every {@link GroupAction}. This
 * is the SINGLE source of truth for "can role X do action Y?" — screens
 * and use cases MUST call `checkPermission` (via the
 * `GroupAuthorizationService`) rather than scattering `role === 'owner'`
 * checks across the UI.
 *
 * The matrix is pure: it has no I/O, no React, no storage dependencies.
 * That makes it trivial to unit-test every cell and to evolve the rules
 * without touching call sites.
 *
 * Matrix summary:
 *
 *   - owner:  all actions.
 *   - admin:  everything EXCEPT `transfer_ownership` and `delete_group`.
 *   - member: view + add/edit/delete OWN expense + record settlement.
 *
 * `isOwnResource` is required for `edit_own_expense`,
 * `delete_own_expense`, and `edit_settlement` — these actions are
 * permitted for members ONLY when the resource was created by them.
 */

import type { MemberRole } from '@domain/entities/group-member';

import type { GroupAction } from './group-actions';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Internal per-role allow-lists
// ---------------------------------------------------------------------------

const MEMBER_ACTIONS: ReadonlySet<GroupAction> = new Set<GroupAction>([
  'view_group',
  'view_expenses',
  'add_expense',
  'edit_own_expense',
  'delete_own_expense',
  'record_settlement',
]);

const ADMIN_ACTIONS: ReadonlySet<GroupAction> = new Set<GroupAction>([
  // All member actions…
  ...MEMBER_ACTIONS,
  // Plus admin-only actions:
  'edit_any_expense',
  'delete_any_expense',
  'edit_settlement',
  'invite_members',
  'revoke_invites',
  'remove_members',
  'change_member_roles',
  'archive_group',
  'change_privacy_defaults',
  'resolve_member_identity_links',
]);

// Owner = all actions.
const OWNER_ACTIONS: ReadonlySet<GroupAction> = new Set<GroupAction>([
  ...ADMIN_ACTIONS,
  'delete_group',
  'transfer_ownership',
]);

// Actions that depend on resource ownership for the `member` role.
const OWN_RESOURCE_ACTIONS: ReadonlySet<GroupAction> = new Set<GroupAction>([
  'edit_own_expense',
  'delete_own_expense',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decide whether `role` is allowed to perform `action`.
 *
 * For `member` role:
 *   - `edit_own_expense` and `delete_own_expense` require
 *     `isOwnResource === true`.
 *   - `edit_any_expense` and `delete_any_expense` are NOT permitted
 *     (admin/owner only).
 *
 * The `isOwnResource` parameter is ignored for admin/owner roles.
 */
export function checkPermission(
  role: MemberRole,
  action: GroupAction,
  isOwnResource: boolean = false,
): AuthorizationDecision {
  if (role === 'owner') {
    if (OWNER_ACTIONS.has(action)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Unknown action ${action}`,
    };
  }

  if (role === 'admin') {
    // Admins cannot transfer ownership or delete the group.
    if (action === 'transfer_ownership') {
      return {
        allowed: false,
        reason: 'Only the owner can transfer ownership',
      };
    }
    if (action === 'delete_group') {
      return {
        allowed: false,
        reason: 'Only the owner can delete the group',
      };
    }
    if (ADMIN_ACTIONS.has(action)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Admins cannot perform action ${action}`,
    };
  }

  // role === 'member'
  if (!MEMBER_ACTIONS.has(action)) {
    return {
      allowed: false,
      reason: `Members cannot perform action ${action}; requires admin or owner`,
    };
  }
  if (OWN_RESOURCE_ACTIONS.has(action) && !isOwnResource) {
    return {
      allowed: false,
      reason: `Action ${action} requires the resource to be owned by the actor`,
    };
  }
  return { allowed: true };
}

/**
 * Convenience: return the set of all actions the role is allowed to
 * perform (ignoring resource ownership — actions that depend on
 * ownership are listed but may still be denied at runtime by
 * `checkPermission` when `isOwnResource` is false).
 */
export function allowedActionsForRole(role: MemberRole): readonly GroupAction[] {
  if (role === 'owner') return Array.from(OWNER_ACTIONS);
  if (role === 'admin') return Array.from(ADMIN_ACTIONS);
  return Array.from(MEMBER_ACTIONS);
}
