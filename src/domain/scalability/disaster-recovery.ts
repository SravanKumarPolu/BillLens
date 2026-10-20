/**
 * Disaster Recovery (DR) plan registry.
 *
 * Phase 10 Prompt 91: Scalability Architecture.
 *
 * Defines RTO (Recovery Time Objective) and RPO (Recovery Point
 * Objective) targets for each disaster scenario, together with the
 * concrete steps, backup strategy, failover strategy, and testing
 * cadence required to meet those targets.
 *
 * This module is READ-ONLY. It defines policy; it does NOT execute
 * recovery steps.
 *
 * See `docs/scalability-architecture.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DisasterScenario =
  | 'region_failure'
  | 'database_failure'
  | 'storage_failure'
  | 'api_outage'
  | 'data_corruption'
  | 'ransomware'
  | 'cdns_failure';

export interface RecoveryPlan {
  readonly scenario: DisasterScenario;
  /** Recovery Time Objective — max acceptable downtime (minutes). */
  readonly rtoMinutes: number;
  /** Recovery Point Objective — max acceptable data loss (minutes). */
  readonly rpoMinutes: number;
  /** Ordered list of recovery steps. */
  readonly steps: readonly string[];
  /** How backups are taken + stored. */
  readonly backupStrategy: string;
  /** How traffic is redirected during failure. */
  readonly failoverStrategy: string;
  /** How often the plan is rehearsed (e.g. 'quarterly'). */
  readonly testingCadence: string;
}

// ---------------------------------------------------------------------------
// Recovery plan registry
// ---------------------------------------------------------------------------

export const RECOVERY_PLANS: Readonly<Record<DisasterScenario, RecoveryPlan>> =
  Object.freeze({
    region_failure: Object.freeze({
      scenario: 'region_failure',
      rtoMinutes: 30,
      rpoMinutes: 5,
      steps: [
        'Detect region failure via health-check monitor',
        'Promote read replica in failover region to primary',
        'Update DNS / traffic manager to point at failover region',
        'Switch application connection strings via secrets manager',
        'Verify end-to-end health (auth, sync, settlements)',
        'Drain stuck in-flight requests from failed region',
        'Open incident bridge and notify stakeholders',
      ],
      backupStrategy:
        'Continuous WAL streaming to standby region; nightly full snapshot to object storage in second region.',
      failoverStrategy:
        'Active-passive multi-region deployment with DNS-level traffic steering and 60s TTL.',
      testingCadence: 'quarterly',
    }),
    database_failure: Object.freeze({
      scenario: 'database_failure',
      rtoMinutes: 15,
      rpoMinutes: 1,
      steps: [
        'Detect elevated DB error rate or connection failures',
        'Confirm primary unresponsive via direct probe',
        'Promote hot standby to primary',
        'Update PgBouncer / connection pooler target',
        'Replay queued writes from sync outbox',
        'Verify settlement + expense write paths',
        'Open incident and post status-page update',
      ],
      backupStrategy:
        'Hot standby in same region + WAL archiving to object storage every 60s; daily logical backup.',
      failoverStrategy:
        'Automatic promotion of hot standby; PgBouncer re-targets on health signal.',
      testingCadence: 'quarterly',
    }),
    storage_failure: Object.freeze({
      scenario: 'storage_failure',
      rtoMinutes: 45,
      rpoMinutes: 15,
      steps: [
        'Detect object-storage error rate spike',
        'Switch to secondary storage bucket (mirrored)',
        'Re-queue pending attachment uploads to outbox',
        'Verify receipt + attachment read paths',
        'Run integrity check on mirrored objects',
        'Notify support team of any user-visible degradation',
      ],
      backupStrategy:
        'Cross-region replication of object storage; daily integrity verification.',
      failoverStrategy:
        'Application reads/writes against secondary bucket URL via abstraction layer.',
      testingCadence: 'semi-annual',
    }),
    api_outage: Object.freeze({
      scenario: 'api_outage',
      rtoMinutes: 20,
      rpoMinutes: 0,
      steps: [
        'Detect API error-rate or latency alert',
        'Identify offending service via trace',
        'Roll back last deployment if regression detected',
        'Scale out instances if load-induced',
        'Switch to degraded-mode feature flags if needed',
        'Verify mobile app can still operate offline + queue writes',
        'Post status-page update',
      ],
      backupStrategy:
        'Mobile clients operate fully offline; sync resumes when API recovers.',
      failoverStrategy:
        'Stateless API tier behind load balancer; canary + blue-green deployment.',
      testingCadence: 'monthly',
    }),
    data_corruption: Object.freeze({
      scenario: 'data_corruption',
      rtoMinutes: 60,
      rpoMinutes: 60,
      steps: [
        'Identify scope of corruption via integrity scan',
        'Freeze writes to affected tables',
        'Restore affected tables from PITR snapshot to a side DB',
        'Diff restored vs live data to identify lost/corrupt rows',
        'Manually reconcile financial totals (balance-engine invariant)',
        'Cut over to restored dataset after verification',
        'Publish post-mortem with root-cause analysis',
      ],
      backupStrategy:
        'PITR (point-in-time-recovery) with 35-day retention; weekly full logical export.',
      failoverStrategy:
        'Side-by-side restored DB; application switches at the connection layer after integrity verification.',
      testingCadence: 'semi-annual',
    }),
    ransomware: Object.freeze({
      scenario: 'ransomware',
      rtoMinutes: 240,
      rpoMinutes: 60,
      steps: [
        'Isolate affected systems from network immediately',
        'Revoke all access tokens + service credentials',
        'Identify entry point via forensic analysis',
        'Rebuild infrastructure from known-good IaC templates',
        'Restore data from immutable, air-gapped backups',
        'Run integrity + security scans before re-enabling writes',
        'Notify legal + customers per regulatory requirements',
      ],
      backupStrategy:
        'Immutable, write-once-read-many object-storage backups with 90-day retention; air-gapped quarterly full backup.',
      failoverStrategy:
        'Full rebuild from IaC; data restored from immutable backups only after forensic review.',
      testingCadence: 'annual',
    }),
    cdns_failure: Object.freeze({
      scenario: 'cdns_failure',
      rtoMinutes: 15,
      rpoMinutes: 0,
      steps: [
        'Detect CDN edge health-check failures',
        'Switch DNS to origin fallback',
        'Disable CDN-cached static asset routes',
        'Verify app can boot without CDN (inlined fallbacks)',
        'Notify CDN provider and open support ticket',
        'Re-enable CDN after provider confirms recovery',
      ],
      backupStrategy:
        'Static assets versioned + stored in primary object storage; CDN is a cache only.',
      failoverStrategy:
        'DNS-level switch to origin with cache-control headers; assets served directly from object storage.',
      testingCadence: 'semi-annual',
    }),
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the recovery plan for a scenario. Throws on unknown scenario —
 * a programming error.
 */
export function getRecoveryPlan(scenario: DisasterScenario): RecoveryPlan {
  const plan = RECOVERY_PLANS[scenario];
  if (!plan) {
    throw new Error(`Unknown disaster scenario: ${scenario}`);
  }
  return plan;
}

/**
 * Returns true when a scenario's RTO is within the given target (in
 * minutes). Used by capacity-planning dashboards.
 */
export function meetsRto(scenario: DisasterScenario, targetMinutes: number): boolean {
  return getRecoveryPlan(scenario).rtoMinutes <= targetMinutes;
}

/**
 * Returns true when a scenario's RPO is within the given target (in
 * minutes). Used by capacity-planning dashboards.
 */
export function meetsRpo(scenario: DisasterScenario, targetMinutes: number): boolean {
  return getRecoveryPlan(scenario).rpoMinutes <= targetMinutes;
}
