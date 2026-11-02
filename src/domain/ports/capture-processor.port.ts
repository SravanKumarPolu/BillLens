import type { CaptureSourceId } from '@shared-types/index';

import type { CaptureSourceType } from '../entities/capture-source';
import type { ExtractionResult } from '../entities/extraction-result';

/**
 * Provider-agnostic capture-processing interface.
 *
 * The application layer calls this interface to process a captured image
 * (receipt, payment screenshot, etc.) and get an ExtractionResult.
 *
 * The infrastructure layer provides the concrete implementation. v2.4.0
 * ships two: the on-device `MockCaptureProcessor` (offline / development)
 * and the `RemoteOcrCaptureProcessor` (Supabase Edge Function proxy that
 * fronts a cloud OCR provider — credentials never enter the app).
 *
 * IMPORTANT: This interface returns an ExtractionResult ONLY — it does NOT
 * create an Expense, ExpenseDraft, or any financial record. The caller
 * (application use case) must create an ExpenseDraft from the ExtractionResult
 * and require user confirmation before creating a final Expense.
 */
export interface CaptureProcessor {
  /**
   * Process a captured image and return the extraction result.
   *
   * @param input.captureSourceId The ID of the CaptureSource to process.
   * @param input.imageUri Local file URI of the image.
   * @param input.sourceType The type of capture (paper_receipt, upi_screenshot, etc.).
   * @param options Optional processing controls (cancellation). Added
   *                additively in v2.4.0 — existing implementations may
   *                ignore it; adapters that support it abort promptly.
   * @returns The extraction result with confidence scores for each field.
   * @throws If processing fails (OCR error, invalid image, cancelled, etc.).
   */
  process(input: CaptureProcessorInput, options?: CaptureProcessOptions): Promise<ExtractionResult>;
}

/**
 * Input to {@link CaptureProcessor.process}.
 */
export interface CaptureProcessorInput {
  readonly captureSourceId: CaptureSourceId;
  readonly imageUri: string;
  readonly sourceType: CaptureSourceType;
}

/**
 * Optional controls for a capture-processing call (v2.4.0).
 */
export interface CaptureProcessOptions {
  /**
   * Abort signal — when the user cancels (or the screen unmounts), the
   * processor should stop work promptly. Implementations that cannot
   * abort the underlying work must still reject promptly with an
   * abort-shaped error and discard the result.
   */
  readonly signal?: AbortSignal;
}
