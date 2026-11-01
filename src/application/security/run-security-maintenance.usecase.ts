/**
 * Use case: Run a full security maintenance check.
 *
 * Orchestrates:
 *   1. Dependency audit (classifies vulnerabilities + abandonment +
 *      Expo native-module risks).
 *   2. Vulnerability scan result classification (pass / warn / fail).
 *   3. Secret rotation schedule (which secrets are due / overdue).
 *   4. RLS coverage verification (all Phase 9 tables covered).
 *   5. Storage review (data classification fits each tier's ceiling).
 *   6. Penetration test risk score (0..100).
 *
 * The use case is a coordinator — it delegates to the domain pure
 * functions and the repository port for persistence. The use case
 * NEVER persists raw secrets.
 */

import {
  computeRiskScore,
  computeRotationSchedule,
  isRotationDue,
  riskScoreBand,
  STUB_SECRET_HASHER,
  TABLES_REQUIRING_RLS,
  auditDependencies,
  classifyScanResult,
  generateRlsChecks,
  reviewAllTiers,
  verifyRlsCoverage,
  type DependencyAuditSummary,
  type DependencyMetadata,
  type RlsCoverageResult,
  type ScanVerdict,
  type SecretRotationRecord,
  type StorageReviewResult,
  type UpcomingRotation,
  type VulnerabilityScanResult,
} from '@domain/security';
import type { PenetrationFinding } from '@domain/security/penetration-test-framework';

import type { SecurityMaintenanceRepository } from './security-maintenance-repository.port';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface RunSecurityMaintenanceInput {
  /** ISO date-time "now" — defaults to the current time when the use case runs. */
  readonly nowIso: string;
  /** Dependency metadata snapshot (e.g. from `npm outdated --json` + registry). */
  readonly dependencies: readonly DependencyMetadata[];
  /** Running Expo SDK version (e.g. "51" or "sdk-51"). */
  readonly runningExpoSdk: string | null;
  /** Latest vulnerability scan result. */
  readonly vulnerabilityScan: VulnerabilityScanResult;
  /** Existing secret rotation records (hashes only). */
  readonly rotationRecords: readonly SecretRotationRecord[];
  /** Existing penetration test findings (across all tests). */
  readonly penetrationFindings: readonly PenetrationFinding[];
  /** Tables that have RLS enabled in the live schema. */
  readonly existingRlsTables: readonly string[];
  /** Lookahead (days) for the rotation schedule. */
  readonly rotationLookaheadDays?: number;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface SecurityMaintenanceReport {
  readonly generatedAt: string;
  readonly dependencyAudit: DependencyAuditSummary;
  readonly scanVerdict: ScanVerdict;
  readonly rotationSchedule: readonly UpcomingRotation[];
  readonly rotationsDue: readonly UpcomingRotation[];
  readonly rlsCoverage: RlsCoverageResult;
  readonly rlsChecksCount: number;
  readonly storageReviews: Readonly<Record<string, readonly StorageReviewResult[]>>;
  readonly penetrationRiskScore: number;
  readonly penetrationRiskBand: 'low' | 'medium' | 'high' | 'critical';
  readonly overallStatus: 'healthy' | 'attention_required' | 'urgent_action';
  readonly recommendations: readonly string[];
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class RunSecurityMaintenanceUseCase {
  constructor(private readonly repo: SecurityMaintenanceRepository) {}

  async execute(input: RunSecurityMaintenanceInput): Promise<SecurityMaintenanceReport> {
    if (Number.isNaN(Date.parse(input.nowIso))) {
      throw new Error('nowIso must be a valid ISO date-time');
    }

    // 1. Dependency audit.
    const dependencyAudit = auditDependencies(
      input.dependencies,
      input.nowIso,
      input.runningExpoSdk,
    );

    // 2. Vulnerability scan classification.
    const scanVerdict = classifyScanResult(input.vulnerabilityScan);

    // 3. Secret rotation schedule.
    const rotationSchedule = computeRotationSchedule(
      input.rotationRecords,
      input.nowIso,
      input.rotationLookaheadDays ?? 365,
    );
    const rotationsDue = rotationSchedule.filter(
      (r) => isRotationDue(
        input.rotationRecords.find((rec) => rec.type === r.type) ?? null,
        input.nowIso,
        0,
      ),
    );

    // 4. RLS coverage verification.
    const rlsChecks = generateRlsChecks(TABLES_REQUIRING_RLS);
    const rlsCoverage = verifyRlsCoverage(
      input.existingRlsTables,
      TABLES_REQUIRING_RLS,
    );

    // 5. Storage review (per data sensitivity).
    const storageReviews: Record<string, readonly StorageReviewResult[]> = {
      public: reviewAllTiers('public'),
      internal: reviewAllTiers('internal'),
      confidential: reviewAllTiers('confidential'),
      restricted: reviewAllTiers('restricted'),
      top_secret: reviewAllTiers('top_secret'),
    };

    // 6. Penetration test risk score.
    const penetrationRiskScore = computeRiskScore(input.penetrationFindings);
    const penetrationRiskBand = riskScoreBand(penetrationRiskScore);

    // 7. Compose recommendations.
    const recommendations: string[] = [];
    if (dependencyAudit.urgentCount > 0) {
      recommendations.push(
        `${dependencyAudit.urgentCount} urgent dependencies require immediate rotation or upgrade.`,
      );
    }
    if (scanVerdict === 'fail') {
      recommendations.push('Vulnerability scan failed — address critical advisories immediately.');
    } else if (scanVerdict === 'warn') {
      recommendations.push('Vulnerability scan warnings — schedule upgrades within 7 days.');
    }
    if (rotationsDue.length > 0) {
      recommendations.push(
        `${rotationsDue.length} secret rotations are due or overdue.`,
      );
    }
    if (rlsCoverage.missing.length > 0) {
      recommendations.push(
        `RLS coverage missing for ${rlsCoverage.missing.length} tables: ${rlsCoverage.missing.join(', ')}.`,
      );
    }
    if (penetrationRiskScore >= 50) {
      recommendations.push(
        `Penetration risk score is ${penetrationRiskScore} (${penetrationRiskBand}) — prioritise remediation.`,
      );
    }

    // 8. Overall status.
    let overallStatus: SecurityMaintenanceReport['overallStatus'];
    if (
      dependencyAudit.urgentCount > 0 ||
      scanVerdict === 'fail' ||
      rlsCoverage.missing.length > 0 ||
      penetrationRiskScore >= 80
    ) {
      overallStatus = 'urgent_action';
    } else if (
      dependencyAudit.reviewCount > 0 ||
      scanVerdict === 'warn' ||
      rotationsDue.length > 0 ||
      penetrationRiskScore >= 20
    ) {
      overallStatus = 'attention_required';
    } else {
      overallStatus = 'healthy';
    }

    const report: SecurityMaintenanceReport = Object.freeze({
      generatedAt: input.nowIso,
      dependencyAudit,
      scanVerdict,
      rotationSchedule,
      rotationsDue,
      rlsCoverage,
      rlsChecksCount: rlsChecks.length,
      storageReviews: Object.freeze(storageReviews),
      penetrationRiskScore,
      penetrationRiskBand,
      overallStatus,
      recommendations: Object.freeze(recommendations),
    });

    // 9. Persist (best-effort — repository may be a no-op in tests).
    await this.repo.saveVulnerabilityScan(input.vulnerabilityScan);
    await this.repo.saveDependencyAudit(dependencyAudit);
    for (const rec of input.rotationRecords) {
      await this.repo.saveRotationRecord(rec);
    }
    await this.repo.saveRlsCoverageResult(rlsCoverage, input.nowIso);

    return report;
  }
}

/**
 * Default secret hasher injected by the application layer when the use
 * case is constructed in tests. Production deployments MUST inject a
 * real SHA-256 hasher (Web Crypto `crypto.subtle`).
 */
export const DEFAULT_SECRET_HASHER = STUB_SECRET_HASHER;
