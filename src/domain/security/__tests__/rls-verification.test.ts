import { describe, expect, it } from '@jest/globals';

import {
  PHASE_9_TABLES,
  TABLES_REQUIRING_RLS,
  generateRlsChecks,
  missingPhase9Tables,
  phase9TablesCovered,
  verifyRlsCoverage,
} from '../rls-verification';

describe('rls-verification', () => {
  describe('TABLES_REQUIRING_RLS', () => {
    it('includes Phase 1-5 tables', () => {
      const phase1to5 = [
        'profiles',
        'groups',
        'group_members',
        'group_invites',
        'expenses',
        'expense_payers',
        'expense_splits',
        'receipts',
        'receipt_items',
        'settlements',
        'device_installations',
        'audit_logs',
        'expense_drafts',
        'capture_sources',
        'extraction_results',
        'payment_evidence',
        'receipt_privacy_preferences',
        'duplicate_candidates',
        'field_corrections',
      ];
      for (const table of phase1to5) {
        expect(TABLES_REQUIRING_RLS).toContain(table);
      }
    });

    // v2.4.0: the list mirrors the ACTUAL cloud schema. The nine Phase-9
    // tables (analytics_events, analytics_consent, feedback,
    // experiment_assignments, experiment_outcomes, monitoring_metrics,
    // support_tickets, knowledge_articles, ocr_correction_stats) do NOT
    // exist in any migration — they were aspirational list entries that
    // made the checker unrunnable against a real database. When those
    // tables land in a migration, add them HERE and to the list together.
    it('does NOT list tables absent from the cloud migrations', () => {
      for (const phantom of [
        'analytics_events',
        'analytics_consent',
        'feedback',
        'experiment_assignments',
        'experiment_outcomes',
        'monitoring_metrics',
        'support_tickets',
        'knowledge_articles',
        'ocr_correction_stats',
      ]) {
        expect(TABLES_REQUIRING_RLS).not.toContain(phantom);
      }
    });

    it('includes the v2.4.0 identity + deletion tables', () => {
      expect(TABLES_REQUIRING_RLS).toContain('guest_identity_links');
      expect(TABLES_REQUIRING_RLS).toContain('settlement_state_history');
      expect(TABLES_REQUIRING_RLS).toContain('settlement_reminders');
      expect(TABLES_REQUIRING_RLS).toContain('member_payment_handles');
      expect(TABLES_REQUIRING_RLS).toContain('sync_conflicts');
      expect(TABLES_REQUIRING_RLS).toContain('account_deletion_requests');
    });

    it('exposes exactly the 25 tables that exist in the cloud schema', () => {
      expect(TABLES_REQUIRING_RLS.length).toBe(25);
    });
  });

  describe('PLANNED_PHASE_9_TABLES (via PHASE_9_TABLES alias)', () => {
    it('lists exactly the 9 planned-but-not-yet-migrated tables', () => {
      expect(PHASE_9_TABLES).toEqual([
        'analytics_events',
        'analytics_consent',
        'feedback',
        'experiment_assignments',
        'experiment_outcomes',
        'monitoring_metrics',
        'support_tickets',
        'knowledge_articles',
        'ocr_correction_stats',
      ]);
      expect(PHASE_9_TABLES.length).toBe(9);
    });

    it('NO planned Phase 9 table appears in TABLES_REQUIRING_RLS (schema first)', () => {
      // v2.4.0 contract: TABLES_REQUIRING_RLS mirrors the REAL schema;
      // planned tables join only when their migration lands.
      for (const t of PHASE_9_TABLES) {
        expect(TABLES_REQUIRING_RLS).not.toContain(t);
      }
    });
  });

  describe('generateRlsChecks', () => {
    it('produces one check per table', () => {
      const checks = generateRlsChecks(TABLES_REQUIRING_RLS);
      expect(checks.length).toBe(TABLES_REQUIRING_RLS.length);
    });

    it('every check requires RLS', () => {
      const checks = generateRlsChecks(['expenses', 'feedback']);
      for (const c of checks) {
        expect(c.requiresRls).toBe(true);
      }
    });

    it('defaults minimumPolicyCount to 4 (one per SQL operation)', () => {
      const checks = generateRlsChecks(['expenses']);
      expect(checks[0]!.minimumPolicyCount).toBe(4);
    });

    it('honours a custom minimumPolicyCount', () => {
      const checks = generateRlsChecks(['expenses'], 1);
      expect(checks[0]!.minimumPolicyCount).toBe(1);
    });

    it('provides a non-empty reason for each table', () => {
      const checks = generateRlsChecks(TABLES_REQUIRING_RLS);
      for (const c of checks) {
        expect(c.reason.length).toBeGreaterThan(0);
      }
    });

    it('deduplicates repeated table names', () => {
      const checks = generateRlsChecks(['expenses', 'expenses', 'feedback']);
      expect(checks.length).toBe(2);
    });

    it('rejects an invalid minimumPolicyCount', () => {
      expect(() => generateRlsChecks(['expenses'], -1)).toThrow();
      expect(() => generateRlsChecks(['expenses'], 1.5)).toThrow();
    });

    it('rejects an invalid table name', () => {
      expect(() => generateRlsChecks([''])).toThrow();
    });

    it('returns frozen output', () => {
      const checks = generateRlsChecks(['expenses']);
      expect(Object.isFrozen(checks)).toBe(true);
      expect(Object.isFrozen(checks[0])).toBe(true);
    });

    it('reason for financial tables mentions amounts or payments', () => {
      const checks = generateRlsChecks(['expenses', 'payment_evidence']);
      const expensesReason = checks.find((c) => c.table === 'expenses')!.reason;
      const paymentReason = checks.find((c) => c.table === 'payment_evidence')!.reason;
      expect(expensesReason.toLowerCase()).toMatch(/amount/);
      expect(paymentReason.toLowerCase()).toMatch(/payment|upi|utr/);
    });

    it('reason for support_tickets mentions consent-gated access', () => {
      const checks = generateRlsChecks(['support_tickets']);
      const reason = checks[0]!.reason.toLowerCase();
      expect(reason).toMatch(/consent/);
    });
  });

  describe('verifyRlsCoverage', () => {
    it('returns covered=[] missing=[all] when no policies exist', () => {
      const result = verifyRlsCoverage([], TABLES_REQUIRING_RLS);
      expect(result.covered).toEqual([]);
      expect(result.missing.length).toBe(TABLES_REQUIRING_RLS.length);
    });

    it('returns covered=[all] missing=[] when all tables have RLS', () => {
      const result = verifyRlsCoverage(TABLES_REQUIRING_RLS, TABLES_REQUIRING_RLS);
      expect(result.covered.length).toBe(TABLES_REQUIRING_RLS.length);
      expect(result.missing).toEqual([]);
    });

    it('identifies missing tables by name', () => {
      const existing = ['profiles', 'groups', 'expenses'];
      const required = ['profiles', 'expenses', 'feedback', 'support_tickets'];
      const result = verifyRlsCoverage(existing, required);
      expect(result.covered).toEqual(['profiles', 'expenses']);
      expect(result.missing).toEqual(['feedback', 'support_tickets']);
    });

    it('CRITICAL — absent tables are flagged missing', () => {
      // Every required table except the first is "absent".
      const [first, ...rest] = TABLES_REQUIRING_RLS;
      const result = verifyRlsCoverage([first!], rest);
      expect(result.missing.length).toBe(rest.length);
      for (const t of rest) {
        expect(result.missing).toContain(t);
      }
    });

    it('does not flag tables as missing when they ARE present', () => {
      const result = verifyRlsCoverage(TABLES_REQUIRING_RLS, TABLES_REQUIRING_RLS);
      expect(result.missing).toHaveLength(0);
      for (const t of TABLES_REQUIRING_RLS) {
        expect(result.covered).toContain(t);
      }
    });

    it('returns frozen output', () => {
      const result = verifyRlsCoverage([], ['expenses']);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.covered)).toBe(true);
      expect(Object.isFrozen(result.missing)).toBe(true);
    });
  });

  describe('phase9TablesCovered', () => {
    it('returns true when all planned Phase 9 tables are present', () => {
      expect(phase9TablesCovered(PHASE_9_TABLES)).toBe(true);
    });

    it('returns false while planned Phase 9 tables are un-migrated', () => {
      // v2.4.0: the canonical list does NOT include the planned tables —
      // by definition they are not "covered" until their migration lands.
      expect(phase9TablesCovered(TABLES_REQUIRING_RLS)).toBe(false);
    });

    it('returns false when any Phase 9 table is missing', () => {
      const partial = PHASE_9_TABLES.filter((t) => t !== 'feedback');
      expect(phase9TablesCovered(partial)).toBe(false);
    });

    it('returns false when no tables are present', () => {
      expect(phase9TablesCovered([])).toBe(false);
    });
  });

  describe('missingPhase9Tables', () => {
    it('returns [] when all Phase 9 tables are present', () => {
      expect(missingPhase9Tables(PHASE_9_TABLES)).toEqual([]);
    });

    it('returns the missing Phase 9 tables', () => {
      const existing = ['analytics_events', 'feedback'];
      const missing = missingPhase9Tables(existing);
      expect(missing.length).toBe(7);
      expect(missing).not.toContain('analytics_events');
      expect(missing).not.toContain('feedback');
      expect(missing).toContain('support_tickets');
      expect(missing).toContain('ocr_correction_stats');
    });

    it('returns all 9 Phase 9 tables when none are present', () => {
      const missing = missingPhase9Tables([]);
      expect(missing.length).toBe(9);
    });
  });

  describe('CRITICAL — Phase 9 RLS regression guard (schema-first)', () => {
    it('the canonical list contains NO table absent from the migrations', () => {
      // v2.4.0 regression guard, inverted from the original: listing a
      // table that no migration creates would make the checker fail
      // against every real database. When a Phase 9 table lands in a
      // migration, it MUST be added to TABLES_REQUIRING_RLS + this test.
      const canonicalSet = new Set(TABLES_REQUIRING_RLS);
      for (const t of PHASE_9_TABLES) {
        expect(canonicalSet.has(t)).toBe(false);
      }
    });

    it('RLS check generation covers every CANONICAL table', () => {
      const checks = generateRlsChecks(TABLES_REQUIRING_RLS);
      for (const t of TABLES_REQUIRING_RLS) {
        expect(checks.some((c) => c.table === t)).toBe(true);
      }
    });
  });
});
