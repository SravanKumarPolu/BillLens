import { InvalidEntityError } from '../../errors/index';

/**
 * UPI QR-code generator — Phase 6 Track 4.
 *
 * Wraps the UPI deep-link URI for encoding as a QR code. The actual
 * QR encoding is delegated to a `QrEncoderPort` (defined here) so
 * the domain layer stays pure and the platform-specific QR library
 * (e.g. `qrcode` on Node, `expo-barcode-scanner` on React Native)
 * can be plugged in at the application layer.
 *
 * ── Spec rules (Prompt 56) ──
 *
 *   "Generate QR codes containing only the required UPI payment URI.
 *
 *    Do not embed:
 *      - Group expense history
 *      - Member balances
 *      - Receipt data
 *      - Private notes
 *      - Access tokens"
 *
 * This module ENFORCES that rule by construction: the only input
 * to the QR generator is the already-built `upi://` URI string.
 * There is no API to add metadata to the QR code. The QR encoder
 * port receives a single `content` string and produces a single
 * image — nothing else.
 *
 * ── Safety ──
 *
 * The QR code does NOT prove payment. Displaying the QR code does
 * not mutate any settlement. The return-to-app handler is what
 * records the settlement as `pending_confirmation` after the user
 * returns — and even that does NOT mark it as completed.
 */

// ---------------------------------------------------------------------------
// Port: QR encoder
// ---------------------------------------------------------------------------

/**
 * Platform-specific QR encoder port.
 *
 * The application layer provides a concrete implementation:
 *   - `NodeQrEncoderPort` (uses `qrcode` npm package, for CLI / server use)
 *   - `ExpoQrEncoderPort` (uses `expo-barcode-scanner`, for the RN app)
 *
 * Both must satisfy this interface. The domain layer never knows
 * which one is in play.
 */
export interface QrEncoderPort {
  /**
   * Encode `content` as a QR code and return a data URL (e.g.
   * `data:image/png;base64,...`) suitable for display via an
   * `<Image source={{ uri }}>` (React Native) or `<img src="">` (web).
   *
   * The implementation chooses the QR error-correction level. We
   * recommend level "M" (15% recovery) — sufficient for screen
   * display, not too dense.
   */
  encode(content: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface GenerateUpiQrInput {
  /**
   * The already-built UPI deep-link URI (output of
   * `buildUpiDeepLink`). Must start with `upi://`.
   */
  readonly upiUri: string;
  /**
   * Optional pixel size for the QR image. Defaults to 256 (sufficient
   * for screen display; the UPI URI is typically <100 chars so the
   * QR has plenty of redundancy).
   */
  readonly sizePixels?: number;
}

export interface GenerateUpiQrOutput {
  /** The QR image as a data URL (e.g. `data:image/png;base64,...`). */
  readonly qrDataUrl: string;
  /** The content that was encoded (the upi:// URI, for verification). */
  readonly encodedContent: string;
  /** Pixel size of the generated image. */
  readonly sizePixels: number;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Generate a UPI QR code from a deep-link URI.
 *
 * Validates that the input is a `upi://` URI (defensive — the use
 * case should have built it via `buildUpiDeepLink`). Delegates the
 * actual QR encoding to the `QrEncoderPort`.
 *
 * The function does NOT embed any metadata, expense history, or
 * access tokens — by construction, the only content is the URI.
 *
 * @example
 *   const link = buildUpiDeepLink({...});
 *   const qr = await generateUpiQr({
 *     upiUri: link.uri,
 *     encoder: expoQrEncoder,
 *   });
 *   // qr.qrDataUrl → 'data:image/png;base64,...'
 */
export async function generateUpiQr(
  input: GenerateUpiQrInput & { readonly encoder: QrEncoderPort },
): Promise<GenerateUpiQrOutput> {
  // ── Defensive: must be a upi:// URI ──
  if (typeof input.upiUri !== 'string' || input.upiUri.length === 0) {
    throw new InvalidEntityError('UPI QR generator: upiUri must be a non-empty string');
  }
  if (!input.upiUri.startsWith('upi://')) {
    throw new InvalidEntityError(
      `UPI QR generator: upiUri must start with "upi://", got "${input.upiUri.slice(0, 20)}..."`,
    );
  }
  // ── Defensive: refuse to encode suspiciously-large URIs ──
  // UPI URIs are typically <200 chars; QR codes can handle up to ~2,953
  // bytes at low error correction, but very long URIs produce dense,
  // hard-to-scan QR codes. We cap at 500 chars.
  if (input.upiUri.length > 500) {
    throw new InvalidEntityError(
      `UPI QR generator: upiUri is too long (max 500 chars, got ${input.upiUri.length})`,
    );
  }

  // ── Validate size ──
  const sizePixels = input.sizePixels ?? 256;
  if (!Number.isInteger(sizePixels) || sizePixels < 64 || sizePixels > 1024) {
    throw new InvalidEntityError(
      `UPI QR generator: sizePixels must be an integer between 64 and 1024, got ${sizePixels}`,
    );
  }

  // ── Encode ──
  const qrDataUrl = await input.encoder.encode(input.upiUri);

  return {
    qrDataUrl,
    encodedContent: input.upiUri,
    sizePixels,
  };
}
