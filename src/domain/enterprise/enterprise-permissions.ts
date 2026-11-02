/**
 * Enterprise permissions — role-based access control matrix.
 *
 * Phase 10 Prompt 92: Enterprise Features.
 *
 * CRITICAL: enterprise permissions are ADDITIVE to the existing
 * group-level permission matrix (see `domain/services/permissions/`).
 * They do NOT replace it. An `org_admin` can perform enterprise
 * actions but still must be a member of a group to act on that
 * group's expenses.
 *
 * This module is PURE and READ-ONLY.
 *
 * See `docs/enterprise-features.md` and `docs/roles-and-permissions.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EnterpriseRole =
  | 'org_admin'
  | 'department_admin'
  | 'cost_centre_manager'
  | 'approver'
  | 'employee'
  | 'auditor'
  | 'readonly';

export type EnterpriseAction =
  | 'view_org_finances'
  | 'view_department_finances'
  | 'approve_expense'
  | 'create_expense'
  | 'edit_policy'
  | 'manage_users'
  | 'export_audit'
  | 'view_cost_centres';

// ---------------------------------------------------------------------------
// Permission matrix
// ---------------------------------------------------------------------------

/**
 * The canonical enterprise permission matrix.
 *
 * Each row is a role; each value is the list of actions that role
 * may perform. An empty list means "no enterprise actions".
 *
 * Design principles:
 *  - org_admin: full access to all enterprise actions.
 *  - department_admin: can view dept finances, approve, create, view cost centres.
 *  - cost_centre_manager: can view cost centres, approve, create.
 *  - approver: can approve + create.
 *  - employee: can only create expenses.
 *  - auditor: can view org/dept finances, export audit, view cost centres.
 *  - readonly: can view org finances only (read-only oversight).
 */
export const ENTERPRISE_PERMISSION_MATRIX: Readonly<
  Record<EnterpriseRole, readonly EnterpriseAction[]>
> = Object.freeze({
  org_admin: Object.freeze<readonly EnterpriseAction[]>([
    'view_org_finances',
    'view_department_finances',
    'approve_expense',
    'create_expense',
    'edit_policy',
    'manage_users',
    'export_audit',
    'view_cost_centres',
  ]),
  department_admin: Object.freeze<readonly EnterpriseAction[]>([
    'view_department_finances',
    'approve_expense',
    'create_expense',
    'view_cost_centres',
  ]),
  cost_centre_manager: Object.freeze<readonly EnterpriseAction[]>([
    'view_cost_centres',
    'approve_expense',
    'create_expense',
  ]),
  approver: Object.freeze<readonly EnterpriseAction[]>([
    'approve_expense',
    'create_expense',
  ]),
  employee: Object.freeze<readonly EnterpriseAction[]>([
    'create_expense',
  ]),
  auditor: Object.freeze<readonly EnterpriseAction[]>([
    'view_org_finances',
    'view_department_finances',
    'export_audit',
    'view_cost_centres',
  ]),
  readonly: Object.freeze<readonly EnterpriseAction[]>([
    'view_org_finances',
  ]),
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when `role` is permitted to perform `action`.
 *
 * This function consults ENTERPRISE_PERMISSION_MATRIX only. It does
 * NOT consult group-level permissions or check resource ownership —
 * the application layer must compose these checks.
 */
export function canPerform(
  role: EnterpriseRole,
  action: EnterpriseAction,
): boolean {
  const allowed = ENTERPRISE_PERMISSION_MATRIX[role];
  if (!allowed) {
    return false;
  }
  return allowed.includes(action);
}

/**
 * Returns the list of actions a role can perform (defensive copy).
 */
export function getActionsForRole(
  role: EnterpriseRole,
): readonly EnterpriseAction[] {
  return ENTERPRISE_PERMISSION_MATRIX[role] ?? [];
}

/**
 * Returns the list of roles that can perform a given action. Useful
 * for building assignment pickers in the UI.
 */
export function getRolesForAction(
  action: EnterpriseAction,
): readonly EnterpriseRole[] {
  const roles: EnterpriseRole[] = [];
  (Object.keys(ENTERPRISE_PERMISSION_MATRIX) as EnterpriseRole[]).forEach(
    (role) => {
      if (ENTERPRISE_PERMISSION_MATRIX[role].includes(action)) {
        roles.push(role);
      }
    },
  );
  return roles;
}

/**
 * Returns true when `roleA` is at least as privileged as `roleB`.
 *
 * Privilege ranking (high → low):
 *   org_admin > department_admin > cost_centre_manager > approver >
 *   auditor > employee > readonly
 *
 * Note: this is a TOTAL order used for UI affordances. The actual
 * access decision is made by `canPerform`.
 */
export function isAtLeast(
  roleA: EnterpriseRole,
  roleB: EnterpriseRole,
): boolean {
  const ranking: Readonly<Record<EnterpriseRole, number>> = Object.freeze({
    org_admin: 7,
    department_admin: 6,
    cost_centre_manager: 5,
    approver: 4,
    auditor: 3,
    employee: 2,
    readonly: 1,
  });
  return ranking[roleA] >= ranking[roleB];
}
