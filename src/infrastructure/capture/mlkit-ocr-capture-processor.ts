/**
 * On-device OCR via Google ML Kit Text Recognition.
 *
 * Free, offline, no account, no API key. Requires a custom Expo development
 * build (the native module is not in Expo Go). The module is imported lazily so
 * the main JS bundle and startup are unaffected.
 *
 * ML Kit returns text only; `parseReceiptText` performs conservative field
 * extraction. Uncertain values keep low confidence and warnings, and the draft
 * review screen still requires explicit user confirmation.
 */

import type {
  CaptureProcessOptions,
  CaptureProcessor,
  CaptureProcessorInput,
} from '@domain/ports/capture-processor.port';
import {
  asExtractionResultId,
  createExtractionResult,
  type ExtractionResult,
} from '@domain/entities';
import { parseReceiptText } from '@domain/services/ocr/receipt-text-parser';
import {
  asExtractionConfidence,
  createExtractedField,
  nowDateTime,
} from '@domain/value-objects';

const OCR_CONFIDENCE = asExtractionConfidence(0.7);

type Recognizer = (uri: string) => Promise<{ readonly text: string }>;

async function loadRecognizer(): Promise<Recognizer> {
  const module = await import('@react-native-ml-kit/text-recognition');
  const recognize = module.default.recognize;
  if (typeof recognize !== 'function') {
    throw new Error(
      'On-device OCR is not available in this build. Use a custom development build or enter the expense manually.',
    );
  }
  return recognize;
}

export class MlKitOcrCaptureProcessor implements CaptureProcessor {
  constructor(private readonly recognizerLoader: () => Promise<Recognizer> = loadRecognizer) {}

  async process(
    input: CaptureProcessorInput,
    options?: CaptureProcessOptions,
  ): Promise<ExtractionResult> {
    const isAborted = (): boolean => options?.signal?.aborted === true;
    if (isAborted()) throw new Error('Receipt scanning was cancelled.');

    // Lazy native import: keeps ML Kit out of startup and web bundles.
    const recognize = await this.recognizerLoader();

    let result: Awaited<ReturnType<typeof recognize>>;
    try {
      result = await recognize(input.imageUri);
    } catch {
      // One bounded retry covers transient native initialisation failures.
      if (isAborted()) throw new Error('Receipt scanning was cancelled.');
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        result = await recognize(input.imageUri);
      } catch {
        throw new Error(
          'On-device OCR could not read this image. Check that the ML Kit native module is included in this build, or enter the expense manually.',
        );
      }
    }
    if (isAborted()) throw new Error('Receipt scanning was cancelled.');
    const text = typeof result.text === 'string' ? result.text : '';
    const parsed = parseReceiptText(text);
    if (parsed.totalMinor === undefined && parsed.lineItems.length === 0) {
      throw new Error('No receipt text could be recognised. Try a clearer photo.');
    }

    const field = <T,>(value: T | undefined) =>
      createExtractedField<T>(value, OCR_CONFIDENCE, {
        ...(value !== undefined ? { sourceText: String(value) } : {}),
      });

    return createExtractionResult({
      id: asExtractionResultId(`mlkit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      captureSourceId: input.captureSourceId,
      merchant: field(parsed.merchant),
      date: field(parsed.date),
      currencyCode: field(parsed.currencyCode),
      subtotal: field(parsed.subtotalMinor),
      tax: field(parsed.taxMinor ?? 0),
      total: field(parsed.totalMinor),
      lineItems: parsed.lineItems.map((item, index) => ({
        id: `mlkit-item-${index}`,
        name: field(item.name),
        quantity: field(item.quantity),
        unitPriceMinor: field(item.unitPriceMinor),
        totalAmountMinor: field(item.totalAmountMinor),
      })),
      overallConfidence: OCR_CONFIDENCE,
      totalMatches: parsed.totalMatches,
      rawText: text,
      now: nowDateTime(),
    });
  }
}
