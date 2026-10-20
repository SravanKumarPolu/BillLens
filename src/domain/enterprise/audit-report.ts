/**
 * Enterprise audit report model.
 *
 * Phase 10 Prompt 92: Enterprise Features.
 *
 * Audit reports are READ-ONLY aggregations over historical data. They
 * do NOT mutate expenses, settlements, or balances. They are designed
 * to be generated on-demand by a use case + persisted as a snapshot.
 *
 * See `docs/enterprise-features.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditReportType =
  | 'spending_summary'
  | 'policy_violations'
  | 'approval_history'
  | 'cost_centre_breakdown'
  | 'department_expenses'
  | 'user_activity';

export interface AuditReportRequest {
  readonly orgId: string;
  readonly type: AuditReportType;
  readonly dateFrom: string;
  readonly dateTo: string;
  /** Optional filters (e.g. { departmentId: 'd_1', costCentreId: 'cc_1' }). */
  readonly filters?: Readonly<Record<string, string>>;
  readonly requestedBy: string;
}

export interface AuditReportSummary {
  readonly totalExpenses: number;
  readonly totalAmountMinor: number;
  readonly currencyCode: string;
  readonly policyViolations: number;
  readonly pendingApprovals: number;
  readonly rejectedApprovals: number;
  readonly generatedAt: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Validates an audit report request:
 *  - orgId required
 *  - type must be one of the known types
 *  - dateFrom <= dateTo (lexicographic ISO comparison is valid for UTC)
 *  - requestedBy required
 *
 * Returns a list of error strings. Empty list = valid.
 */
export function validateAuditReportRequest(
  request: AuditReportRequest,
): readonly string[] {
  const errors: string[] = [];
  if (!request.orgId || request.orgId.length === 0) {
    errors.push('orgId is required');
  }
  const validTypes: AuditReportType[] = [
    'spending_summary',
    'policy_violations',
    'approval_history',
    'cost_centre_breakdown',
    'department_expenses',
    'user_activity',
  ];
  if (!validTypes.includes(request.type)) {
    errors.push(`unknown report type: ${request.type}`);
  }
  if (!request.dateFrom || !request.dateTo) {
    errors.push('dateFrom and dateTo are required');
  } else if (request.dateFrom > request.dateTo) {
    errors.push('dateFrom must be <= dateTo');
  }
  if (!request.requestedBy || request.requestedBy.length === 0) {
    errors.push('requestedBy is required');
  }
  return errors;
}

/**
 * Returns the list of fields a given report type is expected to
 * aggregate. Used by the application layer to drive repository queries.
 */
export function getReportFields(type: AuditReportType): readonly string[] {
  switch (type) {
    case 'spending_summary':
      return ['total_amount', 'expense_count', 'unique_users', 'unique_merchants'];
    case 'policy_violations':
      return ['violation_count', 'block_count', 'warn_count', 'require_approval_count'];
    case 'approval_history':
      return ['approval_count', 'pending_count', 'approved_count', 'rejected_count', 'avg_decision_time_ms'];
    case 'cost_centre_breakdown':
      return ['cost_centre_id', 'total_amount', 'expense_count', 'budget_utilisation_percent'];
    case 'department_expenses':
      return ['department_id', 'total_amount', 'expense_count', 'unique_users'];
    case 'user_activity':
      return ['user_id', 'expense_count', 'total_amount', 'last_activity_at'];
  }
}
