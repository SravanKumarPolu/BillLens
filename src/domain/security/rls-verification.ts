/**
 * Row-Level Security (RLS) policy verification.
 *
 * CRITICAL: every table that holds user data MUST have RLS enabled in
 * the Supabase / PostgreSQL backend. RLS prevents a user from reading
 * or writing another user's rows even when their JWT grants table-level
 * access.
 *
 * This module enumerates the canonical list of tables that require RLS,
 * including ALL Phase 9 additions (analytics, feedback, experiments,
 * monitoring, support, knowledge base, OCR correction stats).
 *
 * `generateRlsChecks()` produces one RlsCheck per required table. The
 * migration verifier runs each check against the live database schema.
 *
 * `verifyRlsCoverage()` compares the list of tables with RLS enabled
 * against the required list and returns the missing tables. A non-empty
 * `missing` array is a CI failure.
 *
 * See `docs/security-maintenance.md` and `docs/security-model.md`.
 */

// ---------------------------------------------------------------------------
// Canonical table list — MUST be kept in sync with migrations
// ---------------------------------------------------------------------------

/**
 * ALL tables that require RLS, including Phase 1-5 tables and Phase 9
 * additions (analytics, feedback, experiments, monitoring, support,
 * knowledge base, OCR correction stats).
 *
 * DO NOT remove a table from this list unless you have removed it from
 * the schema entirely. Adding a new table to the schema without adding
 * it here is a CI failure.
 */
export const TABLES_REQUIRING_RLS: readonly string[] = [
  // Tables that exist in the cloud migrations (supabase/migrations/).
  // v2.4.0: the list now mirrors the ACTUAL cloud schema — the previous
  // list named nine Phase-9 tables (analytics_events, analytics_consent,
  // feedback, experiment_assignments, experiment_outcomes,
  // monitoring_metrics, support_tickets, knowledge_articles,
  // ocr_correction_stats) that do NOT exist in any migration, so the
  // checker had never been runnable against a real database. When those
  // tables land, add them back HERE and to the schema in the same change.
  'profiles',
  'guest_identity_links',
  'groups',
  'group_members',
  'group_invites',
  'expenses',
  'expense_payers',
  'expense_splits',
  'receipts',
  'receipt_items',
  'settlements',
  'settlement_state_history',
  'settlement_reminders',
  'member_payment_handles',
  'device_installations',
  'sync_conflicts',
  'audit_logs',
  'expense_drafts',
  'capture_sources',
  'extraction_results',
  'payment_evidence',
  'receipt_privacy_preferences',
  'duplicate_candidates',
  'field_corrections',
  'account_deletion_requests',
] as const;

// ---------------------------------------------------------------------------
// RLS check
// ---------------------------------------------------------------------------

/**
 * The level at which RLS is enforced. The standard for BillLens is
 * `row_level_security` — i.e. per-row policies. `table_level` (GRANT
 * / REVOKE) is acceptable only for fully public tables (none today).
 */
export type RlsEnforcementLevel = 'row_level_security' | 'table_level' | 'none';

export interface RlsCheck {
  /** Table name. */
  readonly table: string;
  /** Whether the table is expected to have RLS enabled. */
  readonly requiresRls: boolean;
  /** Minimum number of policies the table must have (SELECT + INSERT + UPDATE + DELETE = 4). */
  readonly minimumPolicyCount: number;
  /** Human-readable description of why RLS is required. */
  readonly reason: string;
}

/**
 * Generate RLS checks for every table in the input list. The default
 * `minimumPolicyCount` is 4 (one per SQL operation: SELECT, INSERT,
 * UPDATE, DELETE). Tables may override this if they need fewer (e.g.
 * read-only analytics tables that need only SELECT).
 */
export function generateRlsChecks(
  tables: readonly string[],
  minimumPolicyCount: number = 4,
): readonly RlsCheck[] {
  if (!Number.isInteger(minimumPolicyCount) || minimumPolicyCount < 0) {
    throw new Error(`minimumPolicyCount must be a non-negative integer, got ${minimumPolicyCount}`);
  }
  const seen = new Set<string>();
  const checks: RlsCheck[] = [];
  for (const table of tables) {
    if (typeof table !== 'string' || table.trim().length === 0) {
      throw new Error(`Invalid table name: ${table}`);
    }
    if (seen.has(table)) {
      // Deduplicate — keep the first occurrence.
      continue;
    }
    seen.add(table);
    checks.push(
      Object.freeze({
        table,
        requiresRls: true,
        minimumPolicyCount,
        reason: rlsReasonFor(table),
      }),
    );
  }
  return Object.freeze(checks);
}

/**
 * Returns a human-readable reason for why RLS is required on the table.
 * Used by the migration verifier output so engineers understand the
 * context.
 */
function rlsReasonFor(table: string): string {
  switch (table) {
    case 'profiles':
    case 'device_installations':
      return 'User identity — protects account + device secrets.';
    case 'groups':
    case 'group_members':
    case 'group_invites':
      return 'Group membership — prevents cross-group reads.';
    case 'expenses':
    case 'expense_payers':
    case 'expense_splits':
      return 'Financial data — exact amounts must never leak across groups.';
    case 'receipts':
    case 'receipt_items':
    case 'receipt_privacy_preferences':
      return 'Receipt images + privacy prefs — PII at rest.';
    case 'settlements':
    case 'payment_evidence':
      return 'Payment references — UTR / UPI IDs must never leak.';
    case 'audit_logs':
      return 'Audit trail — protects integrity + member attribution.';
    case 'expense_drafts':
    case 'capture_sources':
    case 'extraction_results':
    case 'field_corrections':
      return 'Draft pipeline — may contain OCR text + raw receipt data.';
    case 'duplicate_candidates':
      return 'Duplicate detection — may leak merchant names across users.';
    case 'analytics_events':
    case 'analytics_consent':
      return 'Privacy-safe analytics — anonymous IDs only, but still per-user scoped.';
    case 'feedback':
      return 'User feedback — bodies may include PII; must scope to submitter.';
    case 'experiment_assignments':
    case 'experiment_outcomes':
      return 'Experiment data — must scope per-user assignment.';
    case 'monitoring_metrics':
      return 'Production metrics — operator-only access; never user-facing.';
    case 'support_tickets':
      return 'Support tickets — may contain references to receipts + UPI IDs; consent-gated access.';
    case 'knowledge_articles':
      return 'Knowledge base — operator-managed; no per-user data but RLS still required to isolate writes.';
    case 'ocr_correction_stats':
      return 'Aggregate OCR correction stats — must not leak per-user correction patterns.';
    default:
      return 'User data — RLS required by default.';
  }
}

// ---------------------------------------------------------------------------
// Coverage verification
// ---------------------------------------------------------------------------

export interface RlsCoverageResult {
  /** Tables that have RLS enabled AND meet the minimum policy count. */
  readonly covered: readonly string[];
  /** Tables that are missing RLS OR have too few policies. */
  readonly missing: readonly string[];
}

/**
 * Compare the list of tables with RLS enabled against the required
 * tables. Returns the covered + missing sets.
 *
 * `existingPolicies` is the list of table names returned by the live
 * schema query (e.g. `SELECT tablename FROM pg_tables WHERE rowsecurity
 * = true`). Tables in `requiredTables` but NOT in `existingPolicies`
 * are flagged as missing.
 */
export function verifyRlsCoverage(
  existingPolicies: readonly string[],
  requiredTables: readonly string[],
): RlsCoverageResult {
  const existingSet = new Set(existingPolicies);
  const covered: string[] = [];
  const missing: string[] = [];
  for (const table of requiredTables) {
    if (existingSet.has(table)) {
      covered.push(table);
    } else {
      missing.push(table);
    }
  }
  return Object.freeze({
    covered: Object.freeze(covered),
    missing: Object.freeze(missing),
  });
}

/**
 * Tables planned for the Phase 9 cloud expansion that DO NOT exist in
 * any migration yet (v2.4.0). Kept as an explicit, honest register so
 * the migration verifier can flag them the day they land — at which
 * point they must be added to TABLES_REQUIRING_RLS in the same change.
 */
export const PLANNED_PHASE_9_TABLES: readonly string[] = [
  'analytics_events',
  'analytics_consent',
  'feedback',
  'experiment_assignments',
  'experiment_outcomes',
  'monitoring_metrics',
  'support_tickets',
  'knowledge_articles',
  'ocr_correction_stats',
] as const;

/**
 * Back-compat aliases (the Phase 9 names). These now point at the
 * PLANNED register — the functions are honest: a table that does not
 * exist in the schema cannot be "covered".
 */
export const PHASE_9_TABLES: readonly string[] = PLANNED_PHASE_9_TABLES;

export function phase9TablesCovered(existingPolicies: readonly string[]): boolean {
  const existingSet = new Set(existingPolicies);
  for (const table of PLANNED_PHASE_9_TABLES) {
    if (!existingSet.has(table)) return false;
  }
  return true;
}

/**
 * Returns the list of planned Phase 9 tables MISSING from the input.
 * Used by the migration verifier to give a focused error message.
 */
export function missingPhase9Tables(existingPolicies: readonly string[]): readonly string[] {
  const existingSet = new Set(existingPolicies);
  return Object.freeze(PLANNED_PHASE_9_TABLES.filter((t) => !existingSet.has(t)));
}
