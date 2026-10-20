import { InvalidEntityError } from '@domain/errors';
import type { QrEncoderPort } from '@domain/services/upi/upi-qr-generator';
import {
  generateUpiQr,
} from '@domain/services/upi/upi-qr-generator';

/**
 * Use case: Generate a UPI QR code from a deep-link URI.
 *
 * Phase 6 Track 4 — thin wrapper around the domain `generateUpiQr`
 * function. Takes a pre-built `upi://` URI and a `QrEncoderPort`,
 * returns a data URL suitable for display via `<Image>` (React
 * Native) or `<img>` (web).
 *
 * ── Spec rule (Prompt 56) ──
 *
 *   "Generate QR codes containing only the required UPI payment URI.
 *    Do not embed: group expense history, member balances, receipt
 *    data, private notes, access tokens."
 *
 * The use case ENFORCES this by construction: the only input is the
 * `upi://` URI. There is no API to add metadata to the QR code.
 *
 * The use case does NOT mutate any settlement, does NOT record
 * payment success, does NOT record any state. It is purely a UI
 * helper.
 */
export class GenerateUpiQrUseCase {
  constructor(private readonly encoder: QrEncoderPort) {}

  async execute(input: GenerateUpiQrInput): Promise<GenerateUpiQrOutput> {
    if (!input.upiUri || !input.upiUri.startsWith('upi://')) {
      throw new InvalidEntityError(
        'GenerateUpiQr: upiUri must be a non-empty "upi://" URI',
      );
    }
    const result = await generateUpiQr({
      upiUri: input.upiUri,
      encoder: this.encoder,
      ...(input.sizePixels !== undefined ? { sizePixels: input.sizePixels } : {}),
    });
    return result;
  }
}

export interface GenerateUpiQrInput {
  /** The pre-built `upi://` URI (from `GenerateUpiDeepLinkUseCase`). */
  readonly upiUri: string;
  /** Optional pixel size for the QR image (default 256). */
  readonly sizePixels?: number;
}

export interface GenerateUpiQrOutput {
  readonly qrDataUrl: string;
  readonly encodedContent: string;
  readonly sizePixels: number;
}
