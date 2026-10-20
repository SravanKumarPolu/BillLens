/**
 * Secret rotation schedule.
 *
 * CRITICAL: secret rotation records store HASHES ONLY. Raw secret values
 * are NEVER persisted — only a SHA-256 hash of the secret at the time of
 * rotation. The hash lets us answer "is this the same secret we recorded
 * last time?" without ever revealing the secret itself.
 *
 * Six secret types are tracked, each with a default rotation interval:
 *   - service_role        — 90 days
 *   - anon_key             — 180 days
 *   - oauth_secret         — 365 days
 *   - ocr_api_key          — 90 days
 *   - notification_cert    — 365 days
 *   - signing_key          — 730 days (2 years)
 *
 * `isRotationDue()` consults the last-rotated timestamp + the interval.
 * `computeRotationSchedule()` returns the upcoming rotations within a
 * look-ahead window.
 *
 * This module is a PURE function library: no I/O, no globals. The
 * application layer persists the rotation records via a repository port.
 *
 * See `docs/security-maintenance.md` and `docs/privacy-and-trust.md`.
 */

// ---------------------------------------------------------------------------
// Secret types
// ---------------------------------------------------------------------------

export type SecretType =
  | 'service_role'
  | 'anon_key'
  | 'oauth_secret'
  | 'ocr_api_key'
  | 'notification_cert'
  | 'signing_key';

export const SECRET_TYPES: readonly SecretType[] = [
  'service_role',
  'anon_key',
  'oauth_secret',
  'ocr_api_key',
  'notification_cert',
  'signing_key',
] as const;

export function isSecretType(value: unknown): value is SecretType {
  return (
    typeof value === 'string' &&
    (SECRET_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Default rotation interval in days for each secret type.
 *
 *   service_role        — 90 days   (privileged; short interval)
 *   anon_key            — 180 days  (low-privilege client key)
 *   oauth_secret        — 365 days  (provider-managed; long interval)
 *   ocr_api_key         — 90 days   (third-party service; short interval)
 *   notification_cert   — 365 days  (APNs / FCM cert; long interval)
 *   signing_key         — 730 days  (long-lived signing key; 2 years)
 */
export const DEFAULT_ROTATION_INTERVAL_DAYS: Readonly<Record<SecretType, number>> = Object.freeze({
  service_role: 90,
  anon_key: 180,
  oauth_secret: 365,
  ocr_api_key: 90,
  notification_cert: 365,
  signing_key: 730,
});

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Hashing (records store HASHES ONLY)
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 hex hash of a raw secret value. The hash is the ONLY
 * thing ever persisted. We use the Web Crypto `crypto.subtle` API where
 * available; in Node.js test environments we fall back to the built-in
 * `node:crypto` module.
 *
 * IMPORTANT: this function does NOT perform the hashing in the domain —
 * the domain is forbidden from importing `node:crypto` in production
 * code. Instead we expose a synchronous hash function that the
 * application layer injects. Tests use a deterministic stub.
 */

/**
 * Synchronous hash function type. Accepts a UTF-8 string and returns a
 * hex-encoded SHA-256 hash (64 lowercase hex chars). The application
 * layer injects the real implementation; tests inject a deterministic
 * stub so the rotation-schedule tests do not depend on the environment.
 */
export type SecretHasher = (rawSecret: string) => string;

/**
 * Reference implementation of the secret hasher. This is intended for
 * test double usage only — production code MUST inject a hasher backed
 * by the platform's secure crypto (Web Crypto `crypto.subtle` or
 * `node:crypto`).
 *
 * The implementation uses a simple non-cryptographic FNV-1a hash with
 * a salt to discourage accidental misuse as a real cryptographic hash.
 * Real production deployments MUST inject a proper SHA-256 hasher.
 */
export const STUB_SECRET_HASHER: SecretHasher = (rawSecret: string): string => {
  if (typeof rawSecret !== 'string') {
    throw new Error('rawSecret must be a string');
  }
  // FNV-1a 32-bit over the UTF-8 bytes, repeated to produce 64 hex chars.
  let h1 = 0x811c9dc5;
  let h2 = 0x84222325;
  for (let i = 0; i < rawSecret.length; i++) {
    const c = rawSecret.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x01000193);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  // Repeat to reach 64 hex chars (256 bits) — this is NOT a real hash.
  return (part1 + part2).repeat(4);
};

// ---------------------------------------------------------------------------
// Rotation record
// ---------------------------------------------------------------------------

export interface SecretRotationRecord {
  /** Type of secret. */
  readonly type: SecretType;
  /**
   * SHA-256 hash of the raw secret value AT THE TIME OF ROTATION.
   * Raw secrets are NEVER persisted.
   */
  readonly hash: string;
  /** ISO date-time when the secret was last rotated. */
  readonly lastRotatedAt: string;
  /** Rotation interval in days. Defaults to the type's standard interval. */
  readonly intervalDays: number;
  /** Optional rotation notes (no PII). */
  readonly notes?: string;
}

export interface SecretRotationRecordInput {
  readonly type: SecretType;
  readonly rawSecret: string;
  readonly rotatedAt: string;
  readonly intervalDays?: number;
  readonly notes?: string;
  readonly hasher: SecretHasher;
}

/**
 * Create a new rotation record. The raw secret is hashed immediately and
 * only the hash is stored in the resulting record. The caller MUST NOT
 * persist `rawSecret` — it should be discarded after this call.
 */
export function createRotationRecord(input: SecretRotationRecordInput): SecretRotationRecord {
  if (!isSecretType(input.type)) {
    throw new Error(`Unknown secret type: ${input.type}`);
  }
  if (typeof input.rawSecret !== 'string' || input.rawSecret.length === 0) {
    throw new Error('rawSecret must be a non-empty string');
  }
  if (typeof input.hasher !== 'function') {
    throw new Error('hasher must be a function');
  }
  if (Number.isNaN(Date.parse(input.rotatedAt))) {
    throw new Error('rotatedAt must be a valid ISO date-time');
  }
  const intervalDays =
    input.intervalDays ?? DEFAULT_ROTATION_INTERVAL_DAYS[input.type];
  if (!Number.isInteger(intervalDays) || intervalDays <= 0) {
    throw new Error(`intervalDays must be a positive integer, got ${intervalDays}`);
  }
  const hash = input.hasher(input.rawSecret);
  if (typeof hash !== 'string' || hash.length === 0) {
    throw new Error('hasher returned an empty hash');
  }
  return Object.freeze({
    type: input.type,
    hash,
    lastRotatedAt: input.rotatedAt,
    intervalDays,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });
}

// ---------------------------------------------------------------------------
// Rotation scheduling
// ---------------------------------------------------------------------------

/**
 * Returns true when the secret's rotation interval has elapsed (or is
 * within `graceDays` of elapsing) as of `nowIso`.
 *
 * When `record` is null (no prior rotation), the secret is always due.
 */
export function isRotationDue(
  record: SecretRotationRecord | null,
  nowIso: string,
  graceDays: number = 0,
): boolean {
  if (!Number.isFinite(graceDays) || graceDays < 0) {
    throw new Error(`graceDays must be non-negative, got ${graceDays}`);
  }
  if (record === null) return true;
  const now = Date.parse(nowIso);
  const last = Date.parse(record.lastRotatedAt);
  if (!Number.isFinite(now) || !Number.isFinite(last)) {
    throw new Error('nowIso / lastRotatedAt must be valid ISO date-times');
  }
  const intervalMs = record.intervalDays * MS_PER_DAY;
  const graceMs = graceDays * MS_PER_DAY;
  return now + graceMs >= last + intervalMs;
}

/**
 * Compute the date at which a rotation becomes due.
 */
export function nextRotationDate(record: SecretRotationRecord): string {
  const last = Date.parse(record.lastRotatedAt);
  if (!Number.isFinite(last)) {
    throw new Error('lastRotatedAt must be a valid ISO date-time');
  }
  const due = last + record.intervalDays * MS_PER_DAY;
  return new Date(due).toISOString();
}

export interface UpcomingRotation {
  readonly type: SecretType;
  readonly lastRotatedAt: string;
  readonly dueAt: string;
  readonly daysUntilDue: number;
  readonly overdue: boolean;
}

/**
 * Compute the upcoming rotation schedule for a set of records. Returns
 * entries sorted by `dueAt` ascending. Includes ALL secrets (even those
 * with no record yet — those appear as overdue at `nowIso`).
 *
 * `lookaheadDays` defaults to 365 — secrets due beyond the lookahead
 * window are still included so the schedule is complete, but their
 * `daysUntilDue` is the actual count regardless.
 */
export function computeRotationSchedule(
  records: readonly SecretRotationRecord[],
  nowIso: string,
  lookaheadDays: number = 365,
): readonly UpcomingRotation[] {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) {
    throw new Error('nowIso must be a valid ISO date-time');
  }
  if (!Number.isFinite(lookaheadDays) || lookaheadDays < 0) {
    throw new Error(`lookaheadDays must be non-negative, got ${lookaheadDays}`);
  }
  const seenTypes = new Set<SecretType>();
  const entries: UpcomingRotation[] = [];

  for (const record of records) {
    seenTypes.add(record.type);
    const due = Date.parse(nextRotationDate(record));
    const daysUntilDue = Math.ceil((due - now) / MS_PER_DAY);
    entries.push(
      Object.freeze({
        type: record.type,
        lastRotatedAt: record.lastRotatedAt,
        dueAt: new Date(due).toISOString(),
        daysUntilDue,
        overdue: daysUntilDue < 0,
      }),
    );
  }

  // Add entries for secret types with NO record yet (overdue today).
  for (const type of SECRET_TYPES) {
    if (!seenTypes.has(type)) {
      entries.push(
        Object.freeze({
          type,
          lastRotatedAt: '',
          dueAt: nowIso,
          daysUntilDue: 0,
          overdue: true,
        }),
      );
    }
  }

  entries.sort((a, b) => {
    const da = a.dueAt === '' ? now : Date.parse(a.dueAt);
    const db = b.dueAt === '' ? now : Date.parse(b.dueAt);
    return da - db;
  });
  return Object.freeze(entries);
}

/**
 * Filter the schedule to only entries due within the lookahead window
 * (including overdue). Useful for dashboards that show "next 30 days".
 */
export function rotationsDueWithin(
  schedule: readonly UpcomingRotation[],
  lookaheadDays: number,
): readonly UpcomingRotation[] {
  if (!Number.isFinite(lookaheadDays) || lookaheadDays < 0) {
    throw new Error(`lookaheadDays must be non-negative, got ${lookaheadDays}`);
  }
  return Object.freeze(
    schedule.filter(
      (r) => r.overdue || r.daysUntilDue <= lookaheadDays,
    ),
  );
}
