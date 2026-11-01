/**
 * GroupAction — closed enumeration of every permissioned action a user
 * can perform against a group.
 *
 * Phase 3 Prompt 29.
 *
 * Used by the permission matrix (`checkPermission`) and the
 * `GroupAuthorizationService` to centralise all access-control decisions.
 * Adding a new action requires updating the matrix AND the relevant UI
 * guard at the same time — centralisation prevents permission checks from
 * being scattered across screens.
 */

export type GroupAction =
  | 'view_group'
  | 'view_expenses'
  | 'add_expense'
  | 'edit_own_expense'
  | 'edit_any_expense'
  | 'delete_own_expense'
  | 'delete_any_expense'
  | 'record_settlement'
  | 'edit_settlement'
  | 'invite_members'
  | 'revoke_invites'
  | 'remove_members'
  | 'change_member_roles'
  | 'archive_group'
  | 'delete_group'
  | 'change_privacy_defaults'
  | 'resolve_member_identity_links'
  | 'transfer_ownership';

/**
 * All group actions, in stable order. Used by tests to assert full
 * matrix coverage.
 */
export const ALL_GROUP_ACTIONS: readonly GroupAction[] = [
  'view_group',
  'view_expenses',
  'add_expense',
  'edit_own_expense',
  'edit_any_expense',
  'delete_own_expense',
  'delete_any_expense',
  'record_settlement',
  'edit_settlement',
  'invite_members',
  'revoke_invites',
  'remove_members',
  'change_member_roles',
  'archive_group',
  'delete_group',
  'change_privacy_defaults',
  'resolve_member_identity_links',
  'transfer_ownership',
];
