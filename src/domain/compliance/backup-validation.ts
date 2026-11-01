/**
 * Backup validation model — track backup records and their integrity.
 *
 * Phase 10 Prompt 97: Compliance and Governance.
 *
 * Backups that have never been validated are worthless. This module
 * tracks backup records with their checksum, encryption status, and
 * validation status, and computes staleness + frequency metrics.
 *
 * This module is PURE: it operates on the provided list of backup
 * records. No I/O, no scheduling.
 *
 * See `docs/compliance-governance.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BackupType = 'full' | 'incremental' | 'differential' | 'snapshot';

export type BackupValidationStatus = 'pending' | 'validated' | 'failed';

export interface BackupRecord {
  /** Stable unique identifier. */
  readonly id: string;
  /** Type of backup. */
  readonly type: BackupType;
  /** ISO date when the backup was created. */
  readonly createdAt: string;
  /** Backup size in bytes. */
  readonly sizeBytes: number;
  /** SHA-256 checksum of the backup file. */
  readonly checksum: string;
  /** Whether the backup is encrypted at rest. */
  readonly encrypted: boolean;
  /** Storage location (e.g. 's3://billlens-backups/eu-west-1/2026-07-01'). */
  readonly location: string;
  /** Current validation status. */
  readonly validationStatus: BackupValidationStatus;
  /** ISO date when the backup was last validated (optional). */
  readonly validatedAt?: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the backup is valid:
 *   - validationStatus === 'validated'
 *   - checksum is a non-empty string
 *   - encrypted === true
 *   - sizeBytes > 0
 *
 * Any backup that fails any of these checks is NOT considered valid
 * for restore purposes. (A non-encrypted backup is not "invalid" in
 * the validation sense, but it is not acceptable for restore — so
 * we return false to fail closed.)
 */
export function isBackupValid(backup: BackupRecord): boolean {
  if (backup.validationStatus !== 'validated') {
    return false;
  }
  if (typeof backup.checksum !== 'string' || backup.checksum.trim() === '') {
    return false;
  }
  if (!backup.encrypted) {
    return false;
  }
  if (!Number.isFinite(backup.sizeBytes) || backup.sizeBytes <= 0) {
    return false;
  }
  return true;
}

/**
 * Returns the list of backups that are older than `maxAgeDays` as of `now`.
 *
 * Stale backups are candidates for deletion (per data-retention policy)
 * OR re-validation (if they are still within the retention window but
 * haven't been validated recently).
 *
 * Returns backups in chronological order (oldest first).
 */
export function getStaleBackups(
  backups: readonly BackupRecord[],
  maxAgeDays: number,
  now: string,
): readonly BackupRecord[] {
  const nowMs = parseStrict(now);
  if (nowMs === null) {
    return [];
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  const cutoff = nowMs - maxAgeDays * msPerDay;

  return backups
    .filter((b) => {
      const createdMs = parseStrict(b.createdAt);
      if (createdMs === null) {
        return false;
      }
      return createdMs < cutoff;
    })
    .sort((a, b) => {
      const aMs = parseStrict(a.createdAt) ?? 0;
      const bMs = parseStrict(b.createdAt) ?? 0;
      return aMs - bMs;
    });
}

/**
 * Returns the backup frequency (backups per day) over the trailing
 * `windowDays` window ending at the most recent backup in the list.
 *
 * Computed as: backupsInWindow / windowDays.
 *
 * Returns 0 when:
 *   - there are no backups
 *   - windowDays <= 0
 *   - the backups span less than 1 day (we treat sub-daily spans as
 *     1 day to avoid divide-by-zero)
 *
 * Example: 7 backups created over 7 days = 1.0 backups/day.
 * Example: 14 backups created over 7 days = 2.0 backups/day.
 *
 * Only backups within the trailing window are counted. The window
 * ends at the MOST RECENT backup's createdAt, not at "now" — this
 * gives a stable measurement even if backups have stopped.
 */
export function computeBackupFrequency(
  backups: readonly BackupRecord[],
  windowDays: number,
): number {
  if (backups.length === 0) {
    return 0;
  }
  if (!Number.isFinite(windowDays) || windowDays <= 0) {
    return 0;
  }
  const parsed = backups
    .map((b) => parseStrict(b.createdAt))
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b);
  if (parsed.length === 0) {
    return 0;
  }
  const latest: number = parsed[parsed.length - 1]!;
  const first: number = parsed[0]!;
  const msPerDay = 24 * 60 * 60 * 1000;
  const windowMs = windowDays * msPerDay;
  const windowStart = latest - windowMs;
  const inWindow = parsed.filter((ms) => ms >= windowStart).length;
  // Use the actual span if it's > 1 day; otherwise use windowDays.
  const span = Math.max(latest - first, msPerDay);
  const effectiveWindow = Math.min(span, windowMs);
  const effectiveDays = effectiveWindow / msPerDay;
  if (effectiveDays <= 0) {
    return 0;
  }
  return Math.round((inWindow / effectiveDays) * 100) / 100;
}

/**
 * Returns the validation rate as a percentage in [0, 100].
 *
 *   validated / total * 100
 *
 * Returns 0 when there are no backups. Failed and pending backups
 * both count against the rate.
 */
export function computeValidationRate(
  backups: readonly BackupRecord[],
): number {
  if (backups.length === 0) {
    return 0;
  }
  const validated = backups.filter((b) => b.validationStatus === 'validated')
    .length;
  return Math.round((validated / backups.length) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseStrict(iso: string): number | null {
  if (typeof iso !== 'string' || iso.trim() === '') {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
