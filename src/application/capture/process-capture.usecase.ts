/**
 * ProcessCaptureUseCase — the orchestrator of the capture → OCR → draft
 * pipeline (v2.4.0).
 *
 * Until v2.3.0 the UI pipeline existed (camera → quality → processing →
 * review) but nothing ever invoked the `CaptureProcessor` port, nothing
 * persisted `CaptureSource` / `ExtractionResult` / `ExpenseDraft`, and the
 * processing screen cycled fake status messages forever. This use case is
 * the missing application-layer orchestration.
 *
 * Responsibilities (in order):
 *
 *   1. Read the image (base64 + size) through the `ImageDataReader` port.
 *   2. Hash the image canonically (SHA-256 over the base64 encoding) for
 *      duplicate-scan detection.
 *   3. Duplicate policy:
 *        - hash match, prior capture still `pending`/`processing`
 *          → `already_processing` (double-tap / rapid resubmit guard).
 *        - hash match, prior capture `completed` AND its draft is still
 *          reviewable (`needs_review` | `ready`) → `duplicate` pointing at
 *          the EXISTING draft. No re-processing, no second draft — the
 *          review screen is the single source of truth for that image.
 *        - hash match but prior draft confirmed/discarded (or prior
 *          capture failed/cancelled) → re-scan allowed; a NEW capture
 *          source + draft are created.
 *   4. Persist a `CaptureSource` (status `processing`) and an
 *      `ExpenseDraft` (`capturing` → `processing`) BEFORE calling the
 *      processor, so an interrupted run is recoverable on next boot
 *      (see `recoverInterruptedDrafts`).
 *   5. Call `CaptureProcessor.process(input, { signal })`.
 *   6. On success: persist the immutable `ExtractionResult`, map it into
 *      editable draft fields (title/merchant/date/currency/amount, line
 *      items, tax/tip charges), compute `FieldReviewIssue`s (missing
 *      total, total mismatch, low confidence, future date), transition
 *      the draft to `needs_review` (or `ready` when there are no
 *      blocking issues), and mark the capture `completed`.
 *   7. On failure: mark the capture `failed`, discard the pipeline draft
 *      (no half-populated junk drafts), and throw a typed
 *      `CapturePipelineError`.
 *   8. On cancellation: mark the capture `cancelled`, discard the draft,
 *      and resolve with outcome `cancelled`.
 *
 * Extracted vs verified: EVERYTHING this use case produces is an
 * unverified suggestion. `ExtractedField.needsReview` and the computed
 * `FieldReviewIssue`s carry confidence; the draft CANNOT become an
 * Expense without explicit user confirmation through
 * `CreateExpenseFromDraftUseCase` (version-guarded + idempotent).
 */

import {
  asCaptureSourceId,
  asDraftChargeId,
  asDraftLineItemId,
  asExtractionResultId,
  asExpenseDraftId,
  asFieldReviewIssueId,
  completeProcessing,
  createDraftCharge,
  createDraftLineItem,
  createExpenseDraft,
  createExtractionResult,
  createFieldReviewIssue,
  discardExpenseDraft,
  startProcessing,
  updateProcessingStatus,
  createCaptureSource,
  type CaptureSource,
  type ExpenseDraft,
  type ExtractionResult,
  type FieldReviewIssue,
} from '@domain/entities';
import type { CaptureProcessingStatus, CaptureSourceType } from '@domain/entities/capture-source';
import type { CaptureProcessor } from '@domain/ports/capture-processor.port';
import type { CaptureSourceRepository } from '@domain/repositories/capture-source.repository';
import type { ExpenseDraftRepository } from '@domain/repositories/expense-draft.repository';
import type { ExtractionResultRepository } from '@domain/repositories/extraction-result.repository';
import type { DateTime } from '@domain/value-objects';
import { nowDateTime } from '@domain/value-objects';
import {
  DRAFT_REVIEW_CONFIDENCE_THRESHOLD,
  MAX_IMAGE_FILE_SIZE_BYTES,
} from '@domain/value-objects';
import type { CaptureSourceId, ExpenseDraftId, UserId } from '@shared-types/index';


// ---------------------------------------------------------------------------
// Ports this use case owns (application layer)
// ---------------------------------------------------------------------------

/** Image bytes + metadata, read through a port so tests need no file system. */
export interface CapturedImageData {
  readonly base64: string;
  readonly sizeBytes: number;
  readonly mimeType?: string;
}

export interface ImageDataReader {
  /** Read the image at `uri`. Throws when the file is missing/unreadable. */
  read(uri: string): Promise<CapturedImageData>;
}

export interface ImageHasher {
  /**
   * Deterministic hash of the image's canonical base64 encoding. The
   * canonicalisation is documented (same file → same hash) even though
   * it is not a hash of the raw byte stream (expo-crypto digests strings).
   */
  hashImageBase64(base64: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface ProcessCaptureInput {
  readonly imageUri: string;
  readonly sourceType: CaptureSourceType;
  /** Group the eventual expense will belong to (optional at capture time). */
  readonly groupId?: string;
  readonly userId: UserId;
  readonly now?: DateTime;
  /** Cancellation signal (user taps Cancel / screen unmounts). */
  readonly signal?: AbortSignal;
}

export type ProcessCaptureOutcome = 'completed' | 'duplicate' | 'already_processing' | 'cancelled';

export interface ProcessCaptureOutput {
  readonly outcome: ProcessCaptureOutcome;
  /** The draft to review (absent for `already_processing` pre-draft). */
  readonly draftId?: ExpenseDraftId;
  readonly captureSourceId: CaptureSourceId;
  /** Present on `duplicate` — the earlier capture with the same image hash. */
  readonly duplicateOf?: CaptureSourceId;
  /** True whenever an existing capture with the same hash was found. */
  readonly isDuplicateImage: boolean;
}

/** Typed pipeline failure — `code` is surfaced to the UI verbatim. */
export type CapturePipelineErrorCode =
  | 'IMAGE_READ_FAILED'
  | 'IMAGE_TOO_LARGE'
  | 'OCR_FAILED'
  | 'OCR_UNAVAILABLE'
  | 'OCR_TIMEOUT'
  | 'OCR_CANCELLED'
  | 'OCR_INVALID_RESPONSE'
  | 'DUPLICATE_CHECK_FAILED'
  | 'PERSISTENCE_FAILED';

export class CapturePipelineError extends Error {
  readonly code: CapturePipelineErrorCode;
  constructor(code: CapturePipelineErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CapturePipelineError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class ProcessCaptureUseCase {
  constructor(
    private readonly captureSources: CaptureSourceRepository,
    private readonly extractionResults: ExtractionResultRepository,
    private readonly drafts: ExpenseDraftRepository,
    private readonly processor: CaptureProcessor,
    private readonly imageReader: ImageDataReader,
    private readonly hasher: ImageHasher,
  ) {}

  async execute(input: ProcessCaptureInput): Promise<ProcessCaptureOutput> {
    // --- 1. Read the image ------------------------------------------------
    let imageData: CapturedImageData;
    try {
      imageData = await this.imageReader.read(input.imageUri);
    } catch (error) {
      throw new CapturePipelineError(
        'IMAGE_READ_FAILED',
        'The captured image could not be read. Please retake or re-select it.',
        { cause: error },
      );
    }

    if (imageData.sizeBytes > MAX_IMAGE_FILE_SIZE_BYTES) {
      throw new CapturePipelineError(
        'IMAGE_TOO_LARGE',
        `The image is too large (${Math.round(imageData.sizeBytes / 1024)} KB). ` +
          `The maximum supported size is ${Math.round(MAX_IMAGE_FILE_SIZE_BYTES / 1024)} KB.`,
      );
    }

    // --- 2. Canonical hash for duplicate detection ------------------------
    let imageHash: string;
    try {
      imageHash = await this.hasher.hashImageBase64(imageData.base64);
    } catch (error) {
      throw new CapturePipelineError('DUPLICATE_CHECK_FAILED', 'Failed to fingerprint the image.', {
        cause: error,
      });
    }

    const existing = await this.captureSources.findByImageHash(imageHash);
    if (existing !== null) {
      const guard = await this.evaluateExistingCapture(existing);
      if (guard.outcome === 'already_processing' || guard.outcome === 'duplicate') {
        return {
          outcome: guard.outcome,
          captureSourceId: existing.id,
          ...(guard.draftId !== undefined ? { draftId: guard.draftId } : {}),
          ...(guard.outcome === 'duplicate' ? { duplicateOf: existing.id } : {}),
          isDuplicateImage: true,
        };
      }
      // else: prior capture is dead (failed/cancelled) or its draft reached
      // a terminal state — re-scanning the same image is a legitimate new
      // capture. Fall through and create a new capture source.
    }

    // --- 3. Persist capture source + draft BEFORE processing --------------
    const now = input.now ?? nowDateTime();
    const captureSourceId = asCaptureSourceId(ProcessCaptureUseCase.generateId('capture'));
    const captureSource = createCaptureSource({
      id: captureSourceId,
      sourceType: input.sourceType,
      imageUri: input.imageUri,
      imageHash,
      ...(imageData.mimeType !== undefined ? { mimeType: imageData.mimeType } : {}),
      fileSizeBytes: imageData.sizeBytes,
      capturedBy: input.userId,
      now,
    });
    // The pipeline moves the source to `processing` immediately — recovery
    // resets stuck `processing` sources on next boot.
    const processingSource = updateProcessingStatus(captureSource, 'processing', undefined, now);
    await this.captureSources.save(processingSource);

    const draftId = asExpenseDraftId(ProcessCaptureUseCase.generateId('draft'));
    const draft = createExpenseDraft({
      id: draftId,
      ...(input.groupId !== undefined ? { groupId: input.groupId as never } : {}),
      source: draftSourceFor(input.sourceType),
      captureSourceId,
      createdBy: input.userId,
      now,
    });
    const processingDraft = startProcessing(draft, { expectedVersion: draft.version, now });
    await this.drafts.save(processingDraft);

    // --- 4. Run the processor ---------------------------------------------
    let extraction: ExtractionResult;
    try {
      extraction = await this.processor.process(
        {
          captureSourceId,
          imageUri: input.imageUri,
          sourceType: input.sourceType,
        },
        input.signal !== undefined ? { signal: input.signal } : undefined,
      );
    } catch (error) {
      const cancelled = isAbortError(error) || input.signal?.aborted === true;
      await this.finalizeInterruptedCapture(captureSourceId, draftId, cancelled, error);
      if (cancelled) {
        return { outcome: 'cancelled', captureSourceId, isDuplicateImage: existing !== null };
      }
      throw new CapturePipelineError(
        isOcrNotConfigured(error) ? 'OCR_UNAVAILABLE' : 'OCR_FAILED',
        describeOcrError(error),
        { cause: error },
      );
    }

    // --- 5. Persist extraction + updated draft -----------------------------
    try {
      const extractionId = asExtractionResultId(ProcessCaptureUseCase.generateId('extraction'));
      const savedExtraction = createExtractionResult({
        id: extractionId,
        captureSourceId,
        merchant: extraction.merchant,
        date: extraction.date,
        currencyCode: extraction.currencyCode,
        subtotal: extraction.subtotal,
        tax: extraction.tax,
        ...(extraction.tip !== undefined ? { tip: extraction.tip } : {}),
        total: extraction.total,
        lineItems: extraction.lineItems,
        overallConfidence: extraction.overallConfidence,
        totalMatches: extraction.totalMatches,
        ...(extraction.rawText !== undefined ? { rawText: extraction.rawText } : {}),
      });
      await this.extractionResults.save(savedExtraction);

      const reviewedDraft = buildReviewedDraft(processingDraft, savedExtraction, now);
      await this.drafts.save(reviewedDraft);
      await this.captureSources.updateProcessingStatus(captureSourceId, 'completed');

      return {
        outcome: 'completed',
        draftId,
        captureSourceId,
        isDuplicateImage: existing !== null,
      };
    } catch (error) {
      // Extraction succeeded but persistence failed — treat the whole run
      // as failed so the user can retry cleanly.
      await this.finalizeInterruptedCapture(captureSourceId, draftId, false, error);
      throw new CapturePipelineError('PERSISTENCE_FAILED', 'Failed to save the scan results.', {
        cause: error,
      });
    }
  }

  /**
   * Duplicate-policy evaluation for a capture with the same image hash.
   * Returns the short-circuit outcome, or `{ outcome: 'rescan_allowed' }`.
   */
  private async evaluateExistingCapture(
    existing: CaptureSource,
  ): Promise<
    | { outcome: 'already_processing' | 'duplicate'; draftId?: ExpenseDraftId }
    | { outcome: 'rescan_allowed' }
  > {
    const status = existing.processingStatus;
    if (status === 'pending' || status === 'processing') {
      // A run is (or may be) in flight for this exact image.
      const inFlight = await this.findReviewableDraft(existing.id);
      return {
        outcome: 'already_processing',
        ...(inFlight !== null ? { draftId: inFlight.id } : {}),
      };
    }
    if (status === 'completed') {
      const reviewable = await this.findReviewableDraft(existing.id);
      if (reviewable !== null) {
        return { outcome: 'duplicate', draftId: reviewable.id };
      }
      // Draft confirmed or discarded — the user is deliberately re-scanning.
    }
    // failed / cancelled → re-scan allowed.
    return { outcome: 'rescan_allowed' };
  }

  /** Latest non-terminal draft linked to the capture source, or null. */
  private async findReviewableDraft(
    captureSourceId: CaptureSourceId,
  ): Promise<ExpenseDraft | null> {
    const drafts = await this.drafts.listByCaptureSource(captureSourceId);
    for (const draft of drafts) {
      if (draft.status === 'needs_review' || draft.status === 'ready') {
        return draft;
      }
    }
    return null;
  }

  /**
   * Failure / cancellation cleanup: mark the capture source, discard the
   * pipeline draft (a draft with no extraction data has nothing to review;
   * "Add manually" covers manual entry). Best-effort — cleanup errors do
   * not mask the original failure.
   */
  private async finalizeInterruptedCapture(
    captureSourceId: CaptureSourceId,
    draftId: ExpenseDraftId,
    cancelled: boolean,
    cause: unknown,
  ): Promise<void> {
    const status: CaptureProcessingStatus = cancelled ? 'cancelled' : 'failed';
    const message = cause instanceof Error ? cause.message : String(cause);
    try {
      await this.captureSources.updateProcessingStatus(captureSourceId, status, message.slice(0, 500));
      const draft = await this.drafts.findById(draftId);
      if (draft !== null && draft.status !== 'confirmed' && draft.status !== 'discarded') {
        await this.drafts.save(discardExpenseDraft(draft, undefined, draft.version));
      }
    } catch {
      // Recovery-on-boot covers the residue; never mask the primary error.
    }
  }

  /** Stable id generator with semantic prefixes (crypto UUID when available). */
  private static generateId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// ---------------------------------------------------------------------------
// Pure mapping helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Map a CaptureSourceType to the draft's DraftSource. */
export function draftSourceFor(
  sourceType: CaptureSourceType,
): 'receipt' | 'payment_screenshot' | 'invoice' {
  switch (sourceType) {
    case 'upi_screenshot':
    case 'card_screenshot':
    case 'bank_screenshot':
      return 'payment_screenshot';
    case 'digital_invoice':
      return 'invoice';
    default:
      return 'receipt';
  }
}

/**
 * Build the `needs_review`/`ready` draft from the pipeline draft plus the
 * saved extraction result. Pure — exported for unit tests.
 */
export function buildReviewedDraft(
  pipelineDraft: ExpenseDraft,
  extraction: ExtractionResult,
  now: DateTime,
): ExpenseDraft {
  const issues: FieldReviewIssue[] = [];

  // --- Field mapping -------------------------------------------------------
  const amountMinor =
    extraction.total.value !== undefined ? extraction.total.value : extraction.subtotal.value;

  if (amountMinor === undefined) {
    issues.push(
      createFieldReviewIssue({
        id: asFieldReviewIssueId('issue-total-missing'),
        issueType: 'missing_field',
        severity: 'error',
        fieldName: 'amountMinor',
        message: 'No total amount was detected — please enter the amount manually.',
      }),
    );
  }

  if (!extraction.totalMatches) {
    issues.push(
      createFieldReviewIssue({
        id: asFieldReviewIssueId('issue-total-mismatch'),
        issueType: 'total_mismatch',
        severity: 'error',
        fieldName: 'amountMinor',
        message:
          'The detected total does not match the line items plus tax and tip. Please verify the amount.',
      }),
    );
  }

  if (extraction.merchant.value === undefined) {
    issues.push(
      createFieldReviewIssue({
        id: asFieldReviewIssueId('issue-merchant-missing'),
        issueType: 'missing_field',
        severity: 'warning',
        fieldName: 'merchantName',
        message: 'No merchant name was detected — please enter it.',
      }),
    );
  }

  const overall = extraction.overallConfidence as number;
  if (overall < DRAFT_REVIEW_CONFIDENCE_THRESHOLD) {
    issues.push(
      createFieldReviewIssue({
        id: asFieldReviewIssueId('issue-low-confidence'),
        issueType: 'low_confidence',
        severity: 'warning',
        fieldName: 'overallConfidence',
        message:
          'Extraction confidence is low. Please double-check every field before confirming.',
      }),
    );
  }

  const dateValue = extraction.date.value;
  if (dateValue !== undefined && isDateInFuture(dateValue, now)) {
    issues.push(
      createFieldReviewIssue({
        id: asFieldReviewIssueId('issue-date-future'),
        issueType: 'date_in_future',
        severity: 'warning',
        fieldName: 'expenseDate',
        message: 'The detected date is in the future — please verify it.',
        suggestedValue: String(now).slice(0, 10),
      }),
    );
  }

  // --- Line items + charges ------------------------------------------------
  const lineItems = extraction.lineItems.map((item, index) =>
    createDraftLineItem({
      id: asDraftLineItemId(item.id || `line-${index}`),
      name: item.name.value ?? `Item ${index + 1}`,
      quantity: item.quantity.value ?? 1,
      unitPriceMinor: item.unitPriceMinor.value ?? 0,
      ...(item.discountMinor?.value !== undefined
        ? { discountMinor: item.discountMinor.value }
        : {}),
      ...(item.taxMinor?.value !== undefined ? { taxMinor: item.taxMinor.value } : {}),
      ...(item.name.confidence !== undefined
        ? { confidence: item.name.confidence as number }
        : {}),
      needsReview:
        item.name.needsReview ||
        item.totalAmountMinor.needsReview ||
        (item.totalAmountMinor.value ?? 0) !==
          (item.unitPriceMinor.value ?? 0) * (item.quantity.value ?? 1),
    }),
  );

  const charges = buildDraftCharges(extraction);

  const hasBlockingIssues = issues.some((issue) => issue.severity === 'error');
  const completed = completeProcessing(pipelineDraft, {
    expectedVersion: pipelineDraft.version,
    now,
  });

  return {
    ...completed,
    // Link the persisted extraction (immutable evidence) to the draft.
    extractionResultId: extraction.id as string,
    // Draft-level fields from the extraction. EVERY value here is an
    // unverified suggestion — confidence flags + issues drive review.
    ...(extraction.merchant.value !== undefined
      ? { merchantName: extraction.merchant.value }
      : {}),
    ...(dateValue !== undefined ? { expenseDate: dateValue } : {}),
    ...(extraction.currencyCode.value !== undefined
      ? { currencyCode: extraction.currencyCode.value as never }
      : {}),
    ...(amountMinor !== undefined ? { amountMinor } : {}),
    title: buildDraftTitle(extraction),
    lineItems,
    charges,
    unresolvedIssues: issues,
    // `ready` only when there are no blocking issues at all; otherwise
    // `needs_review` (the review screen gates confirm on errors).
    status: hasBlockingIssues ? 'needs_review' : 'ready',
  };
}

/** Tax (+tip) become DraftCharges; discounts/rounding are future work. */
function buildDraftCharges(extraction: ExtractionResult): ReturnType<typeof createDraftCharge>[] {
  const charges: ReturnType<typeof createDraftCharge>[] = [];
  if (extraction.tax.value !== undefined && extraction.tax.value !== 0) {
    charges.push(
      createDraftCharge({
        id: asDraftChargeId('charge-tax'),
        type: 'tax',
        amountMinor: extraction.tax.value,
        label: 'Tax',
        ...(extraction.tax.confidence !== undefined
          ? { confidence: extraction.tax.confidence as number }
          : {}),
        needsReview: extraction.tax.needsReview,
      }),
    );
  }
  const tip = extraction.tip?.value;
  if (tip !== undefined && tip !== 0) {
    charges.push(
      createDraftCharge({
        id: asDraftChargeId('charge-tip'),
        type: 'tip',
        amountMinor: tip,
        label: 'Tip',
        ...(extraction.tip?.confidence !== undefined
          ? { confidence: extraction.tip?.confidence as number }
          : {}),
        needsReview: extraction.tip?.needsReview ?? false,
      }),
    );
  }
  return charges;
}

function buildDraftTitle(extraction: ExtractionResult): string {
  if (extraction.merchant.value !== undefined && extraction.merchant.value.trim().length > 0) {
    return extraction.merchant.value.trim();
  }
  return extraction.lineItems.length > 0 ? 'Scanned receipt' : 'Scanned payment';
}

function isDateInFuture(isoDate: string, now: DateTime): boolean {
  const parsed = new Date(`${isoDate}T23:59:59.999Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() > Date.parse(String(now));
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && /abort/i.test(error.name)) ||
    (error instanceof Error && /aborted|cancel/i.test(error.message))
  );
}

/**
 * Detect the typed "no OCR provider configured" failure WITHOUT importing
 * infrastructure (architecture boundary). The unavailable adapter sets
 * `code: 'NOT_CONFIGURED'` on the thrown error; duck-typing keeps the
 * application layer clean while still distinguishing a deployment gap
 * (nothing to retry) from a runtime OCR failure (retry makes sense).
 */
export function isOcrNotConfigured(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === 'NOT_CONFIGURED'
  );
}

function describeOcrError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'Receipt scanning failed. Please retry or add the expense manually.';
}
