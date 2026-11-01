/**
 * Draft review view model (Prompt 18).
 *
 * Pure projection from a domain `ExpenseDraft` into the shape the
 * `DraftReviewScreen` consumes. The screen reads ONLY from this view
 * model — never from the draft entity directly — so the screen stays
 * thin and the layout rules (confidence bucketing, issue severity,
 * blocking-issue count, canConfirm) are unit-testable without
 * rendering React components.
 *
 * Confidence is NEVER communicated by colour alone — every field
 * carries a textual label ("High / Medium / Low / Unknown" and
 * "Needs review" / "Edited") alongside its `StatusDot`.
 *
 * Pure functions only — no React, no stores, no I/O.
 */

import type { DraftCharge } from '@domain/entities/draft-charge';
import type { DraftLineItem } from '@domain/entities/draft-line-item';
import type { ExpenseDraft } from '@domain/entities/expense-draft';
import type {
  FieldReviewIssue,
  FieldReviewSeverity,
  FieldReviewIssueType,
} from '@domain/entities/field-review-issue';
import {
  HIGH_CONFIDENCE_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD,
  MEDIUM_CONFIDENCE_THRESHOLD,
  type ConfidenceLevel,
} from '@domain/value-objects/extraction-confidence';

// ---------------------------------------------------------------------------
// Public view-model types
// ---------------------------------------------------------------------------

/** Confidence bands the UI surfaces. Never inferred from colour alone. */
export type DraftConfidenceLevel = ConfidenceLevel;

export interface LineItemViewModel {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly totalAmountMinor: number;
  readonly assignedMemberIds: readonly string[];
  readonly confidence: number;
  readonly confidenceLevel: DraftConfidenceLevel;
  readonly needsReview: boolean;
  /** True when the user has manually corrected this item. */
  readonly isEdited: boolean;
}

export interface ChargeViewModel {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly amountMinor: number;
  readonly confidence: number;
  readonly confidenceLevel: DraftConfidenceLevel;
  readonly needsReview: boolean;
  readonly isEdited: boolean;
}

export interface IssueViewModel {
  readonly id: string;
  readonly type: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly fieldName: string;
  readonly message: string;
  readonly isBlocking: boolean;
  /** Suggested fix as a plain string (when the underlying issue has one). */
  readonly suggestedValueLabel: string | null;
}

export interface FieldConfidenceViewModel {
  readonly confidence: number;
  readonly level: DraftConfidenceLevel;
  readonly needsReview: boolean;
  readonly isEdited: boolean;
  /** Plain-language label, e.g. "High confidence". */
  readonly label: string;
  /** True when the field is absent (unknown confidence) and required. */
  readonly isMissing: boolean;
}

export interface DraftReviewViewModel {
  readonly draftId: string;
  readonly source: string;
  readonly title: string;
  readonly merchantName: string;
  readonly expenseDate: string;
  readonly currencyCode: string;
  readonly totalAmountMinor: number;
  readonly totalConfidence: number;
  readonly totalConfidenceLevel: DraftConfidenceLevel;
  readonly totalNeedsReview: boolean;
  /** True when subtotal + charges ≠ total (a blocking issue). */
  readonly totalMismatch: boolean;
  readonly lineItems: readonly LineItemViewModel[];
  readonly charges: readonly ChargeViewModel[];
  readonly payerMemberId: string | null;
  readonly participantIds: readonly string[];
  readonly splitMethod: string;
  readonly issues: readonly IssueViewModel[];
  readonly blockingIssueCount: number;
  readonly canConfirm: boolean;
  readonly hasImageSource: boolean;
  readonly hasLineItems: boolean;
  readonly hasCharges: boolean;
  readonly hasIssues: boolean;
  readonly hasUnassignedItems: boolean;
  readonly titleConfidence: FieldConfidenceViewModel;
  readonly merchantConfidence: FieldConfidenceViewModel;
  readonly dateConfidence: FieldConfidenceViewModel;
  readonly currencyConfidence: FieldConfidenceViewModel;
}

// ---------------------------------------------------------------------------
// Confidence helpers
// ---------------------------------------------------------------------------

/**
 * Bucket a 0–1 confidence value into one of four qualitative levels.
 *
 *   >= 0.85 → high     (auto-accepted, no review needed)
 *   >= 0.60 → medium   (suggest review)
 *   >= 0.30 → low      (require review)
 *   <  0.30 → unknown  (likely garbage, require review)
 */
export function bucketConfidence(confidence: number | undefined): DraftConfidenceLevel {
  if (confidence === undefined || !Number.isFinite(confidence)) return 'unknown';
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) return 'low';
  return 'unknown';
}

/** Plain-language label for a confidence level. Always shown next to the dot. */
export function confidenceLevelLabel(level: DraftConfidenceLevel): string {
  switch (level) {
    case 'high':
      return 'High confidence';
    case 'medium':
      return 'Medium confidence — review suggested';
    case 'low':
      return 'Low confidence — review required';
    case 'unknown':
      return 'Confidence unknown — review required';
  }
}

/** True when the level requires the user to review the field before confirming. */
export function requiresReview(level: DraftConfidenceLevel): boolean {
  return level !== 'high';
}

// ---------------------------------------------------------------------------
// Issue severity → blocking
// ---------------------------------------------------------------------------

/**
 * Returns true if the issue severity blocks confirmation.
 *
 * Only `error` severity issues block. `warning` and `info` are surfaced
 * to the user but do not gate the Confirm button.
 */
export function isBlockingSeverity(severity: FieldReviewSeverity): boolean {
  return severity === 'error';
}

// ---------------------------------------------------------------------------
// Charge type labels
// ---------------------------------------------------------------------------

const CHARGE_TYPE_LABELS: Readonly<Record<string, string>> = {
  tax: 'Tax',
  service_charge: 'Service charge',
  tip: 'Tip',
  delivery: 'Delivery',
  discount: 'Discount',
  rounding_adjustment: 'Rounding adjustment',
  unassigned_amount: 'Unassigned amount',
};

/** Human-readable label for a charge type. Falls back to the raw type. */
export function chargeTypeLabel(type: string): string {
  return CHARGE_TYPE_LABELS[type] ?? type;
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function buildLineItemView(item: DraftLineItem, edited: boolean): LineItemViewModel {
  const level = bucketConfidence(item.confidence);
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor,
    totalAmountMinor: item.totalAmountMinor,
    assignedMemberIds: item.assignedMemberIds,
    confidence: item.confidence ?? 0,
    confidenceLevel: level,
    needsReview: item.needsReview || requiresReview(level),
    isEdited: edited,
  };
}

function buildChargeView(charge: DraftCharge, edited: boolean): ChargeViewModel {
  const level = bucketConfidence(charge.confidence);
  return {
    id: charge.id,
    type: charge.type,
    label: charge.label ?? chargeTypeLabel(charge.type),
    amountMinor: charge.amountMinor,
    confidence: charge.confidence ?? 0,
    confidenceLevel: level,
    needsReview: charge.needsReview || requiresReview(level),
    isEdited: edited,
  };
}

function buildIssueView(issue: FieldReviewIssue): IssueViewModel {
  const isBlocking = isBlockingSeverity(issue.severity);
  const suggestedValueLabel = formatSuggestedValue(issue.suggestedValue);
  return {
    id: issue.id,
    type: issue.issueType,
    severity: issue.severity,
    fieldName: issue.fieldName,
    message: issue.message,
    isBlocking,
    suggestedValueLabel,
  };
}

function formatSuggestedValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function buildFieldConfidence(
  confidence: number | undefined,
  isMissing: boolean,
  isEdited: boolean,
): FieldConfidenceViewModel {
  const level = isMissing ? 'unknown' : bucketConfidence(confidence);
  return {
    confidence: confidence ?? 0,
    level,
    needsReview: isMissing || requiresReview(level),
    isEdited,
    label: confidenceLevelLabel(level),
    isMissing,
  };
}

// ---------------------------------------------------------------------------
// Total / subtotal mismatch
// ---------------------------------------------------------------------------

/**
 * Sum the line-item and charge amounts on the draft. Returns the integer
 * minor-unit total. Discounts / rounding adjustments are summed with their
 * sign (a negative discount reduces the subtotal).
 */
export function computeDraftSubtotal(draft: ExpenseDraft): number {
  const itemsTotal = draft.lineItems.reduce((acc, i) => acc + i.totalAmountMinor, 0);
  const chargesTotal = draft.charges.reduce((acc, c) => acc + c.amountMinor, 0);
  return itemsTotal + chargesTotal;
}

/**
 * Returns true when the computed subtotal (line items + charges) does not
 * match the draft's stated `amountMinor`. A missing total (`amountMinor`
 * undefined) is treated as a mismatch — the user must fill it in.
 */
export function isTotalMismatch(draft: ExpenseDraft): boolean {
  if (draft.amountMinor === undefined) return true;
  const computed = computeDraftSubtotal(draft);
  return computed !== draft.amountMinor;
}

// ---------------------------------------------------------------------------
// Edited-field tracking (Phase 2 stub)
// ---------------------------------------------------------------------------

/**
 * Phase 2 stub — the real "edited" flag is set when the user types into a
 * field. The draft entity does not yet carry an `editedFields` set, so we
 * derive "edited" conservatively from a known set passed by the caller.
 *
 * The view-model signature accepts an explicit `editedFields` set so the
 * screen can grow this capability without changing the VM contract. When
 * the set is empty, every field is treated as un-edited.
 */
export interface DraftReviewInput {
  readonly draft: ExpenseDraft;
  /** Field names the user has manually corrected (Phase 2: empty by default). */
  readonly editedFields?: ReadonlySet<string>;
  /** The currently-selected split method (Phase 2: 'equal' default). */
  readonly splitMethod?: string;
}

/**
 * Build the draft-review view model from a domain draft.
 *
 * Pure — no React, no I/O. The screen reads `useDraftStore` (or a test
 * fixture) and passes the draft here, then renders the resulting view
 * model.
 */
export function createDraftReviewViewModel(input: DraftReviewInput): DraftReviewViewModel {
  const draft = input.draft;
  const edited = input.editedFields ?? new Set<string>();
  const splitMethod = input.splitMethod ?? 'equal';

  const lineItems = draft.lineItems.map((i) =>
    buildLineItemView(i, edited.has(`lineItems.${i.id}`)),
  );
  const charges = draft.charges.map((c) =>
    buildChargeView(c, edited.has(`charges.${c.id}`)),
  );
  const issues = draft.unresolvedIssues.map(buildIssueView);

  const blockingIssueCount = issues.filter((i) => i.isBlocking).length;

  const totalMismatch = isTotalMismatch(draft);
  const totalConfidence = draft.overallConfidence ?? 0;
  const totalLevel = bucketConfidence(draft.overallConfidence);

  const hasUnassignedItems = lineItems.some((i) => i.assignedMemberIds.length === 0);
  const payerMemberId = draft.payerCandidates[0] ?? null;
  const participantIds = draft.participantCandidates;

  // The total itself is "missing" when amountMinor is undefined.
  const totalMissing = draft.amountMinor === undefined;

  // canConfirm: no blocking issues AND total is not missing AND payer
  // is set AND at least one participant is set (when items exist they
  // must all be assigned — otherwise the line-item issues will already
  // be blocking).
  const missingPayer = payerMemberId === null;
  const missingParticipants = participantIds.length === 0;
  const canConfirm =
    blockingIssueCount === 0 &&
    !totalMismatch &&
    !missingPayer &&
    !missingParticipants;

  return {
    draftId: draft.id,
    source: draft.source,
    title: draft.title ?? '',
    merchantName: draft.merchantName ?? '',
    expenseDate: draft.expenseDate ?? '',
    currencyCode: draft.currencyCode ?? 'USD',
    totalAmountMinor: draft.amountMinor ?? 0,
    totalConfidence: totalConfidence as number,
    totalConfidenceLevel: totalLevel,
    totalNeedsReview: totalMissing || requiresReview(totalLevel),
    totalMismatch,
    lineItems,
    charges,
    payerMemberId,
    participantIds,
    splitMethod,
    issues,
    blockingIssueCount,
    canConfirm,
    hasImageSource: draft.captureSourceId !== undefined,
    hasLineItems: lineItems.length > 0,
    hasCharges: charges.length > 0,
    hasIssues: issues.length > 0,
    hasUnassignedItems,
    titleConfidence: buildFieldConfidence(
      draft.overallConfidence as number | undefined,
      draft.title === undefined || draft.title.trim().length === 0,
      edited.has('title'),
    ),
    merchantConfidence: buildFieldConfidence(
      draft.overallConfidence as number | undefined,
      draft.merchantName === undefined || draft.merchantName.trim().length === 0,
      edited.has('merchantName'),
    ),
    dateConfidence: buildFieldConfidence(
      draft.overallConfidence as number | undefined,
      draft.expenseDate === undefined || draft.expenseDate.trim().length === 0,
      edited.has('expenseDate'),
    ),
    currencyConfidence: buildFieldConfidence(
      draft.overallConfidence as number | undefined,
      draft.currencyCode === undefined,
      edited.has('currencyCode'),
    ),
  };
}

// ---------------------------------------------------------------------------
// Issue type → display helpers (used by tests + the screen)
// ---------------------------------------------------------------------------

/** Ionicons glyph for an issue type. */
export function issueTypeIcon(type: FieldReviewIssueType | string): string {
  switch (type) {
    case 'low_confidence':
      return 'eye-outline';
    case 'total_mismatch':
      return 'calculator-outline';
    case 'missing_field':
      return 'alert-circle-outline';
    case 'duplicate_item':
      return 'copy-outline';
    case 'invalid_value':
      return 'warning-outline';
    case 'unassigned_items':
      return 'person-outline';
    case 'currency_mismatch':
      return 'cash-outline';
    case 'date_in_future':
      return 'calendar-outline';
    case 'amount_unreasonable':
      return 'trending-up-outline';
    default:
      return 'information-circle-outline';
  }
}

/** Badge variant that matches the issue severity (colour + text together). */
export function issueSeverityBadge(
  severity: FieldReviewSeverity,
): 'positive' | 'negative' | 'warning' | 'info' | 'neutral' {
  switch (severity) {
    case 'info':
      return 'info';
    case 'warning':
      return 'warning';
    case 'error':
      return 'negative';
  }
}

/** Plain-language label for the severity, paired with the colour. */
export function issueSeverityLabel(severity: FieldReviewSeverity): string {
  switch (severity) {
    case 'info':
      return 'Info';
    case 'warning':
      return 'Warning';
    case 'error':
      return 'Blocking issue';
  }
}
