/**
 * Capture module barrel.
 *
 * Aggregates capture-intelligence-related code from across layers:
 * - Domain ports (CaptureProcessor interface)
 * - Domain entities (CaptureSource, ExtractionResult, PaymentEvidence)
 * - Domain value objects (ExtractionConfidence, ExtractedField)
 *
 * Infrastructure implementations (OCR providers, image processing) will
 * live in src/services/capture-intelligence/ and implement the
 * CaptureProcessor port declared in the domain.
 *
 * ARCHITECTURE RULE: Capture services return ExtractionResult ONLY.
 * They do NOT create Expense, ExpenseDraft, or any financial record.
 */

// Domain port — provider-agnostic OCR interface
export type { CaptureProcessor, CaptureProcessorInput } from '@domain/ports/capture-processor.port';

// Domain entities — capture pipeline data models
export type {
  CaptureSource,
  CaptureSourceType,
  CaptureProcessingStatus,
} from '@domain/entities/capture-source';

export type {
  ExtractionResult,
  ExtractedLineItem,
} from '@domain/entities/extraction-result';

export type {
  PaymentEvidence,
  PaymentEvidenceSourceType,
  PaymentStatus,
} from '@domain/entities/payment-evidence';

// Branded ID types from shared-types
export type {
  CaptureSourceId,
  ExtractionResultId,
  PaymentEvidenceId,
} from '@shared-types/index';

// Domain value objects — confidence and extracted fields
export type { ExtractionConfidence, ConfidenceLevel } from '@domain/value-objects/extraction-confidence';
export type { ExtractedField, BoundingBox } from '@domain/value-objects/extracted-field';

// Domain entity factories
export {
  asCaptureSourceId,
  createCaptureSource,
  updateProcessingStatus,
} from '@domain/entities/capture-source';

export {
  asExtractionResultId,
  createExtractionResult,
} from '@domain/entities/extraction-result';

export {
  asPaymentEvidenceId,
  createPaymentEvidence,
} from '@domain/entities/payment-evidence';

// Value object factories
export {
  asExtractionConfidence,
  confidenceLevel,
  needsReview,
  HIGH_CONFIDENCE_THRESHOLD,
  MEDIUM_CONFIDENCE_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD,
} from '@domain/value-objects/extraction-confidence';

export { createExtractedField, hasValue } from '@domain/value-objects/extracted-field';
