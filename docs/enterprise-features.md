# Enterprise Features

> Phase 10 Prompt 92 — Enterprise-ready capabilities for BillLens.

This document describes the enterprise feature set: organisation
workspaces, departments, cost centres, expense policies, role-based
approvals, spending limits, advanced permissions, audit reports, and
admin dashboards.

## 1. Organisation Model

**Module:** `src/domain/enterprise/organisation-model.ts`

An `Organisation` is the top-level enterprise tenant. Every other
enterprise entity belongs to exactly one organisation.

```ts
interface Organisation {
  id: string;
  name: string;
  plan: 'free' | 'team' | 'enterprise';
  seats: number;
  createdAt: string;
  settings: OrgSettings;
}
```

`OrgSettings` carries policy defaults:

| Setting | Default | Purpose |
|---------|---------|---------|
| `requireReceiptsAbove` | 5 000 (minor) | Expenses above this require a receipt |
| `defaultCurrency` | `USD` | Default currency for new expenses |
| `approvalThreshold` | 25 000 (minor) | Expenses above this require approval |
| `ssoEnabled` | `false` | SAML/OIDC SSO (future) |
| `dataResidency` | `us` | `us` / `eu` / `apac` / `custom` |

## 2. Departments + Cost Centres

**Module:** `src/domain/enterprise/department-model.ts`

Departments form a hierarchy (root → child → grandchild). Cost centres
belong to an org and optionally to a department; they may carry a
budget in minor units.

```
Organisation
  └─ Department: Engineering
      ├─ Department: Backend
      │   └─ CostCentre: BE-001 (budget: ₹500 000)
      └─ Department: Frontend
          └─ CostCentre: FE-001 (budget: ₹300 000)
  └─ Department: Sales
      └─ CostCentre: SALES-001
```

`isHierarchyValid()` detects cycles + cross-org links.
`validateCostCentres()` enforces unique IDs, unique codes per org, and
budget-currency pairing.

## 3. Expense Policies

**Module:** `src/domain/enterprise/expense-policy.ts`

A policy has rules + applies-to scope. Each rule has a type, a
condition (JSON), an action, and an optional threshold.

**Rule types:**
- `spending_limit` — block/warn/approve above an amount
- `receipt_required` — receipt must be attached above an amount
- `approval_required` — approval chain must complete above an amount
- `category_restriction` — certain categories blocked (e.g. alcohol)
- `time_restriction` — off-hours expenses require approval

**Actions** (severity order): `allow` < `warn` < `require_approval` < `block`

`evaluatePolicy()` is PURE — it does NOT mutate the expense or alter
splits. The application layer consults the returned outcome and
decides whether to persist, queue for approval, or reject.

```ts
const result = evaluatePolicy(policy, {
  amountMinor: 6000,
  hasReceipt: true,
  category: 'food',
  hour: 12,
});
// result.outcome === 'warn'
// result.evaluations — per-rule breakdown
```

## 4. Approval Workflow

**Module:** `src/domain/enterprise/approval-workflow.ts`

Threshold-driven, role-based, multi-step approvals.

```
Amount: ₹6 000 (above ₹5 000 threshold)
  ↓
Chain: [manager_1] → [director_1] → [vp_1] → [cfo_1]
  ↓
Status: pending → approved → approved → approved
  ↓
Result: fully approved
```

- `shouldRequireApproval(amount, threshold)` — pure check
- `getApprovalChain(config, amount)` — returns ordered approver IDs
- `getNextApprover(chain, requests)` — first non-decided approver
- `isFullyApproved(chain, requests)` — every chain member approved
- `computeApprovalExpiry(requestedAt, slaDays=7)` — SLA expiry timestamp

**Financial safety:** approvals are a GATE. An expense requiring
approval is persisted as `pending_approval`; the split-engine still
enforces zero-sum + payer-total invariants regardless of approval
status.

## 5. Spending Limits

**Module:** `src/domain/enterprise/spending-limits.ts`

Period-scoped spend caps with four scopes:

| Scope | Applies to |
|-------|-----------|
| `org` | All expenses in the organisation |
| `department` | All expenses in a department |
| `cost_centre` | All expenses tagged to a cost centre |
| `user` | All expenses created by a user |

**Periods:** `daily`, `weekly`, `monthly`, `quarterly`, `yearly`

`checkSpendingLimit(currentSpend, limit)` returns:

```ts
{
  exceeded: boolean,
  remaining: number,        // can be negative
  action: 'block' | 'warn' | 'require_approval',
  utilisationPercent: number,
}
```

**Financial safety:** limits are EVALUATIVE only. They never alter
splits, never mutate the expense, never block settlements. The
application layer is responsible for acting on `action`.

`getMostExceededLimit(currentSpend, limits)` returns the worst-case
limit (highest utilisation, ties broken by action severity). Useful
when multiple limits apply simultaneously.

## 6. Enterprise Permissions

**Module:** `src/domain/enterprise/enterprise-permissions.ts`

7 roles × 8 actions matrix.

| Role | Description |
|------|-------------|
| `org_admin` | Full access to all enterprise actions |
| `department_admin` | Department-scoped finances + approvals |
| `cost_centre_manager` | Cost-centre view + approvals + create |
| `approver` | Approve + create expenses |
| `employee` | Create expenses only |
| `auditor` | View + export audit reports (read-only) |
| `readonly` | View org finances only |

**Actions:**
`view_org_finances`, `view_department_finances`, `approve_expense`,
`create_expense`, `edit_policy`, `manage_users`, `export_audit`,
`view_cost_centres`

```ts
canPerform('org_admin', 'edit_policy')         // true
canPerform('employee', 'approve_expense')      // false
canPerform('auditor', 'export_audit')          // true
canPerform('auditor', 'edit_policy')           // false
```

**Important:** enterprise permissions are ADDITIVE to group-level
permissions. An `org_admin` still must be a member of a group to act
on that group's expenses. See `domain/services/permissions/`.

## 7. Audit Reports

**Module:** `src/domain/enterprise/audit-report.ts`

Six report types:

| Type | Aggregates |
|------|-----------|
| `spending_summary` | Total amount, count, unique users, merchants |
| `policy_violations` | Block / warn / require_approval counts |
| `approval_history` | Approval counts + avg decision time |
| `cost_centre_breakdown` | Per cost-centre spend + budget utilisation |
| `department_expenses` | Per department spend + unique users |
| `user_activity` | Per user expense count + last activity |

`validateAuditReportRequest()` enforces:
- orgId required
- type is one of the 6 known types
- dateFrom ≤ dateTo (ISO comparison)
- requestedBy required

Reports are READ-ONLY aggregations — they never mutate expenses,
settlements, or balances. The application layer persists a snapshot
of the generated report for archival.

## 8. Admin Dashboard

The admin dashboard (built in the presentation layer) composes:
- Capacity metrics (`scalability/capacity-model.ts`)
- Audit report requests (`enterprise/audit-report.ts`)
- Permission matrix viewer (`enterprise/enterprise-permissions.ts`)
- Approval queue (`enterprise/approval-workflow.ts`)
- Spending-limit utilisation (`enterprise/spending-limits.ts`)

Access to the dashboard requires `org_admin` or `auditor` role.

## 9. Enterprise Identity Provider (future-ready)

`OrgSettings.ssoEnabled` is the toggle. When `true`:
- SAML 2.0 (for Microsoft Entra / Okta / Google Workspace)
- OIDC (for Auth0 / Keycloak / AWS Cognito)
- JIT (just-in-time) provisioning on first sign-in
- SCIM 2.0 user provisioning (future)

The `enterprise-permissions.ts` matrix is enforced post-SSO; SSO
authenticates identity, the matrix authorises actions.

## 10. Data Residency

`OrgSettings.dataResidency` controls where org data is stored:

| Region | Storage location |
|--------|-----------------|
| `us` | US-East-1 + US-West-2 (active-passive) |
| `eu` | EU-Central-1 (Frankfurt) |
| `apac` | AP-South-1 (Mumbai) |
| `custom` | Customer-specified (enterprise contract) |

Changing data residency requires a formal migration with a planned
cutover; it is NOT a self-service toggle.

## 11. Financial Safety Under Enterprise Features

All enterprise features preserve financial correctness:

1. **Policies** return a decision; they never alter splits.
2. **Approvals** are a gate; splits are still computed by the
   split-engine using integer minor units.
3. **Spending limits** are evaluative; they never mutate amounts.
4. **Audit reports** are read-only aggregations.
5. **Permissions** are additive to (not replacements for) group-level
   permissions.

The split-engine + balance-engine + settlement-engine continue to
enforce their invariants regardless of enterprise policy outcomes.

## 12. Enterprise Onboarding

1. Customer signs contract → org created with `plan='enterprise'`.
2. `org_admin` user provisioned (via SSO or email invite).
3. `org_admin` configures `OrgSettings` (currency, threshold, residency).
4. Departments + cost centres created (via UI or CSV import).
5. Expense policies defined (templates available).
6. Spending limits set per scope.
7. Users assigned roles (via SSO groups or manual).
8. First audit report generated to establish baseline.

## 13. Future Work

- SSO connectors (SAML, OIDC) — Phase 11
- SCIM 2.0 user provisioning — Phase 12
- Custom approval chains via drag-and-drop UI — Phase 11
- Budget vs actuals dashboards — Phase 12
- Multi-currency expense policies — Phase 13
