/**
 * Department + cost-centre model.
 *
 * Phase 10 Prompt 92: Enterprise Features.
 *
 * Departments form a hierarchy (parentId points upward). Cost centres
 * belong to an org and optionally to a department, and may carry a
 * budget expressed in minor units + currency code.
 *
 * This module is PURE and READ-ONLY.
 *
 * See `docs/enterprise-features.md`.
 */

// ---------------------------------------------------------------------------
// Department
// ---------------------------------------------------------------------------

export interface Department {
  readonly id: string;
  readonly orgId: string;
  readonly name: string;
  /** Parent department ID — undefined for top-level departments. */
  readonly parentId?: string;
  /** User ID of the department head. */
  readonly headId?: string;
}

/**
 * Validates a department hierarchy chain.
 *
 * Returns true when the chain is acyclic and every parentId refers to
 * a department in the same org. Cycles are detected by walking up
 * the chain from `departmentId` and checking for revisits.
 */
export function isHierarchyValid(
  departments: readonly Department[],
): boolean {
  const byId = new Map<string, Department>();
  for (const d of departments) {
    if (byId.has(d.id)) {
      return false; // duplicate id
    }
    byId.set(d.id, d);
  }
  for (const d of departments) {
    const visited = new Set<string>();
    let current: Department | undefined = d;
    while (current?.parentId) {
      if (visited.has(current.id)) {
        return false; // cycle
      }
      visited.add(current.id);
      const parent = byId.get(current.parentId);
      if (!parent) {
        return false; // dangling parent
      }
      if (parent.orgId !== d.orgId) {
        return false; // cross-org link
      }
      current = parent;
    }
  }
  return true;
}

/**
 * Returns the ancestor chain (root → immediate parent) for a
 * department, or empty array if the department is top-level.
 */
export function getDepartmentAncestors(
  departmentId: string,
  departments: readonly Department[],
): readonly Department[] {
  const byId = new Map(departments.map((d) => [d.id, d] as const));
  const chain: Department[] = [];
  let current = byId.get(departmentId);
  if (!current) {
    return [];
  }
  const visited = new Set<string>();
  while (current?.parentId) {
    if (visited.has(current.id)) {
      break; // cycle safety
    }
    visited.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) {
      break;
    }
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Cost centre
// ---------------------------------------------------------------------------

export interface CostCentre {
  readonly id: string;
  readonly orgId: string;
  readonly name: string;
  /** Human-readable short code (e.g. 'ENG-001'). */
  readonly code: string;
  /** Optional department this cost centre belongs to. */
  readonly departmentId?: string;
  /** Optional budget in minor units. */
  readonly budgetMinor?: number;
  /** Currency code for the budget. */
  readonly budgetCurrency?: string;
}

/**
 * Validates a cost-centre list:
 *  - ids unique
 *  - codes unique within an org
 *  - departmentId (when set) must refer to a department in the same org
 *  - budgetCurrency is required when budgetMinor is set
 */
export function validateCostCentres(
  costCentres: readonly CostCentre[],
  departments: readonly Department[],
): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const codesByOrg = new Map<string, Set<string>>();
  const deptByOrg = new Map<string, Map<string, Department>>();
  for (const d of departments) {
    if (!deptByOrg.has(d.orgId)) {
      deptByOrg.set(d.orgId, new Map());
    }
    deptByOrg.get(d.orgId)!.set(d.id, d);
  }
  for (const cc of costCentres) {
    if (ids.has(cc.id)) {
      errors.push(`duplicate cost-centre id: ${cc.id}`);
    }
    ids.add(cc.id);
    if (!codesByOrg.has(cc.orgId)) {
      codesByOrg.set(cc.orgId, new Set());
    }
    const codes = codesByOrg.get(cc.orgId)!;
    if (codes.has(cc.code)) {
      errors.push(`duplicate cost-centre code in org ${cc.orgId}: ${cc.code}`);
    }
    codes.add(cc.code);
    if (cc.departmentId) {
      const deptMap = deptByOrg.get(cc.orgId);
      if (!deptMap || !deptMap.has(cc.departmentId)) {
        errors.push(
          `cost-centre ${cc.id} references unknown department ${cc.departmentId} in org ${cc.orgId}`,
        );
      }
    }
    if (cc.budgetMinor !== undefined && !cc.budgetCurrency) {
      errors.push(
        `cost-centre ${cc.id} has budgetMinor but no budgetCurrency`,
      );
    }
  }
  return errors;
}
