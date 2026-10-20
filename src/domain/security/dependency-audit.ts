/**
 * Dependency audit framework.
 *
 * The audit classifies each dependency along three orthogonal axes:
 *   1. Vulnerability severity (low / medium / high / critical).
 *   2. Outdated-ness (current vs. latest published version).
 *   3. Abandonment risk (no publish in 2+ years OR < 1 maintainer).
 *
 * It ALSO flags Expo native-module risks — packages that ship native iOS /
 * Android code can break Expo managed-workflow builds when their SDK version
 * drifts from the installed Expo SDK. Pure-JS packages are always low risk.
 *
 * This module is a PURE function library: no I/O, no globals. The audit
 * caller is expected to supply a `DependencyMetadata` snapshot fetched
 * out-of-band (e.g. `npm outdated --json` + the npm registry).
 *
 * See `docs/security-maintenance.md` and `docs/privacy-and-trust.md`.
 */

// ---------------------------------------------------------------------------
// Vulnerability classification
// ---------------------------------------------------------------------------

export type VulnerabilitySeverity = 'low' | 'medium' | 'high' | 'critical';

export const VULNERABILITY_SEVERITIES: readonly VulnerabilitySeverity[] = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

/**
 * Numeric weight per severity, used to compute an aggregate risk score.
 * `low` = 1, `medium` = 5, `high` = 25, `critical` = 100. This deliberately
 * follows a log-ish curve so a single critical vulnerability dominates the
 * score over many low-severity advisories.
 */
export const SEVERITY_WEIGHT: Readonly<Record<VulnerabilitySeverity, number>> = Object.freeze({
  low: 1,
  medium: 5,
  high: 25,
  critical: 100,
});

export function isVulnerabilitySeverity(value: unknown): value is VulnerabilitySeverity {
  return (
    typeof value === 'string' &&
    (VULNERABILITY_SEVERITIES as readonly string[]).includes(value)
  );
}

/**
 * Classify an advisory's CVSS v3 score (0..10) into a severity bucket.
 *
 *   < 4.0   → low
 *   < 7.0   → medium
 *   < 9.0   → high
 *   >= 9.0  → critical
 */
export function classifyCvssScore(cvss: number): VulnerabilitySeverity {
  if (!Number.isFinite(cvss) || cvss < 0) {
    throw new Error(`Invalid CVSS score: ${cvss}`);
  }
  if (cvss >= 9.0) return 'critical';
  if (cvss >= 7.0) return 'high';
  if (cvss >= 4.0) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Outdated / abandoned detection
// ---------------------------------------------------------------------------

export interface DependencyMetadata {
  /** Package name on the npm registry. */
  readonly name: string;
  /** Currently installed version (semver). */
  readonly installedVersion: string;
  /** Latest published version on the registry. */
  readonly latestVersion: string;
  /** ISO date-time of the latest publish (e.g. `2024-05-12T...`). */
  readonly latestPublishDate: string;
  /** Number of distinct maintainers listed in the registry. */
  readonly maintainerCount: number;
  /**
   * Whether the package ships native iOS / Android code (Expo module
   * config, `expo-module.config.json`, or `.podspec` / `android/` dir).
   */
  readonly hasNativeCode: boolean;
  /** Expo SDK version the package declares compatibility with, or null. */
  readonly compatibleExpoSdk: string | null;
  /** Vulnerability advisories affecting the installed version. */
  readonly advisories: readonly DependencyAdvisory[];
}

export interface DependencyAdvisory {
  /** Stable advisory identifier (e.g. GHSA-xxxx, CVE-YYYY-NNNN). */
  readonly id: string;
  /** Severity bucket. */
  readonly severity: VulnerabilitySeverity;
  /** CVSS v3 score (0..10), if known. */
  readonly cvss?: number;
  /** Whether a patched version is available in the current major. */
  readonly patchAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Audit findings
// ---------------------------------------------------------------------------

export type OutdatedLevel = 'current' | 'patch' | 'minor' | 'major';

export const OUTDATED_LEVELS: readonly OutdatedLevel[] = [
  'current',
  'patch',
  'minor',
  'major',
] as const;

/**
 * Compare two semver-ish strings of the form `MAJOR.MINOR.PATCH[-pre]`.
 * Returns the magnitude of the drift (current / patch / minor / major).
 *
 * Pre-release suffixes are stripped before comparison. If either string
 * does not parse as `x.y.z`, the function returns `'major'` to be safe.
 */
export function compareOutdatedLevel(
  installed: string,
  latest: string,
): OutdatedLevel {
  const a = parseSemver(installed);
  const b = parseSemver(latest);
  if (a === null || b === null) {
    // If we can't parse, treat as a major drift to force a manual review.
    return 'major';
  }
  if (a.major !== b.major) return 'major';
  if (a.minor !== b.minor) return 'minor';
  if (a.patch !== b.patch) return 'patch';
  return 'current';
}

interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

function parseSemver(version: string): ParsedSemver | null {
  if (typeof version !== 'string') return null;
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    return null;
  }
  return { major, minor, patch };
}

/**
 * Decide whether a package counts as "abandoned". A package is abandoned
 * when EITHER:
 *   - It has not been published in 2+ years (730 days), OR
 *   - It has fewer than 1 distinct maintainers.
 */
export function isAbandoned(metadata: DependencyMetadata, nowIso: string): boolean {
  if (metadata.maintainerCount < 1) return true;
  const now = Date.parse(nowIso);
  const published = Date.parse(metadata.latestPublishDate);
  if (!Number.isFinite(now) || !Number.isFinite(published)) {
    // Conservative: if we can't parse, don't claim abandonment.
    return false;
  }
  const twoYearsMs = 730 * 24 * 60 * 60 * 1000;
  return now - published >= twoYearsMs;
}

// ---------------------------------------------------------------------------
// Expo native-module compatibility risk
// ---------------------------------------------------------------------------

export type ExpoNativeModuleRisk = 'none' | 'low' | 'medium' | 'high';

/**
 * Classify the risk that a package will break Expo native builds.
 *
 *   - Pure-JS packages (hasNativeCode = false) → 'none'.
 *   - Native packages without a declared compatibleExpoSdk → 'high'
 *     (we cannot verify compatibility).
 *   - Native packages whose compatibleExpoSdk differs from the running
 *     SDK → 'medium' or 'high' depending on the major version delta.
 *   - Native packages whose compatibleExpoSdk matches the running SDK
 *     → 'low'.
 */
export function classifyExpoNativeModuleRisk(
  metadata: DependencyMetadata,
  runningExpoSdk: string | null,
): ExpoNativeModuleRisk {
  if (!metadata.hasNativeCode) return 'none';
  if (metadata.compatibleExpoSdk === null) return 'high';
  if (runningExpoSdk === null) return 'medium';
  const a = parseSdkMajor(metadata.compatibleExpoSdk);
  const b = parseSdkMajor(runningExpoSdk);
  if (a === null || b === null) return 'medium';
  const delta = Math.abs(a - b);
  if (delta === 0) return 'low';
  if (delta === 1) return 'medium';
  return 'high';
}

function parseSdkMajor(sdk: string): number | null {
  const match = sdk.match(/(\d+)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

export type DependencyRiskLevel = 'safe' | 'review' | 'urgent';

export interface DependencyAuditFinding {
  readonly name: string;
  readonly installedVersion: string;
  readonly latestVersion: string;
  readonly outdatedLevel: OutdatedLevel;
  readonly abandoned: boolean;
  readonly expoNativeModuleRisk: ExpoNativeModuleRisk;
  readonly criticalAdvisories: number;
  readonly highAdvisories: number;
  readonly mediumAdvisories: number;
  readonly lowAdvisories: number;
  readonly riskScore: number;
  readonly riskLevel: DependencyRiskLevel;
}

/**
 * Classify the overall risk level of a dependency.
 *
 *   - 'urgent' if any critical advisory OR riskScore >= 100.
 *   - 'review' if riskScore >= 25 (a single high-severity advisory).
 *   - 'safe' otherwise.
 */
export function classifyRiskLevel(riskScore: number, hasCritical: boolean): DependencyRiskLevel {
  if (hasCritical) return 'urgent';
  if (riskScore >= 100) return 'urgent';
  if (riskScore >= 25) return 'review';
  return 'safe';
}

/**
 * Compute the audit finding for a single dependency. The risk score is
 * the sum of severity weights across all advisories, doubled when the
 * package is abandoned (a vulnerability in an abandoned package has no
 * upstream patch path).
 */
export function auditDependency(
  metadata: DependencyMetadata,
  nowIso: string,
  runningExpoSdk: string | null,
): DependencyAuditFinding {
  const outdatedLevel = compareOutdatedLevel(metadata.installedVersion, metadata.latestVersion);
  const abandoned = isAbandoned(metadata, nowIso);
  const expoRisk = classifyExpoNativeModuleRisk(metadata, runningExpoSdk);

  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  let baseScore = 0;
  for (const adv of metadata.advisories) {
    baseScore += SEVERITY_WEIGHT[adv.severity];
    switch (adv.severity) {
      case 'critical': critical += 1; break;
      case 'high': high += 1; break;
      case 'medium': medium += 1; break;
      case 'low': low += 1; break;
    }
  }

  // Abandoned packages multiply the score: no upstream patch path exists.
  let riskScore = baseScore * (abandoned ? 2 : 1);

  // Major version drift adds 10, minor 5, patch 1. Native-module risk
  // adds 0 (none) / 5 (low) / 20 (medium) / 50 (high).
  if (outdatedLevel === 'major') riskScore += 10;
  else if (outdatedLevel === 'minor') riskScore += 5;
  else if (outdatedLevel === 'patch') riskScore += 1;

  if (expoRisk === 'high') riskScore += 50;
  else if (expoRisk === 'medium') riskScore += 20;
  else if (expoRisk === 'low') riskScore += 5;

  const riskLevel = classifyRiskLevel(riskScore, critical > 0);

  return Object.freeze({
    name: metadata.name,
    installedVersion: metadata.installedVersion,
    latestVersion: metadata.latestVersion,
    outdatedLevel,
    abandoned,
    expoNativeModuleRisk: expoRisk,
    criticalAdvisories: critical,
    highAdvisories: high,
    mediumAdvisories: medium,
    lowAdvisories: low,
    riskScore,
    riskLevel,
  });
}

/**
 * Run the audit across a list of dependencies. Returns the per-package
 * findings plus an aggregate summary.
 */
export interface DependencyAuditSummary {
  readonly totalPackages: number;
  readonly findings: readonly DependencyAuditFinding[];
  readonly urgentCount: number;
  readonly reviewCount: number;
  readonly safeCount: number;
  readonly abandonedCount: number;
  readonly totalCriticalAdvisories: number;
  readonly totalHighAdvisories: number;
  readonly totalMediumAdvisories: number;
  readonly totalLowAdvisories: number;
  readonly expoNativeModuleRiskPackages: readonly string[];
  readonly overallRiskLevel: DependencyRiskLevel;
}

export function auditDependencies(
  packages: readonly DependencyMetadata[],
  nowIso: string,
  runningExpoSdk: string | null,
): DependencyAuditSummary {
  const findings = packages.map((p) => auditDependency(p, nowIso, runningExpoSdk));

  let urgent = 0;
  let review = 0;
  let safe = 0;
  let abandoned = 0;
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  const expoRisks: string[] = [];

  for (const f of findings) {
    if (f.riskLevel === 'urgent') urgent += 1;
    else if (f.riskLevel === 'review') review += 1;
    else safe += 1;
    if (f.abandoned) abandoned += 1;
    critical += f.criticalAdvisories;
    high += f.highAdvisories;
    medium += f.mediumAdvisories;
    low += f.lowAdvisories;
    if (f.expoNativeModuleRisk !== 'none') {
      expoRisks.push(f.name);
    }
  }

  const overallRiskLevel: DependencyRiskLevel = urgent > 0
    ? 'urgent'
    : review > 0
      ? 'review'
      : 'safe';

  return Object.freeze({
    totalPackages: findings.length,
    findings: Object.freeze(findings),
    urgentCount: urgent,
    reviewCount: review,
    safeCount: safe,
    abandonedCount: abandoned,
    totalCriticalAdvisories: critical,
    totalHighAdvisories: high,
    totalMediumAdvisories: medium,
    totalLowAdvisories: low,
    expoNativeModuleRiskPackages: Object.freeze(expoRisks),
    overallRiskLevel,
  });
}
