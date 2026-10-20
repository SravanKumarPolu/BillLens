import type { FieldReviewIssueId } from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';

export function asFieldReviewIssueId(value: string): FieldReviewIssueId {
  return value as FieldReviewIssueId;
}

/**
 * The kind of issue detected during field review.
 *
 *   low_confidence       — Field confidence below threshold
 *   total_mismatch       — Items + charges don't equal total
 *   missing_field        — Required field is absent
 *   duplicate_item       — Possible duplicate line item detected
 *   invalid_value        — Value fails domain validation
 *   unassigned_items     — Items without member assignment
 *   currency_mismatch    — Currency differs from group currency
 *   date_in_future       — Receipt date is in the future
 *   amount_unreasonable  — Amount seems too large/small
 */
export type FieldReviewIssueType =
  | 'low_confidence'
  | 'total_mismatch'
  | 'missing_field'
  | 'duplicate_item'
  | 'invalid_value'
  | 'unassigned_items'
  | 'currency_mismatch'
  | 'date_in_future'
  | 'amount_unreasonable';

/**
 * Severity of a FieldReviewIssue.
 *
 *   info    — FYI, no user action required (e.g. low confidence on an
 *             optional field)
 *   warning — User should review before confirming
 *   error   — Draft CANNOT be confirmed until resolved (e.g. total
 *             mismatch, missing required field)
 */
export type FieldReviewSeverity = 'info' | 'warning' | 'error';

/**
 * A single review issue attached to an {@link ExpenseDraft}.
 *
 * Issues are computed by the extraction/review pipeline and stored on
 * the draft in `unresolvedIssues`. The user resolves them by editing
 * the draft fields; once an issue no longer applies, the pipeline
 * removes it from the list on the next review pass.
 *
 * `suggestedValue` is an optional fix the UI can apply with one tap
 * (e.g. "set date to 2026-07-29"). Its type depends on `fieldName`.
 */
export interface FieldReviewIssue {
  readonly id: FieldReviewIssueId;
  readonly issueType: FieldReviewIssueType;
  readonly severity: FieldReviewSeverity;
  readonly fieldName: string;
  readonly message: string;
  readonly suggestedValue?: unknown;
}

export interface FieldReviewIssueCreateInput {
  readonly id: FieldReviewIssueId;
  readonly issueType: FieldReviewIssueType;
  readonly severity: FieldReviewSeverity;
  readonly fieldName: string;
  readonly message: string;
  readonly suggestedValue?: unknown;
}

/**
 * Create a FieldReviewIssue.
 *
 * Validation: `fieldName` and `message` must be non-empty after trim.
 */
export function createFieldReviewIssue(input: FieldReviewIssueCreateInput): FieldReviewIssue {
  if (!input.fieldName || input.fieldName.trim().length === 0) {
    throw new InvalidEntityError('FieldReviewIssue fieldName must not be empty');
  }
  if (!input.message || input.message.trim().length === 0) {
    throw new InvalidEntityError('FieldReviewIssue message must not be empty');
  }
  return {
    id: input.id,
    issueType: input.issueType,
    severity: input.severity,
    fieldName: input.fieldName.trim(),
    message: input.message.trim(),
    ...(input.suggestedValue !== undefined ? { suggestedValue: input.suggestedValue } : {}),
  };
}
