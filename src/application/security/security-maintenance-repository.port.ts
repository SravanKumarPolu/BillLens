/**
 * Repository port for security maintenance persistence.
 *
 * Implementations MUST only persist already-redacted data. Secret
 * rotation records store HASHES only — never raw secrets.
 */

import type {
  DependencyAuditSummary,
  PenetrationFinding,
  PenetrationTest,
  RlsCoverageResult,
  SecretRotationRecord,
  VulnerabilityScanResult,
} from '@domain/security';

export interface SecurityMaintenanceRepository {
  /** Persist a vulnerability scan result. */
  saveVulnerabilityScan(result: VulnerabilityScanResult): Promise<void>;

  /** Persist a dependency audit summary. */
  saveDependencyAudit(audit: DependencyAuditSummary): Promise<void>;

  /** Persist a secret rotation record (hash only — never raw secret). */
  saveRotationRecord(record: SecretRotationRecord): Promise<void>;

  /** Read all rotation records. */
  listRotationRecords(): Promise<readonly SecretRotationRecord[]>;

  /** Persist a penetration test + its findings. */
  savePenetrationTest(test: PenetrationTest, findings: readonly PenetrationFinding[]): Promise<void>;

  /** Read all penetration findings (across all tests). */
  listPenetrationFindings(): Promise<readonly PenetrationFinding[]>;

  /** Persist the result of an RLS coverage check. */
  saveRlsCoverageResult(result: RlsCoverageResult, checkedAt: string): Promise<void>;
}
