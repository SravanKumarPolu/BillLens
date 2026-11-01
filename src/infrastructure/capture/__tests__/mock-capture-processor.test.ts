/**
 * MockCaptureProcessor unit tests.
 *
 * Verifies that the mock:
 *   1. Returns the high-confidence receipt for paper-receipt sources.
 *   2. Returns the payment-screenshot mock for UPI-screenshot sources.
 *   3. Returns ExtractionResults whose fields are properly wrapped in
 *      ExtractedField<T> (value / confidence / needsReview).
 *   4. Returns confidence values that are always in the closed
 *      interval [0, 1].
 *
 * The 1.5s simulated OCR delay is bypassed with jest fake timers so the
 * tests run fast.
 */

import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

import { asCaptureSourceId } from '@domain/entities';
import type { CaptureProcessorInput } from '@domain/ports/capture-processor.port';

import {
  MockCaptureProcessor,
  MOCK_EXTRACTIONS,
  isExtractedField,
  isExtractedLineItem,
} from '../mock-capture-processor';

const CAPTURE_ID = asCaptureSourceId('capture-test-001');

function makeInput(
  sourceType: CaptureProcessorInput['sourceType'],
): CaptureProcessorInput {
  return {
    captureSourceId: CAPTURE_ID,
    imageUri: 'file://mock-image.jpg',
    sourceType,
  };
}

describe('MockCaptureProcessor', () => {
  let processor: MockCaptureProcessor;

  beforeEach(() => {
    processor = new MockCaptureProcessor();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function flushMockDelay<T>(promise: Promise<T>): Promise<T> {
    // The mock waits MOCK_PROCESSING_DELAY_MS (1500ms). Advance fake
    // timers past that and let the pending microtasks flush.
    let pending = true;
    const fork = promise.finally(() => {
      pending = false;
    });
    while (pending) {
      jest.advanceTimersByTime(2000);
      // Yield to the microtask queue so the promise's `.then` runs.
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
    return fork;
  }

  describe('process — paper_receipt', () => {
    it('returns the high-confidence receipt for paper_receipt', async () => {
      const result = await flushMockDelay(processor.process(makeInput('paper_receipt')));

      expect(result.id).toBe(MOCK_EXTRACTIONS.highConfidenceReceipt.id);
      // captureSourceId is replaced with the caller's actual id.
      expect(result.captureSourceId).toBe(CAPTURE_ID);
      expect(result.merchant.value).toBe('Paradise Biryani');
      expect(result.lineItems.length).toBe(2);
      expect(result.totalMatches).toBe(true);
    });

    it('returns the high-confidence receipt for gallery_image', async () => {
      const result = await flushMockDelay(processor.process(makeInput('gallery_image')));
      expect(result.id).toBe(MOCK_EXTRACTIONS.highConfidenceReceipt.id);
    });

    it('returns the high-confidence receipt for digital_invoice', async () => {
      const result = await flushMockDelay(processor.process(makeInput('digital_invoice')));
      expect(result.id).toBe(MOCK_EXTRACTIONS.highConfidenceReceipt.id);
    });

    it('returns the high-confidence receipt for shared_image', async () => {
      const result = await flushMockDelay(processor.process(makeInput('shared_image')));
      expect(result.id).toBe(MOCK_EXTRACTIONS.highConfidenceReceipt.id);
    });
  });

  describe('process — payment screenshots', () => {
    it('returns the payment screenshot for upi_screenshot', async () => {
      const result = await flushMockDelay(processor.process(makeInput('upi_screenshot')));

      expect(result.id).toBe(MOCK_EXTRACTIONS.paymentScreenshot.id);
      expect(result.captureSourceId).toBe(CAPTURE_ID);
      // Payment screenshots have no line items.
      expect(result.lineItems).toEqual([]);
      expect(result.merchant.value).toBe('UPI Payment');
      expect(result.total.value).toBe(1000);
    });

    it('returns the payment screenshot for card_screenshot', async () => {
      const result = await flushMockDelay(processor.process(makeInput('card_screenshot')));
      expect(result.id).toBe(MOCK_EXTRACTIONS.paymentScreenshot.id);
    });

    it('returns the payment screenshot for bank_screenshot', async () => {
      const result = await flushMockDelay(processor.process(makeInput('bank_screenshot')));
      expect(result.id).toBe(MOCK_EXTRACTIONS.paymentScreenshot.id);
    });
  });

  describe('process — result structure', () => {
    it('wraps every top-level field in an ExtractedField<T>', async () => {
      const result = await flushMockDelay(processor.process(makeInput('paper_receipt')));

      expect(isExtractedField(result.merchant)).toBe(true);
      expect(isExtractedField(result.date)).toBe(true);
      expect(isExtractedField(result.currencyCode)).toBe(true);
      expect(isExtractedField(result.subtotal)).toBe(true);
      expect(isExtractedField(result.tax)).toBe(true);
      expect(isExtractedField(result.total)).toBe(true);
    });

    it('wraps every line-item field in an ExtractedField<T>', async () => {
      const result = await flushMockDelay(processor.process(makeInput('paper_receipt')));

      expect(result.lineItems.length).toBeGreaterThan(0);
      for (const item of result.lineItems) {
        expect(isExtractedLineItem(item)).toBe(true);
        // Each line item also has a stable string id.
        expect(typeof item.id).toBe('string');
      }
    });

    it('populates needsReview based on the 0.85 high-confidence threshold', async () => {
      const result = await flushMockDelay(processor.process(makeInput('paper_receipt')));

      // merchant confidence = 0.95 → needsReview = false
      expect(result.merchant.confidence).toBe(0.95);
      expect(result.merchant.needsReview).toBe(false);

      // The Coke item name confidence = 0.75 → needsReview = true
      const coke = result.lineItems.find((i) => i.id === 'item-002');
      expect(coke).toBeDefined();
      expect(coke?.name.confidence).toBe(0.75);
      expect(coke?.name.needsReview).toBe(true);
    });
  });

  describe('process — confidence range', () => {
    it('returns per-field confidence values in [0, 1] for the high-confidence receipt', async () => {
      const result = await flushMockDelay(processor.process(makeInput('paper_receipt')));

      const confidences = [
        result.merchant.confidence,
        result.date.confidence,
        result.currencyCode.confidence,
        result.subtotal.confidence,
        result.tax.confidence,
        result.total.confidence,
        result.overallConfidence as number,
        ...result.lineItems.flatMap((i) => [
          i.name.confidence,
          i.quantity.confidence,
          i.unitPriceMinor.confidence,
          i.totalAmountMinor.confidence,
        ]),
      ];

      for (const c of confidences) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    });

    it('returns per-field confidence values in [0, 1] for the payment screenshot', async () => {
      const result = await flushMockDelay(processor.process(makeInput('upi_screenshot')));

      const confidences = [
        result.merchant.confidence,
        result.date.confidence,
        result.currencyCode.confidence,
        result.subtotal.confidence,
        result.tax.confidence,
        result.total.confidence,
        result.overallConfidence as number,
      ];

      for (const c of confidences) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('processLowConfidence — test-only entry point', () => {
    it('returns the low-confidence receipt mock', async () => {
      const result = await flushMockDelay(
        processor.processLowConfidence(makeInput('paper_receipt')),
      );

      expect(result.id).toBe(MOCK_EXTRACTIONS.lowConfidenceReceipt.id);
      expect(result.captureSourceId).toBe(CAPTURE_ID);
      // Low-confidence receipt has no line items.
      expect(result.lineItems).toEqual([]);
      // Overall confidence is in the "low" bucket (< 0.30).
      expect(result.overallConfidence as number).toBeLessThan(0.3);
      // The total field has a value, but merchant / date / subtotal / tax
      // are missing — exactly the "blurry receipt" shape we want to test.
      expect(result.merchant.value).toBeUndefined();
      expect(result.date.value).toBeUndefined();
      expect(result.subtotal.value).toBeUndefined();
      expect(result.tax.value).toBeUndefined();
      expect(result.total.value).toBe(500);
      expect(result.totalMatches).toBe(false);
    });

    it('returns confidence values in [0, 1] for the low-confidence receipt', async () => {
      const result = await flushMockDelay(
        processor.processLowConfidence(makeInput('paper_receipt')),
      );

      const confidences = [
        result.merchant.confidence,
        result.date.confidence,
        result.currencyCode.confidence,
        result.subtotal.confidence,
        result.tax.confidence,
        result.total.confidence,
        result.overallConfidence as number,
      ];

      for (const c of confidences) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    });
  });
});
