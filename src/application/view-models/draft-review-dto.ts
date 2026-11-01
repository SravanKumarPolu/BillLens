/**
 * Draft review DTO — application-layer projection from domain entities
 * (ExpenseDraft + ExtractionResult) into a shape the presentation
 * layer's `createDraftReviewViewModel` consumes.
 *
 * The presentation view-model takes a `DraftReviewInput` (a draft plus
 * an `editedFields` set plus a `splitMethod`). This DTO is what the
 * application layer produces by mapping domain entities into that input
 * contract.
 *
 * Mapping is PURE — no I/O, no React, no business logic beyond
 * projection. The application use case loads the ExpenseDraft (and
 * optionally its ExtractionResult) from repositories; this file only
 * reshapes them and computes the application-level flags (e.g. which
 * fields are missing, whether the total matches the sum of items).
 *
 * Hard rule: this DTO NEVER fabricates financial data. If the source
 * draft is empty (no amount, no line items), the DTO produced will
 * reflect that — it produces a legitimate "needs review" input that
 * the presentation view-model can render as an empty / blocking state.
 */

import type { DraftCharge } from '@domain/entities/draft-charge';
import type { DraftLineItem } from '@domain/entities/draft-line-item';
import type { ExpenseDraft } from '@domain/entities/expense-draft';
import type { ExtractionResult } from '@domain/entities/extraction-result';
import type { FieldReviewIssue } from '@domain/entities/field-review-issue';
import type { ExtractedField } from '@domain/value-objects/extracted-field';

// ---------------------------------------------------------------------------
// DTO types — projection of the domain entities into the shape the
// presentation view-model expects.
// ---------------------------------------------------------------------------

export interface LineItemDTO {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly totalAmountMinor: number;
  readonly assignedMemberIds: readonly string[];
  readonly confidence: number;
  readonly needsReview: boolean;
  /** True when the user has manually corrected this item. */
  readonly isEdited: boolean;
}

export interface ChargeDTO {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly amountMinor: number;
  readonly confidence: number;
  readonly needsReview: boolean;
  readonly isEdited: boolean;
}

export interface IssueDTO {
  readonly id: string;
  readonly type: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly fieldName: string;
  readonly message: string;
  readonly isBlocking: boolean;
  /** Suggested fix as a plain string (when the underlying issue has one). */
  readonly suggestedValueLabel: string | null;
}

/**
 * Draft review DTO — application-layer projection of an ExpenseDraft
 * (plus its optional ExtractionResult). The presentation view-model
 * consumes this DTO and adds presentation-only shaping (confidence
 * bucketing, badge variants, etc.).
 *
 * `canConfirm` is the application-level "all required fields present and
 * no blocking issues" flag — the presentation layer may further refine
 * it (e.g. require all line items to be assigned), but the application
 * invariant is: `canConfirm === false` ⇒ the user MUST NOT be able to
 * confirm the draft.
 */
export interface DraftReviewDTO {
  readonly draftId: string;
  readonly status: string;
  readonly source: string;
  readonly title: string | undefined;
  readonly merchantName: string | undefined;
  readonly expenseDate: string | undefined;
  readonly currencyCode: string | undefined;
  readonly amountMinor: number | undefined;
  readonly overallConfidence: number | undefined;
  readonly totalMatches: boolean;
  readonly hasCaptureSource: boolean;
  readonly extractionResultId: string | undefined;
  readonly lineItems: readonly LineItemDTO[];
  readonly charges: readonly ChargeDTO[];
  readonly issues: readonly IssueDTO[];
  readonly payerCandidateIds: readonly string[];
  readonly participantCandidateIds: readonly string[];
  readonly canConfirm: boolean;
  readonly blockingIssueCount: number;
}

// ---------------------------------------------------------------------------
// Mapping input — what the application use case passes in.
// ---------------------------------------------------------------------------

export interface DraftReviewMappingInput {
  readonly draft: ExpenseDraft;
  /** The extraction result the draft was derived from, if available. */
  readonly extraction?: ExtractionResult;
  /** Field paths the user has manually corrected (e.g. `title`, `lineItems.<id>`). */
  readonly editedFields?: ReadonlySet<string>;
  /** Currently-selected split method label (Phase 2: defaults to 'equal'). */
  readonly splitMethod?: string;
}

// ---------------------------------------------------------------------------
// Pure mapping function
// ---------------------------------------------------------------------------

/**
 * Map an ExpenseDraft (plus optional ExtractionResult) into a
 * `DraftReviewDTO`.
 *
 * Pure: no I/O, no React, no side effects.
 *
 * Field projection rules:
 *
 *   - `title`, `merchantName`, `expenseDate`, `currencyCode`,
 *     `amountMinor` — passed through as-is from the draft (each may be
 *     `undefined` when the extraction couldn't detect it).
 *   - `overallConfidence` — passed through as a plain number (the
 *     branded `ExtractionConfidence` is unwrapped at the boundary).
 *   - `totalMatches` — recomputed from the draft's line items + charges
 *     vs `amountMinor`. True when the sum equals `amountMinor`, false
 *     when they differ or when `amountMinor` is undefined.
 *   - `canConfirm` — true only when:
 *       1. `amountMinor` is defined
 *       2. `totalMatches === true`
 *       3. At least one payer candidate exists
 *       4. At least one participant candidate exists
 *       5. There are zero blocking (`error`-severity) issues
 */
export function mapDraftToDTO(input: DraftReviewMappingInput): DraftReviewDTO {
  const draft = input.draft;
  const edited = input.editedFields ?? new Set<string>();

  const lineItems: LineItemDTO[] = draft.lineItems.map((item) =>
    mapLineItemDTO(item, edited.has(`lineItems.${item.id}`)),
  );
  const charges: ChargeDTO[] = draft.charges.map((charge) =>
    mapChargeDTO(charge, edited.has(`charges.${charge.id}`)),
  );
  const issues: IssueDTO[] = draft.unresolvedIssues.map(mapIssueDTO);

  const blockingIssueCount = issues.filter((i) => i.isBlocking).length;
  const totalMatches = computeTotalMatches(draft, lineItems, charges);

  const hasPayer = draft.payerCandidates.length > 0;
  const hasParticipants = draft.participantCandidates.length > 0;
  const hasAmount = draft.amountMinor !== undefined;

  const canConfirm =
    hasAmount &&
    totalMatches &&
    hasPayer &&
    hasParticipants &&
    blockingIssueCount === 0;

  return {
    draftId: draft.id as string,
    status: draft.status,
    source: draft.source,
    title: draft.title,
    merchantName: draft.merchantName,
    expenseDate: draft.expenseDate,
    currencyCode: draft.currencyCode as string | undefined,
    amountMinor: draft.amountMinor,
    overallConfidence:
      draft.overallConfidence !== undefined
        ? (draft.overallConfidence as number)
        : undefined,
    totalMatches,
    hasCaptureSource: draft.captureSourceId !== undefined,
    extractionResultId: draft.extractionResultId,
    lineItems,
    charges,
    issues,
    payerCandidateIds: draft.payerCandidates.map((id) => id as string),
    participantCandidateIds: draft.participantCandidates.map((id) => id as string),
    canConfirm,
    blockingIssueCount,
  };
}

// ---------------------------------------------------------------------------
// Sub-mappers
// ---------------------------------------------------------------------------

function mapLineItemDTO(item: DraftLineItem, isEdited: boolean): LineItemDTO {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor,
    totalAmountMinor: item.totalAmountMinor,
    assignedMemberIds: item.assignedMemberIds.map((id) => id as string),
    confidence: item.confidence ?? 0,
    needsReview: item.needsReview,
    isEdited,
  };
}

function mapChargeDTO(charge: DraftCharge, isEdited: boolean): ChargeDTO {
  return {
    id: charge.id,
    type: charge.type,
    label: charge.label ?? chargeTypeLabel(charge.type),
    amountMinor: charge.amountMinor,
    confidence: charge.confidence ?? 0,
    needsReview: charge.needsReview,
    isEdited,
  };
}

function mapIssueDTO(issue: FieldReviewIssue): IssueDTO {
  return {
    id: issue.id,
    type: issue.issueType,
    severity: issue.severity,
    fieldName: issue.fieldName,
    message: issue.message,
    isBlocking: issue.severity === 'error',
    suggestedValueLabel: formatSuggestedValue(issue.suggestedValue),
  };
}

// ---------------------------------------------------------------------------
// Helpers — kept here (rather than imported from the presentation
// view-model) so the application layer does NOT depend on presentation.
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

function chargeTypeLabel(type: string): string {
  return CHARGE_TYPE_LABELS[type] ?? type;
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

/**
 * Recompute whether the draft's line items + charges sum to the stated
 * `amountMinor`.
 *
 *   - `amountMinor === undefined` ⇒ false (total missing ⇒ mismatch).
 *   - Sum of line items + charges ≠ `amountMinor` ⇒ false.
 *   - Otherwise ⇒ true.
 *
 * Charges with negative amounts (discounts, rounding adjustments) are
 * summed with their sign — a discount reduces the subtotal.
 */
function computeTotalMatches(
  draft: ExpenseDraft,
  lineItems: readonly LineItemDTO[],
  charges: readonly ChargeDTO[],
): boolean {
  if (draft.amountMinor === undefined) return false;
  const itemsTotal = lineItems.reduce((acc, i) => acc + i.totalAmountMinor, 0);
  const chargesTotal = charges.reduce((acc, c) => acc + c.amountMinor, 0);
  return itemsTotal + chargesTotal === draft.amountMinor;
}

// ---------------------------------------------------------------------------
// ExtractionResult helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an ExtractedField's value with a fallback. Returns the
 * fallback when the field is undefined or its value is undefined.
 *
 * Useful in the application use case when seeding a draft from an
 * ExtractionResult — every extracted field becomes a draft field, with
 * a sensible fallback when the extractor returned undefined.
 */
export function resolveExtractedValue<T>(
  field: ExtractedField<T> | undefined,
  fallback: T,
): T {
  if (field === undefined || field.value === undefined) return fallback;
  return field.value;
}

/**
 * True when the extraction result has at least one low-confidence field
 * (confidence < 0.85) OR is missing any required field (merchant, date,
 * currency, total). Used by the application use case to decide whether
 * the resulting draft starts in `needs_review` (low confidence) or
 * could move directly to `ready` (high confidence).
 */
export function isLowConfidenceExtraction(extraction: ExtractionResult): boolean {
  const fields = [
    extraction.merchant,
    extraction.date,
    extraction.currencyCode,
    extraction.subtotal,
    extraction.tax,
    extraction.total,
  ];
  for (const f of fields) {
    if (f.value === undefined) return true;
    if ((f.confidence as number) < 0.85) return true;
  }
  for (const item of extraction.lineItems) {
    if (
      item.name.value === undefined ||
      (item.name.confidence as number) < 0.85
    ) {
      return true;
    }
  }
  return false;
}
