/**
 * Repository port for OCR improvement consent + correction data.
 *
 * Implementations MUST persist consent records per profile, and aggregate
 * correction diffs (anonymized) per receipt.
 */

import type {
  OcrImprovementConsent,
} from '@domain/ocr-improvement';
import type { FieldLevelDiff } from '@domain/ocr-improvement';

// ---------------------------------------------------------------------------
// Consent repository
// ---------------------------------------------------------------------------

export interface OcrConsentRepository {
  /** Persist the current consent record for a profile. */
  saveConsent(consent: OcrImprovementConsent): Promise<void>;

  /** Load the current consent record for a profile, or null if none. */
  findConsentByProfileId(profileId: string): Promise<OcrImprovementConsent | null>;
}

// ---------------------------------------------------------------------------
// Correction diff repository (aggregated, anonymous)
// ---------------------------------------------------------------------------

export interface ReceiptCorrectionRecord {
  /** Anonymous receipt ID (NOT a user ID). */
  readonly receiptId: string;
  /** Anonymous profile ID (hashed, NOT the raw profile ID). */
  readonly anonymousProfileId: string;
  /** ISO date-time when the correction was made. */
  readonly correctedAt: string;
  /** Field-level diffs for this receipt (anonymized). */
  readonly diffs: readonly FieldLevelDiff[];
}

export interface OcrCorrectionRepository {
  /** Persist a single receipt correction record. Idempotent by `receiptId`. */
  saveCorrection(record: ReceiptCorrectionRecord): Promise<void>;

  /** Return all corrections in the given time window. */
  findCorrectionsInWindow(
    fromIso: string,
    toIso: string,
  ): Promise<readonly ReceiptCorrectionRecord[]>;

  /** Return all corrections for a given anonymous profile ID. */
  findCorrectionsByAnonymousProfile(
    anonymousProfileId: string,
  ): Promise<readonly ReceiptCorrectionRecord[]>;
}
