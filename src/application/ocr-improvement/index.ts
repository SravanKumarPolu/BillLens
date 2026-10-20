/**
 * Barrel for the OCR improvement application module.
 */

export {
  AggregateCorrectionStatsUseCase,
  type AggregateCorrectionStatsInput,
  type AggregateCorrectionStatsOutput,
} from './aggregate-correction-stats.usecase';

export {
  type OcrConsentRepository,
  type OcrCorrectionRepository,
  type ReceiptCorrectionRecord,
} from './ocr-improvement-repository.port';
