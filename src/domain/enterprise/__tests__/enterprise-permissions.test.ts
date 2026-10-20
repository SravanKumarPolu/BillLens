import {
  ENTERPRISE_PERMISSION_MATRIX,
  canPerform,
  getActionsForRole,
  getRolesForAction,
  isAtLeast,
} from '../enterprise-permissions';

describe('enterprise / enterprise-permissions', () => {
  describe('ENTERPRISE_PERMISSION_MATRIX', () => {
    it('defines 7 roles', () => {
      expect(Object.keys(ENTERPRISE_PERMISSION_MATRIX).sort()).toEqual(
        [
          'org_admin',
          'department_admin',
          'cost_centre_manager',
          'approver',
          'employee',
          'auditor',
          'readonly',
        ].sort(),
      );
    });
    it('every role list is frozen', () => {
      for (const role of Object.keys(ENTERPRISE_PERMISSION_MATRIX) as (keyof typeof ENTERPRISE_PERMISSION_MATRIX)[]) {
        expect(Object.isFrozen(ENTERPRISE_PERMISSION_MATRIX[role])).toBe(true);
      }
    });
    it('org_admin has all 8 actions', () => {
      expect(ENTERPRISE_PERMISSION_MATRIX.org_admin).toHaveLength(8);
    });
    it('employee can only create_expense', () => {
      expect(ENTERPRISE_PERMISSION_MATRIX.employee).toEqual(['create_expense']);
    });
    it('readonly can only view_org_finances', () => {
      expect(ENTERPRISE_PERMISSION_MATRIX.readonly).toEqual([
        'view_org_finances',
      ]);
    });
    it('auditor cannot create or approve', () => {
      const actions = ENTERPRISE_PERMISSION_MATRIX.auditor;
      expect(actions).not.toContain('create_expense');
      expect(actions).not.toContain('approve_expense');
      expect(actions).not.toContain('edit_policy');
      expect(actions).not.toContain('manage_users');
    });
  });

  describe('canPerform', () => {
    it('org_admin can perform any action', () => {
      expect(canPerform('org_admin', 'edit_policy')).toBe(true);
      expect(canPerform('org_admin', 'manage_users')).toBe(true);
      expect(canPerform('org_admin', 'export_audit')).toBe(true);
    });
    it('employee can create_expense but not approve', () => {
      expect(canPerform('employee', 'create_expense')).toBe(true);
      expect(canPerform('employee', 'approve_expense')).toBe(false);
    });
    it('approver can approve + create but not edit_policy', () => {
      expect(canPerform('approver', 'approve_expense')).toBe(true);
      expect(canPerform('approver', 'create_expense')).toBe(true);
      expect(canPerform('approver', 'edit_policy')).toBe(false);
    });
    it('auditor can view + export but not edit', () => {
      expect(canPerform('auditor', 'view_org_finances')).toBe(true);
      expect(canPerform('auditor', 'export_audit')).toBe(true);
      expect(canPerform('auditor', 'edit_policy')).toBe(false);
    });
    it('returns false for unknown role', () => {
      expect(canPerform('unknown' as never, 'create_expense')).toBe(false);
    });
  });

  describe('getActionsForRole', () => {
    it('returns actions for a known role', () => {
      const actions = getActionsForRole('cost_centre_manager');
      expect(actions).toContain('view_cost_centres');
      expect(actions).toContain('approve_expense');
    });
    it('returns empty for unknown role', () => {
      const actions = getActionsForRole('unknown' as never);
      expect(actions).toEqual([]);
    });
  });

  describe('getRolesForAction', () => {
    it('returns all roles that can create_expense', () => {
      const roles = getRolesForAction('create_expense');
      expect(roles).toEqual(
        expect.arrayContaining([
          'org_admin',
          'department_admin',
          'cost_centre_manager',
          'approver',
          'employee',
        ]),
      );
      expect(roles).not.toContain('auditor');
      expect(roles).not.toContain('readonly');
    });
    it('returns roles that can manage_users', () => {
      const roles = getRolesForAction('manage_users');
      expect(roles).toEqual(['org_admin']);
    });
    it('returns roles that can edit_policy', () => {
      const roles = getRolesForAction('edit_policy');
      expect(roles).toEqual(['org_admin']);
    });
  });

  describe('isAtLeast', () => {
    it('org_admin is at least any role', () => {
      expect(isAtLeast('org_admin', 'employee')).toBe(true);
      expect(isAtLeast('org_admin', 'org_admin')).toBe(true);
    });
    it('employee is NOT at least approver', () => {
      expect(isAtLeast('employee', 'approver')).toBe(false);
    });
    it('approver is at least employee', () => {
      expect(isAtLeast('approver', 'employee')).toBe(true);
    });
    it('readonly is at least readonly', () => {
      expect(isAtLeast('readonly', 'readonly')).toBe(true);
    });
    it('readonly is NOT at least employee', () => {
      expect(isAtLeast('readonly', 'employee')).toBe(false);
    });
    it('auditor ranks below approver but above employee', () => {
      expect(isAtLeast('auditor', 'employee')).toBe(true);
      expect(isAtLeast('auditor', 'approver')).toBe(false);
    });
  });
});
