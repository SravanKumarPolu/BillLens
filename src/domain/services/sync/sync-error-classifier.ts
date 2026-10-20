import type { SyncOperationType } from '../../repositories/sync.repository';

/**
 * Sync error classification — Phase 7 Prompt 61.
 *
 * Pure module that classifies sync errors into three categories:
 *
 *   - `retriable` — network unavailable, timeout, 5xx, rate limit,
 *     token refresh in progress. The coordinator should retry with
 *     exponential backoff.
 *   - `requires_intervention` — version conflict, permission changed,
 *     parent deleted remotely, identity-link conflict, privacy-policy
 *     conflict. The coordinator should mark the operation as
 *     conflicting and surface it to the user.
 *   - `permanent` — invalid payload, unsupported schema version,
 *     entity permanently inaccessible, malformed attachment. The
 *     coordinator should mark the operation as permanently failed
 *     and NOT retry.
 *
 * The classification is based on the error code string. The sync
 * worker (infrastructure layer) catches the network/HTTP error,
 * extracts the code, and passes it to this pure function. The
 * function returns the category without performing any I/O.
 */

// ---------------------------------------------------------------------------
// Error category type
// ---------------------------------------------------------------------------

export type SyncErrorCategory = 'retriable' | 'requires_intervention' | 'permanent';

// ---------------------------------------------------------------------------
// Error code constants
// ---------------------------------------------------------------------------

/**
 * Retriable error codes. These are transient failures that may
 * succeed on retry. The coordinator applies exponential backoff.
 */
export const RETRIABLE_ERROR_CODES: readonly string[] = [
  'NETWORK_UNAVAILABLE',
  'TIMEOUT',
  'SERVER_ERROR',          // 5xx
  'RATE_LIMIT',            // 429
  'TOKEN_REFRESH_IN_PROGRESS',
  'AUTH_TOKEN_EXPIRED',    // v2.5.0 — 401/PGRST301; refresh + retry
  'NOT_CONFIGURED',        // v2.5.0 — cloud not configured yet; ops stay queued
  'SERVICE_UNAVAILABLE',  // 503
  'BAD_GATEWAY',           // 502
  'GATEWAY_TIMEOUT',      // 504
];

/**
 * Requires-intervention error codes. These are conflicts that need
 * the user to review and resolve. The coordinator marks the
 * operation as conflicting and surfaces it in the conflict UI.
 */
export const REQUIRES_INTERVENTION_ERROR_CODES: readonly string[] = [
  'VERSION_CONFLICT',
  'PERMISSION_CHANGED',
  'PARENT_DELETED_REMOTELY',
  'IDENTITY_LINK_CONFLICT',
  'PRIVACY_POLICY_CONFLICT',
  'DELETED_REMOTELY',
  'MEMBERSHIP_CONFLICT',
  'DUPLICATE_CREATION',
  'FINANCIAL_RECORD_CONFLICT',
];

/**
 * Permanent error codes. These are not retriable — the operation
 * will never succeed regardless of how many times it is retried.
 * The coordinator marks the operation as permanently failed.
 */
export const PERMANENT_ERROR_CODES: readonly string[] = [
  'INVALID_PAYLOAD',
  'UNSUPPORTED_SCHEMA_VERSION',
  'ENTITY_PERMANENTLY_INACCESSIBLE',
  'MALFORMED_ATTACHMENT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_ENTITY_TYPE',
];

/**
 * All known error codes, for validation.
 */
export const ALL_KNOWN_ERROR_CODES: readonly string[] = [
  ...RETRIABLE_ERROR_CODES,
  ...REQUIRES_INTERVENTION_ERROR_CODES,
  ...PERMANENT_ERROR_CODES,
];

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify a sync error code into one of three categories.
 *
 * Returns `retriable` for transient failures, `requires_intervention`
 * for conflicts, and `permanent` for non-retriable errors. Unknown
 * error codes default to `retriable` (the safer default — it's
 * better to retry an unknown error than to permanently fail it).
 *
 * @example
 *   classifySyncError('NETWORK_UNAVAILABLE') // → 'retriable'
 *   classifySyncError('VERSION_CONFLICT')   // → 'requires_intervention'
 *   classifySyncError('INVALID_PAYLOAD')     // → 'permanent'
 *   classifySyncError('SOME_UNKNOWN_CODE')   // → 'retriable' (default)
 */
export function classifySyncError(errorCode: string): SyncErrorCategory {
  if (REQUIRES_INTERVENTION_ERROR_CODES.includes(errorCode)) {
    return 'requires_intervention';
  }
  if (PERMANENT_ERROR_CODES.includes(errorCode)) {
    return 'permanent';
  }
  // Retriable includes known retriable codes AND unknown codes
  // (the safer default — an unknown error might be transient).
  return 'retriable';
}

/**
 * Check whether an error code is retriable.
 */
export function isRetriableError(errorCode: string): boolean {
  return classifySyncError(errorCode) === 'retriable';
}

/**
 * Check whether an error code requires user intervention.
 */
export function requiresIntervention(errorCode: string): boolean {
  return classifySyncError(errorCode) === 'requires_intervention';
}

/**
 * Check whether an error code is permanent (non-retriable).
 */
export function isPermanentError(errorCode: string): boolean {
  return classifySyncError(errorCode) === 'permanent';
}

/**
 * Check whether an operation type should never be retried after a
 * permanent error, regardless of the error code.
 *
 * For example, a `delete` that fails with `ENTITY_PERMANENTLY_INACCESSIBLE`
 * should not be retried. But a `create` that fails with the same error
 * might be retried if the entity becomes accessible again (edge case).
 *
 * For the MVP, we treat ALL permanent errors as non-retriable regardless
 * of the operation type. This is the safer default.
 */
export function shouldRetryOperation(
  _operationType: SyncOperationType,
  errorCode: string,
  attemptCount: number,
  maxAttempts: number,
): boolean {
  if (isPermanentError(errorCode)) {
    return false;
  }
  if (requiresIntervention(errorCode)) {
    return false; // requires user resolution, not a retry
  }
  if (attemptCount >= maxAttempts) {
    return false; // exhausted retries
  }
  return true; // retriable
}
