/**
 * GenerateQrCodeUrlUseCase — Phase 3 Prompt 26.
 *
 * Takes a plain invite token and returns a deep-link URL suitable for
 * encoding as a QR code.
 *
 * CRITICAL: this use case does NOT encode private group data (member
 * lists, balances, expense history) into the URL. Only the opaque token
 * is embedded — the receiver resolves group metadata by calling the
 * validate-invite use case after parsing the URL.
 *
 * The URL form is `billlens://group/join/{token}`. Any standard QR
 * encoder (e.g. `qrcode` npm package, `expo-barcode-scanner` generator)
 * can encode the returned string into a scannable image.
 */

import { buildJoinDeepLink } from './deep-link-handler';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface GenerateQrCodeUrlInput {
  readonly plainToken: string;
}

export interface GenerateQrCodeUrlOutput {
  readonly url: string;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class GenerateQrCodeUrlUseCase {
  execute(input: GenerateQrCodeUrlInput): GenerateQrCodeUrlOutput {
    if (!input.plainToken || input.plainToken.length < 32) {
      throw new Error(
        'GenerateQrCodeUrlUseCase: token must be a 32+ char hex string',
      );
    }
    return { url: buildJoinDeepLink(input.plainToken) };
  }
}
