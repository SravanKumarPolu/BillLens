import type {
  CaptureSourceId,
  ExpenseDraftId,
  ExpenseId,
  GroupId,
  MemberId,
  ReceiptId,
  UserId,
} from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';
import type { CurrencyCode } from '../value-objects/currency-code';
import type { DateTime } from '../value-objects/date-time';
import type { ExtractionConfidence } from '../value-objects/extraction-confidence';
import { asCurrencyCode, asExtractionConfidence, nowDateTime } from '../value-objects/index';

import type { DraftCharge } from './draft-charge';
import type { DraftLineItem } from './draft-line-item';
import type { FieldReviewIssue } from './field-review-issue';

export function asExpenseDraftId(value: string): ExpenseDraftId {
  return value as ExpenseDraftId;
}

/**
 * How the draft was created.
 *
 *   manual              — User typed it in by hand (no capture)
 *   receipt             — From a paper/digital receipt capture
 *   payment_screenshot  — From a UPI/card/bank screenshot
 *   invoice             — From a digital invoice
 */
export type DraftSource = 'manual' | 'receipt' | 'payment_screenshot' | 'invoice';

/**
 * Lifecycle of an ExpenseDraft.
 *
 *   capturing     — CaptureSource created, OCR not yet started (Phase 2)
 *   processing    — Extraction still running (only for non-manual sources)
 *   needs_review  — Extraction done, but low-confidence or unresolved issues
 *   ready         — All checks pass, awaiting user confirm
 *   confirmed     — User confirmed; final Expense created
 *   discarded     — User discarded; draft is dead
 *
 * The full state machine is:
 *
 *   capturing → processing → needs_review → confirmed (or discarded)
 *                                ↓
 *                              ready → confirmed (or discarded)
 *
 * A draft may move directly from `needs_review` to `confirmed` once all
 * blocking issues are resolved (the `ready` state is optional but
 * recommended — it signals that the pipeline has re-validated the draft
 * and found no issues).
 *
 * Only `capturing`, `needs_review`, `ready`, and `processing` are editable.
 * Once `confirmed` or `discarded`, the draft is immutable.
 */
export type DraftStatus =
  | 'capturing'
  | 'processing'
  | 'needs_review'
  | 'ready'
  | 'confirmed'
  | 'discarded';

/**
 * The CENTRAL entity of the capture intelligence layer — the editable
 * intermediate between a captured image (CaptureSource) and a final
 * Expense.
 *
 * A draft starts life either:
 *   - Manually (source = 'manual'), with no captureSourceId, OR
 *   - From a capture (source = 'receipt' | 'payment_screenshot' | 'invoice'),
 *     with a captureSourceId and (optionally) an extractionResultId.
 *
 * The user edits the draft fields, assigns payers/participants, assigns
 * members to line items (for item-level splits), and resolves any
 * FieldReviewIssues. Once everything looks good (status = 'ready'),
 * the user confirms the draft — at which point the application layer
 * creates a real Expense + ExpensePayers + ExpenseSplits + Receipt
 * atomically and sets `confirmedExpenseId` / `confirmedReceiptId`.
 *
 * All money fields are in minor units (integer paise / cents).
 */
export interface ExpenseDraft {
  readonly id: ExpenseDraftId;
  readonly groupId?: GroupId;
  readonly source: DraftSource;
  readonly captureSourceId?: CaptureSourceId;
  readonly extractionResultId?: string;

  // Editable fields (from extraction or manual input)
  readonly title?: string;
  readonly amountMinor?: number;
  readonly currencyCode?: CurrencyCode;
  readonly merchantName?: string;
  readonly expenseDate?: string;

  // Participants
  readonly payerCandidates: readonly MemberId[];
  readonly participantCandidates: readonly MemberId[];

  // Line items and charges (for item-level splits)
  readonly lineItems: readonly DraftLineItem[];
  readonly charges: readonly DraftCharge[];

  // Confidence and review
  readonly overallConfidence?: ExtractionConfidence;
  readonly unresolvedIssues: readonly FieldReviewIssue[];

  // Lifecycle
  readonly status: DraftStatus;

  // Link to final expense (set when confirmed)
  readonly confirmedExpenseId?: ExpenseId;
  readonly confirmedReceiptId?: ReceiptId;

  readonly createdBy: UserId;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly version: number;
}

export interface ExpenseDraftCreateInput {
  readonly id: ExpenseDraftId;
  readonly groupId?: GroupId;
  readonly source: DraftSource;
  readonly captureSourceId?: CaptureSourceId;
  readonly extractionResultId?: string;
  readonly title?: string;
  readonly amountMinor?: number;
  readonly currencyCode?: string;
  readonly merchantName?: string;
  readonly expenseDate?: string;
  readonly payerCandidates?: readonly MemberId[];
  readonly participantCandidates?: readonly MemberId[];
  readonly lineItems?: readonly DraftLineItem[];
  readonly charges?: readonly DraftCharge[];
  /** Raw 0–1 confidence; validated through `asExtractionConfidence`. */
  readonly overallConfidence?: number;
  readonly unresolvedIssues?: readonly FieldReviewIssue[];
  readonly createdBy: UserId;
  readonly now?: DateTime;
}

/**
 * Create a new ExpenseDraft.
 *
 * A freshly-created draft always starts in `capturing` status and
 * `version = 1`. This is the entry point of the state machine:
 *
 *   capturing → processing → needs_review → confirmed (or discarded)
 *
 * The capture pipeline must call {@link startProcessing} to move the
 * draft to `processing` once OCR begins, then {@link completeProcessing}
 * to move it to `needs_review` once extraction is done. (A manual draft
 * with `source = 'manual'` may skip straight through to `needs_review`
 * by calling {@link completeProcessing} — the transitions are tolerant
 * of a missing `processing` step for manual entry.)
 *
 * `overallConfidence`, if provided, is validated through
 * `asExtractionConfidence` — throws if outside [0, 1].
 *
 * `currencyCode`, if provided, is validated through `asCurrencyCode` —
 * throws if not a 3-letter uppercase ISO 4217 code.
 */
export function createExpenseDraft(input: ExpenseDraftCreateInput): ExpenseDraft {
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
    source: input.source,
    ...(input.captureSourceId !== undefined ? { captureSourceId: input.captureSourceId } : {}),
    ...(input.extractionResultId !== undefined
      ? { extractionResultId: input.extractionResultId }
      : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
    ...(input.currencyCode !== undefined
      ? { currencyCode: asCurrencyCode(input.currencyCode) }
      : {}),
    ...(input.merchantName !== undefined ? { merchantName: input.merchantName } : {}),
    ...(input.expenseDate !== undefined ? { expenseDate: input.expenseDate } : {}),
    payerCandidates: input.payerCandidates ?? [],
    participantCandidates: input.participantCandidates ?? [],
    lineItems: input.lineItems ?? [],
    charges: input.charges ?? [],
    ...(input.overallConfidence !== undefined
      ? { overallConfidence: asExtractionConfidence(input.overallConfidence) }
      : {}),
    unresolvedIssues: input.unresolvedIssues ?? [],
    // New drafts start in `capturing`. The pipeline moves them through
    // `processing` → `needs_review` as OCR runs and results arrive.
    status: 'capturing',
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

export interface ExpenseDraftStatusTransitionInput {
  readonly now?: DateTime;
  readonly expectedVersion: number;
}

/**
 * Transition a draft from `capturing` → `processing`.
 *
 * Called by the capture pipeline when OCR / extraction begins on the
 * captured image. Throws {@link InvalidEntityError} on version conflict,
 * if the draft is in a terminal status, or if the draft is not currently
 * in `capturing` status.
 */
export function startProcessing(
  current: ExpenseDraft,
  input: ExpenseDraftStatusTransitionInput,
): ExpenseDraft {
  if (current.version !== input.expectedVersion) {
    throw new InvalidEntityError(
      `ExpenseDraft version conflict: expected ${input.expectedVersion}, got ${current.version}`,
    );
  }
  if (current.status === 'confirmed' || current.status === 'discarded') {
    throw new InvalidEntityError(
      `ExpenseDraft ${current.id} is ${current.status} and cannot be transitioned`,
    );
  }
  if (current.status !== 'capturing') {
    throw new InvalidEntityError(
      `ExpenseDraft ${current.id} is ${current.status}, expected 'capturing' to start processing`,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    status: 'processing',
    updatedAt: now,
    version: current.version + 1,
  };
}

/**
 * Transition a draft from `processing` → `needs_review`.
 *
 * Called by the capture pipeline once extraction is complete and the
 * draft fields have been populated from the ExtractionResult. After
 * this transition, the draft is editable in the review UI.
 *
 * Throws {@link InvalidEntityError} on version conflict, if the draft is
 * in a terminal status, or if the draft is not currently in `processing`
 * status.
 */
export function completeProcessing(
  current: ExpenseDraft,
  input: ExpenseDraftStatusTransitionInput,
): ExpenseDraft {
  if (current.version !== input.expectedVersion) {
    throw new InvalidEntityError(
      `ExpenseDraft version conflict: expected ${input.expectedVersion}, got ${current.version}`,
    );
  }
  if (current.status === 'confirmed' || current.status === 'discarded') {
    throw new InvalidEntityError(
      `ExpenseDraft ${current.id} is ${current.status} and cannot be transitioned`,
    );
  }
  if (current.status !== 'processing') {
    throw new InvalidEntityError(
      `ExpenseDraft ${current.id} is ${current.status}, expected 'processing' to complete extraction`,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    status: 'needs_review',
    updatedAt: now,
    version: current.version + 1,
  };
}

export interface ExpenseDraftUpdateInput {
  readonly groupId?: GroupId;
  readonly title?: string;
  readonly amountMinor?: number;
  readonly currencyCode?: string;
  readonly merchantName?: string;
  readonly expenseDate?: string;
  readonly payerCandidates?: readonly MemberId[];
  readonly participantCandidates?: readonly MemberId[];
  readonly lineItems?: readonly DraftLineItem[];
  readonly charges?: readonly DraftCharge[];
  readonly unresolvedIssues?: readonly FieldReviewIssue[];
  readonly status?: DraftStatus;
  readonly now?: DateTime;
  readonly expectedVersion: number;
}

/**
 * Update an editable ExpenseDraft.
 *
 * Performs optimistic-concurrency check via `expectedVersion`. Throws
 * {@link InvalidEntityError} if the version doesn't match, or if the
 * draft is in a terminal status (`confirmed` or `discarded`).
 *
 * Only the provided fields are overwritten — fields not in `input` are
 * preserved from `current`.
 */
export function updateExpenseDraft(
  current: ExpenseDraft,
  input: ExpenseDraftUpdateInput,
): ExpenseDraft {
  if (current.version !== input.expectedVersion) {
    throw new InvalidEntityError(
      `ExpenseDraft version conflict: expected ${input.expectedVersion}, got ${current.version}`,
    );
  }
  if (current.status === 'confirmed' || current.status === 'discarded') {
    throw new InvalidEntityError(
      `ExpenseDraft ${current.id} is ${current.status} and cannot be updated`,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
    ...(input.currencyCode !== undefined
      ? { currencyCode: asCurrencyCode(input.currencyCode) }
      : {}),
    ...(input.merchantName !== undefined ? { merchantName: input.merchantName } : {}),
    ...(input.expenseDate !== undefined ? { expenseDate: input.expenseDate } : {}),
    ...(input.payerCandidates !== undefined ? { payerCandidates: input.payerCandidates } : {}),
    ...(input.participantCandidates !== undefined
      ? { participantCandidates: input.participantCandidates }
      : {}),
    ...(input.lineItems !== undefined ? { lineItems: input.lineItems } : {}),
    ...(input.charges !== undefined ? { charges: input.charges } : {}),
    ...(input.unresolvedIssues !== undefined
      ? { unresolvedIssues: input.unresolvedIssues }
      : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    updatedAt: now,
    version: current.version + 1,
  };
}

export interface ExpenseDraftConfirmInput {
  readonly confirmedExpenseId: ExpenseId;
  readonly confirmedReceiptId?: ReceiptId;
  readonly now?: DateTime;
  readonly expectedVersion: number;
}

/**
 * Confirm an ExpenseDraft.
 *
 * Sets `status = 'confirmed'` and records the link to the newly-created
 * final Expense (and optional Receipt). After confirmation, the draft
 * is immutable.
 *
 * Throws {@link InvalidEntityError} on version conflict, if already
 * confirmed, or if the draft was discarded.
 */
export function confirmExpenseDraft(
  current: ExpenseDraft,
  input: ExpenseDraftConfirmInput,
): ExpenseDraft {
  if (current.version !== input.expectedVersion) {
    throw new InvalidEntityError('ExpenseDraft version conflict');
  }
  if (current.status === 'confirmed') {
    throw new InvalidEntityError(`ExpenseDraft ${current.id} is already confirmed`);
  }
  if (current.status === 'discarded') {
    throw new InvalidEntityError(
      `ExpenseDraft ${current.id} is discarded and cannot be confirmed`,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    status: 'confirmed',
    confirmedExpenseId: input.confirmedExpenseId,
    ...(input.confirmedReceiptId !== undefined
      ? { confirmedReceiptId: input.confirmedReceiptId }
      : {}),
    updatedAt: now,
    version: current.version + 1,
  };
}

/**
 * Discard an ExpenseDraft.
 *
 * Sets `status = 'discarded'`. The draft is then immutable. Discarding
 * does NOT delete the underlying CaptureSource — the user can re-run
 * extraction from the same image if they want.
 *
 * `expectedVersion` is optional for discard (matches the prompt's
 * signature) but recommended for safety.
 */
export function discardExpenseDraft(
  current: ExpenseDraft,
  now?: DateTime,
  expectedVersion?: number,
): ExpenseDraft {
  if (expectedVersion !== undefined && current.version !== expectedVersion) {
    throw new InvalidEntityError('ExpenseDraft version conflict');
  }
  if (current.status === 'confirmed') {
    throw new InvalidEntityError(
      `ExpenseDraft ${current.id} is confirmed and cannot be discarded`,
    );
  }
  const ts = now ?? nowDateTime();
  return {
    ...current,
    status: 'discarded',
    updatedAt: ts,
    version: current.version + 1,
  };
}

/**
 * Returns true if the draft is still editable (not in a terminal state).
 *
 * Terminal states: `confirmed`, `discarded`. All other states
 * (`capturing`, `processing`, `needs_review`, `ready`) are editable —
 * the user (or the pipeline) may still mutate the draft's fields.
 */
export function isDraftEditable(draft: ExpenseDraft): boolean {
  return (
    draft.status === 'capturing' ||
    draft.status === 'needs_review' ||
    draft.status === 'ready' ||
    draft.status === 'processing'
  );
}
