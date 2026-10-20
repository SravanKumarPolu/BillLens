/**
 * Data access guard for sensitive customer data.
 *
 * CRITICAL: Support tools MUST NOT allow admins to view raw receipt
 * images or UPI IDs without strict audit trails AND user consent.
 *
 * The guard evaluates a `DataAccessRequest` and returns a
 * `DataAccessDecision`. Five data types are ALWAYS sensitive:
 *
 *   - receipt_image       — raw receipt photos (may contain merchant
 *                            names, totals, payment references, UPI
 *                            QR codes).
 *   - upi_id              — user's UPI VPA (e.g. alice@okhdfcbank).
 *   - payment_reference   — bank UTR / RRN / payment reference number.
 *   - bank_account        — bank account number / IFSC.
 *   - full_backup         — a full data export (contains everything).
 *
 * For these five types:
 *   - Access is DENIED when `userConsentGiven` is false.
 *   - Access is ALLOWED only when `userConsentGiven` is true AND an
 *     audit trail is required.
 *
 * For the remaining type (`ocr_text`), access is allowed without
 * user consent BUT still requires an audit trail (OCR text may leak
 * merchant names + totals, so we want to know who looked).
 *
 * The guard is a PURE function. The use case layer is responsible
 * for creating the audit entry when `requiresAuditTrail` is true.
 *
 * See `docs/customer-support-operations.md` and `docs/privacy-and-trust.md`.
 */

// ---------------------------------------------------------------------------
// Sensitive data types
// ---------------------------------------------------------------------------

export type SensitiveDataType =
  | 'receipt_image'
  | 'upi_id'
  | 'payment_reference'
  | 'bank_account'
  | 'ocr_text'
  | 'full_backup';

export const SENSITIVE_DATA_TYPES: readonly SensitiveDataType[] = [
  'receipt_image',
  'upi_id',
  'payment_reference',
  'bank_account',
  'ocr_text',
  'full_backup',
] as const;

export function isSensitiveDataType(value: unknown): value is SensitiveDataType {
  return (
    typeof value === 'string' &&
    (SENSITIVE_DATA_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Data types that ALWAYS require user consent AND an audit trail.
 * Access is DENIED when `userConsentGiven` is false.
 *
 * CRITICAL: raw receipt images + UPI IDs + payment references + bank
 * accounts + full backups fall into this bucket. These are the most
 * sensitive data classes in the system.
 */
export const ALWAYS_SENSITIVE_TYPES: readonly SensitiveDataType[] = [
  'receipt_image',
  'upi_id',
  'payment_reference',
  'bank_account',
  'full_backup',
] as const;

/**
 * Data types that require an audit trail but NOT user consent.
 * Currently only `ocr_text` — OCR text may leak merchant names + totals,
 * so we always log who looked, but we don't require fresh user consent
 * for each access (the user already consented to OCR processing at
 * capture time).
 */
export const AUDIT_REQUIRED_TYPES: readonly SensitiveDataType[] = [
  'ocr_text',
] as const;

/**
 * Returns true when the data type is in the ALWAYS_SENSITIVE_TYPES list.
 */
export function isAlwaysSensitiveType(dataType: SensitiveDataType): boolean {
  return (ALWAYS_SENSITIVE_TYPES as readonly string[]).includes(dataType);
}

/**
 * Returns true when the data type requires an audit trail (i.e. it's
 * in ALWAYS_SENSITIVE_TYPES OR AUDIT_REQUIRED_TYPES).
 */
export function requiresAuditTrail(dataType: SensitiveDataType): boolean {
  return (
    isAlwaysSensitiveType(dataType) ||
    (AUDIT_REQUIRED_TYPES as readonly string[]).includes(dataType)
  );
}

// ---------------------------------------------------------------------------
// Request + decision
// ---------------------------------------------------------------------------

export interface DataAccessRequest {
  /** The ticket for which the admin is requesting data access. */
  readonly ticketId: string;
  /** The type of sensitive data being requested. */
  readonly dataType: SensitiveDataType;
  /** The admin requesting access. */
  readonly adminId: string;
  /** The admin's stated reason for the access (free text, no PII). */
  readonly reason: string;
  /** Whether the user has explicitly consented to this access. */
  readonly userConsentGiven: boolean;
}

export interface DataAccessDecision {
  /** Whether access is allowed. */
  readonly allowed: boolean;
  /** Human-readable reason for the decision. */
  readonly reason: string;
  /** Whether an audit trail entry MUST be created for this access. */
  readonly requiresAuditTrail: boolean;
  /** Whether user consent was required for this access. */
  readonly requiresUserConsent: boolean;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateDataAccessRequest(request: DataAccessRequest): void {
  if (typeof request.ticketId !== 'string' || request.ticketId.trim().length === 0) {
    throw new Error('DataAccessRequest.ticketId must be a non-empty string');
  }
  if (!isSensitiveDataType(request.dataType)) {
    throw new Error(`Unknown sensitive data type: ${request.dataType}`);
  }
  if (typeof request.adminId !== 'string' || request.adminId.trim().length === 0) {
    throw new Error('DataAccessRequest.adminId must be a non-empty string');
  }
  if (typeof request.reason !== 'string' || request.reason.trim().length === 0) {
    throw new Error('DataAccessRequest.reason must be a non-empty string');
  }
  if (typeof request.userConsentGiven !== 'boolean') {
    throw new Error('DataAccessRequest.userConsentGiven must be a boolean');
  }
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/**
 * Evaluate a data access request.
 *
 * CRITICAL RULES:
 *   1. If `dataType` is in ALWAYS_SENSITIVE_TYPES (receipt_image,
 *      upi_id, payment_reference, bank_account, full_backup):
 *        - If `userConsentGiven` is false → DENIED.
 *        - If `userConsentGiven` is true → ALLOWED with audit trail.
 *   2. If `dataType` is `ocr_text`:
 *        - ALLOWED with audit trail (no user consent required, but
 *          audit trail still mandatory).
 *   3. Otherwise (defensive): DENIED.
 */
export function evaluateDataAccess(request: DataAccessRequest): DataAccessDecision {
  validateDataAccessRequest(request);

  const alwaysSensitive = isAlwaysSensitiveType(request.dataType);
  const auditRequired = requiresAuditTrail(request.dataType);

  if (alwaysSensitive) {
    if (!request.userConsentGiven) {
      return Object.freeze({
        allowed: false,
        reason: `Access to '${request.dataType}' requires explicit user consent. Consent was not given.`,
        requiresAuditTrail: false, // No access happened — no audit entry needed.
        requiresUserConsent: true,
      });
    }
    return Object.freeze({
      allowed: true,
      reason: `Access to '${request.dataType}' granted with user consent. Audit trail required.`,
      requiresAuditTrail: true,
      requiresUserConsent: true,
    });
  }

  if (auditRequired) {
    // ocr_text — audit trail required but no user consent needed.
    return Object.freeze({
      allowed: true,
      reason: `Access to '${request.dataType}' granted. Audit trail required.`,
      requiresAuditTrail: true,
      requiresUserConsent: false,
    });
  }

  // Defensive: any future type not explicitly classified is denied.
  return Object.freeze({
    allowed: false,
    reason: `Access to '${request.dataType}' is not permitted by the data access guard.`,
    requiresAuditTrail: false,
    requiresUserConsent: false,
  });
}

// ---------------------------------------------------------------------------
// Convenience: batch-evaluate multiple requests
// ---------------------------------------------------------------------------

export interface DataAccessBatchResult {
  readonly decisions: readonly { readonly request: DataAccessRequest; readonly decision: DataAccessDecision }[];
  readonly allowedCount: number;
  readonly deniedCount: number;
  readonly auditRequiredCount: number;
}

export function evaluateDataAccessBatch(
  requests: readonly DataAccessRequest[],
): DataAccessBatchResult {
  const decisions = requests.map((request) => ({
    request,
    decision: evaluateDataAccess(request),
  }));
  let allowed = 0;
  let denied = 0;
  let audit = 0;
  for (const { decision } of decisions) {
    if (decision.allowed) allowed += 1;
    else denied += 1;
    if (decision.requiresAuditTrail) audit += 1;
  }
  return Object.freeze({
    decisions: Object.freeze(decisions),
    allowedCount: allowed,
    deniedCount: denied,
    auditRequiredCount: audit,
  });
}
