import {
  asCaptureSourceId,
  asExtractionResultId,
  type ExtractionResult,
  type ExtractedLineItem,
} from '@domain/entities';
import type {
  CaptureProcessor,
  CaptureProcessorInput,
} from '@domain/ports/capture-processor.port';
import {
  asExtractionConfidence,
  createExtractedField,
  nowDateTime,
} from '@domain/value-objects';
import type { ExtractedField } from '@domain/value-objects/extracted-field';

/**
 * Mock CaptureProcessor for Phase 2 development.
 *
 * Returns predefined ExtractionResult test cases based on the capture
 * source type. This allows the UI pipeline (capture → processing → draft
 * review) to be tested end-to-end without a real OCR engine.
 *
 * IMPORTANT: This is a DEVELOPMENT-ONLY implementation. The real
 * CaptureProcessor (using Google ML Kit OCR) will be implemented in
 * Phase 3.
 *
 * This mock is injected via dependency injection — UI components never
 * hard-code fake data. They call the CaptureProcessor interface, which
 * resolves to this mock in development and the real implementation in
 * production.
 *
 * Test cases provided:
 *   1. `MOCK_RECEIPT_HIGH_CONFIDENCE` — a paper-receipt extraction with
 *      high per-field confidence. Two line items. Totals match. Used for
 *      the default happy-path capture flow.
 *   2. `MOCK_RECEIPT_LOW_CONFIDENCE` — a blurry-receipt extraction where
 *      most fields are missing and total confidence is in the "low"
 *      bucket. Used to exercise the "needs review" review state.
 *   3. `MOCK_PAYMENT_SCREENSHOT` — a UPI / card / bank payment screenshot
 *      extraction. No line items (payment screenshots have no item-level
 *      detail). Used for the payment-evidence capture flow.
 */

// Predefined test case 1 — high-confidence paper receipt.
const MOCK_RECEIPT_HIGH_CONFIDENCE: ExtractionResult = {
  id: asExtractionResultId('mock-extraction-001'),
  captureSourceId: asCaptureSourceId('mock-capture-001'),
  merchant: createExtractedField('Paradise Biryani', asExtractionConfidence(0.95), {
    sourceText: 'PARADISE BIRYANI',
  }),
  date: createExtractedField('2026-07-29', asExtractionConfidence(0.9), {
    sourceText: '29 Jul 2026',
  }),
  currencyCode: createExtractedField('INR', asExtractionConfidence(0.98), {
    sourceText: 'Rs',
  }),
  subtotal: createExtractedField(950, asExtractionConfidence(0.85), {
    sourceText: '950.00',
  }),
  tax: createExtractedField(50, asExtractionConfidence(0.8), {
    sourceText: 'GST 50.00',
  }),
  total: createExtractedField(1000, asExtractionConfidence(0.92), {
    sourceText: 'Total: 1000.00',
  }),
  lineItems: [
    {
      id: 'item-001',
      name: createExtractedField('Chicken Biryani', asExtractionConfidence(0.88), {
        sourceText: 'Chicken Biryani',
      }),
      quantity: createExtractedField(2, asExtractionConfidence(0.95), { sourceText: '2' }),
      unitPriceMinor: createExtractedField(350, asExtractionConfidence(0.85), {
        sourceText: '350.00',
      }),
      totalAmountMinor: createExtractedField(700, asExtractionConfidence(0.9), {
        sourceText: '700.00',
      }),
    },
    {
      id: 'item-002',
      name: createExtractedField('Coke', asExtractionConfidence(0.75), {
        sourceText: 'Coke',
      }),
      quantity: createExtractedField(1, asExtractionConfidence(0.95), { sourceText: '1' }),
      unitPriceMinor: createExtractedField(250, asExtractionConfidence(0.8), {
        sourceText: '250.00',
      }),
      totalAmountMinor: createExtractedField(250, asExtractionConfidence(0.85), {
        sourceText: '250.00',
      }),
    },
  ],
  overallConfidence: asExtractionConfidence(0.88),
  totalMatches: true,
  rawText:
    'PARADISE BIRYANI\n' +
    'Chicken Biryani 2 x 350.00 = 700.00\n' +
    'Coke 1 x 250.00 = 250.00\n' +
    'Subtotal: 950.00\n' +
    'GST: 50.00\n' +
    'Total: 1000.00',
  extractedAt: nowDateTime(),
  createdAt: nowDateTime(),
  version: 1,
};

// Predefined test case 2 — low-confidence / blurry receipt (most fields
// missing). Used to exercise the review-UI "needs review" state.
const MOCK_RECEIPT_LOW_CONFIDENCE: ExtractionResult = {
  id: asExtractionResultId('mock-extraction-002'),
  captureSourceId: asCaptureSourceId('mock-capture-002'),
  merchant: createExtractedField<string>(undefined, asExtractionConfidence(0.3)),
  date: createExtractedField<string>(undefined, asExtractionConfidence(0.2)),
  currencyCode: createExtractedField('INR', asExtractionConfidence(0.6), {
    sourceText: 'Rs',
  }),
  subtotal: createExtractedField<number>(undefined, asExtractionConfidence(0.15)),
  tax: createExtractedField<number>(undefined, asExtractionConfidence(0.1)),
  total: createExtractedField(500, asExtractionConfidence(0.45), {
    sourceText: '500',
  }),
  lineItems: [],
  overallConfidence: asExtractionConfidence(0.25),
  totalMatches: false,
  rawText: '...blurry text...',
  extractedAt: nowDateTime(),
  createdAt: nowDateTime(),
  version: 1,
};

// Predefined test case 3 — payment screenshot. No line items (payment
// screenshots are evidence of money changing hands, not an itemised bill).
const MOCK_PAYMENT_SCREENSHOT: ExtractionResult = {
  id: asExtractionResultId('mock-extraction-003'),
  captureSourceId: asCaptureSourceId('mock-capture-003'),
  merchant: createExtractedField('UPI Payment', asExtractionConfidence(0.9), {
    sourceText: 'UPI',
  }),
  date: createExtractedField('2026-07-29', asExtractionConfidence(0.85), {
    sourceText: '29 Jul 2026',
  }),
  currencyCode: createExtractedField('INR', asExtractionConfidence(0.95)),
  subtotal: createExtractedField(1000, asExtractionConfidence(0.88), {
    sourceText: '₹1000',
  }),
  tax: createExtractedField(0, asExtractionConfidence(1)),
  total: createExtractedField(1000, asExtractionConfidence(0.9), {
    sourceText: '₹1000',
  }),
  lineItems: [],
  overallConfidence: asExtractionConfidence(0.85),
  totalMatches: true,
  rawText: 'UPI Payment\nAmount: ₹1000\nDate: 29 Jul 2026\nStatus: Success',
  extractedAt: nowDateTime(),
  createdAt: nowDateTime(),
  version: 1,
};

/** Confidence value used as the simulated OCR processing delay (ms). */
const MOCK_PROCESSING_DELAY_MS = 1500;

/**
 * Mock CaptureProcessor — implements the domain CaptureProcessor port
 * using the predefined test cases above.
 *
 * The mock is intentionally non-deterministic about WHICH test case it
 * returns for receipt-like sources (it always returns the high-confidence
 * one in `process()`), but exposes a separate `processLowConfidence()`
 * method so tests can exercise the low-confidence review state without
 * probabilistic flakiness.
 */
export class MockCaptureProcessor implements CaptureProcessor {
  /**
   * Process a captured image and return the predefined extraction result.
   *
   * Adds a 1.5s simulated delay so the UI's processing state is visible
   * during end-to-end testing.
   *
   * Source-type routing:
   *   - upi_screenshot / card_screenshot / bank_screenshot → payment screenshot
   *   - paper_receipt / gallery_image / digital_invoice / shared_image → receipt
   */
  async process(input: CaptureProcessorInput): Promise<ExtractionResult> {
    // Simulate OCR processing latency.
    await delay(MOCK_PROCESSING_DELAY_MS);

    // Route by source type. Payment screenshots use a different mock so
    // the UI can exercise the payment-evidence flow; everything else
    // falls through to the receipt mock.
    switch (input.sourceType) {
      case 'upi_screenshot':
      case 'card_screenshot':
      case 'bank_screenshot':
        return withCaptureSource(MOCK_PAYMENT_SCREENSHOT, input.captureSourceId);
      case 'paper_receipt':
      case 'gallery_image':
      case 'digital_invoice':
      case 'shared_image':
      default:
        return withCaptureSource(MOCK_RECEIPT_HIGH_CONFIDENCE, input.captureSourceId);
    }
  }

  /**
   * Test-only: get a low-confidence result for testing the "needs review"
   * review state. Production callers MUST NOT use this — it exists so the
   * review UI can be exercised deterministically against a known-bad
   * extraction.
   */
  async processLowConfidence(input: CaptureProcessorInput): Promise<ExtractionResult> {
    await delay(MOCK_PROCESSING_DELAY_MS);
    return withCaptureSource(MOCK_RECEIPT_LOW_CONFIDENCE, input.captureSourceId);
  }
}

/**
 * Return a copy of `result` with its `captureSourceId` replaced by the
 * caller's actual CaptureSourceId. The predefined mocks all carry a
 * placeholder CaptureSourceId; this helper ensures the returned
 * ExtractionResult references the real capture so the application layer
 * can link them correctly.
 */
function withCaptureSource(
  result: ExtractionResult,
  captureSourceId: CaptureProcessorInput['captureSourceId'],
): ExtractionResult {
  return { ...result, captureSourceId };
}

/** Promise-based delay helper. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Test-only exports — exposed so the unit tests can assert against the
// predefined shapes directly without re-deriving them.
// ---------------------------------------------------------------------------

export const MOCK_EXTRACTIONS = {
  highConfidenceReceipt: MOCK_RECEIPT_HIGH_CONFIDENCE,
  lowConfidenceReceipt: MOCK_RECEIPT_LOW_CONFIDENCE,
  paymentScreenshot: MOCK_PAYMENT_SCREENSHOT,
} as const;

/** Type guard: is the value an ExtractedField-shaped object? */
export function isExtractedField<T>(
  value: unknown,
): value is ExtractedField<T> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.confidence === 'number' &&
    typeof record.needsReview === 'boolean'
  );
}

/** Type guard: is the value an ExtractedLineItem-shaped object? */
export function isExtractedLineItem(value: unknown): value is ExtractedLineItem {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    isExtractedField(record.name) &&
    isExtractedField(record.quantity) &&
    isExtractedField(record.unitPriceMinor) &&
    isExtractedField(record.totalAmountMinor)
  );
}
