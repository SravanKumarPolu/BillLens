/**
 * UnavailableCaptureProcessor — the "no OCR provider configured" adapter
 * (v2.5.0).
 *
 * Replaces the previous silent fallback to `MockCaptureProcessor` in the
 * composition root. When OCR is not usable (no Supabase project / no Edge
 * Function in a production build, or mock refused in production), this
 * adapter is wired instead so that:
 *
 *   - No fabricated merchant names, totals, currencies or items can EVER
 *     reach the review UI — every call fails loudly and immediately.
 *   - The capture pipeline surfaces a typed `NOT_CONFIGURED` error that
 *     the ProcessingScreen maps to an explicit "Receipt scanning
 *     unavailable" state with manual expense entry as the fallback.
 *
 * This is fail-loud by design: an unconfigured provider is a deployment
 * problem, and silently degrading to sample data would hide it while
 * presenting fabricated financial values to real users.
 */

import type {
  CaptureProcessor,
  CaptureProcessorInput,
  CaptureProcessOptions,
} from '@domain/ports/capture-processor.port';

import { OcrCaptureError } from './remote-ocr-capture-processor';

export class UnavailableCaptureProcessor implements CaptureProcessor {
  async process(
    _input: CaptureProcessorInput,
    _processOptions?: CaptureProcessOptions,
  ): Promise<never> {
    throw new OcrCaptureError(
      'NOT_CONFIGURED',
      'Receipt scanning is not available in this build: no OCR provider is configured. ' +
        'Please add the expense manually.',
      { retriable: false },
    );
  }
}
