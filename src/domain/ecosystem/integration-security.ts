/**
 * Integration security review — required for every third-party integration.
 *
 * Phase 10 Prompt 99: Ecosystem Expansion.
 *
 * CRITICAL: an integration can ONLY be exposed to users when:
 *
 *   1. `isIntegrationSecure(review) === true`, AND
 *   2. The integration does not send any FORBIDDEN_DATA_TYPES.
 *
 * The application layer MUST call `isIntegrationSecure()` before
 * showing the integration in the catalog UI. This is a defense-in-depth
 * check alongside the data-minimization rules enforced at the data
 * export step.
 *
 * FORBIDDEN data types we NEVER share with any integration:
 *   - `upi_id`                  (use payment links instead)
 *   - `bank_password`           (NEVER — we use OAuth/PSD2 aggregators)
 *   - `otp`                     (NEVER — OTPs are for user auth only)
 *   - `payment_pin`             (NEVER)
 *   - `full_receipt_image_without_consent`  (consent required per receipt)
 *
 * See `docs/ecosystem-expansion.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationSecurityReview {
  /** Integration ID (matches `Integration.id`). */
  readonly integrationId: string;
  /** Only necessary data is sent (no over-collection). */
  readonly dataMinimization: boolean;
  /** All traffic is HTTPS/TLS 1.2+ (no plaintext HTTP). */
  readonly encryptedInTransit: boolean;
  /** No forbidden data types are shared (UPI IDs, passwords, OTPs, etc.). */
  readonly noSensitiveDataShared: boolean;
  /** User must explicitly connect the integration (no silent auto-connect). */
  readonly userConsentRequired: boolean;
  /** User can disconnect at any time (no lock-in). */
  readonly revocable: boolean;
  /** All data exchanges are written to the audit trail. */
  readonly auditLogged: boolean;
  /** Vendor's privacy policy has been reviewed by our DPO. */
  readonly privacyPolicyReviewed: boolean;
  /** ISO date when the security review was completed. */
  readonly securityReviewDate: string;
}

// ---------------------------------------------------------------------------
// Forbidden data types
// ---------------------------------------------------------------------------

/**
 * CRITICAL: these data types MUST NEVER be sent to any integration.
 *
 * The application layer's data export pipeline checks every payload
 * against this list before sending. If a forbidden type is detected,
 * the export is blocked and an alert is raised.
 *
 * Tests in `integration-security.test.ts` assert that:
 *   - The list contains all 5 forbidden types.
 *   - `containsForbiddenData()` correctly identifies them in a payload.
 *   - Integrations in `AVAILABLE_INTEGRATIONS` do NOT send any of these.
 */
export const FORBIDDEN_DATA_TYPES: readonly string[] = Object.freeze([
  'upi_id',
  'bank_password',
  'otp',
  'payment_pin',
  'full_receipt_image_without_consent',
]);

/**
 * Returns the subset of `dataTypes` that are forbidden.
 *
 * Returns an empty array when all data types are allowed.
 *
 * Example:
 *   containsForbiddenData(['expense_summary', 'upi_id']) → ['upi_id']
 *   containsForbiddenData(['expense_summary', 'category']) → []
 */
export function containsForbiddenData(
  dataTypes: readonly string[],
): readonly string[] {
  const forbidden: string[] = [];
  for (const dt of dataTypes) {
    if (FORBIDDEN_DATA_TYPES.includes(dt)) {
      forbidden.push(dt);
    }
  }
  return Object.freeze(forbidden);
}

// ---------------------------------------------------------------------------
// Security review
// ---------------------------------------------------------------------------

/**
 * Returns true when the integration has passed ALL security checks.
 *
 * All 7 boolean fields must be true. The `securityReviewDate` must
 * also be a valid ISO date string (a review without a date is not a
 * review).
 *
 * Returns false for any incomplete review — we fail closed. It is
 * better to temporarily hide an integration than to expose one that
 * hasn't been reviewed.
 */
export function isIntegrationSecure(
  review: IntegrationSecurityReview,
): boolean {
  if (!review.dataMinimization) return false;
  if (!review.encryptedInTransit) return false;
  if (!review.noSensitiveDataShared) return false;
  if (!review.userConsentRequired) return false;
  if (!review.revocable) return false;
  if (!review.auditLogged) return false;
  if (!review.privacyPolicyReviewed) return false;
  // The review date must be set and parseable.
  if (
    typeof review.securityReviewDate !== 'string' ||
    review.securityReviewDate.trim() === ''
  ) {
    return false;
  }
  const ms = Date.parse(review.securityReviewDate);
  if (!Number.isFinite(ms)) {
    return false;
  }
  return true;
}

/**
 * Returns the list of integration IDs that have FAILED the security
 * review (i.e. `isIntegrationSecure(review) === false`).
 *
 * The application layer should hide these integrations from the
 * catalog and alert the security team.
 */
export function getBlockedIntegrations(
  reviews: readonly IntegrationSecurityReview[],
): readonly string[] {
  return Object.freeze(
    reviews
      .filter((r) => !isIntegrationSecure(r))
      .map((r) => r.integrationId),
  );
}

/**
 * Returns the list of integration IDs that have PASSED the security
 * review.
 *
 * Only these integrations may be exposed to users.
 */
export function getApprovedIntegrations(
  reviews: readonly IntegrationSecurityReview[],
): readonly string[] {
  return Object.freeze(
    reviews
      .filter((r) => isIntegrationSecure(r))
      .map((r) => r.integrationId),
  );
}

/**
 * Returns the security review for a given integration ID, or null if
 * no review has been recorded.
 *
 * The application layer treats "no review" the same as "failed review"
 * — the integration is hidden until a review is on file.
 */
export function getSecurityReview(
  integrationId: string,
  reviews: readonly IntegrationSecurityReview[],
): IntegrationSecurityReview | null {
  return reviews.find((r) => r.integrationId === integrationId) ?? null;
}
