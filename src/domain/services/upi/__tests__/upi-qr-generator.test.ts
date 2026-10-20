import { describe, expect, it } from '@jest/globals';

import { InvalidEntityError } from '../../../errors';
import {
  buildUpiDeepLink,
} from '../upi-deep-link-builder';
import {
  generateUpiQr,
  type QrEncoderPort,
} from '../upi-qr-generator';

/**
 * Stub QR encoder for tests. Always returns a fixed data URL.
 */
class StubQrEncoder implements QrEncoderPort {
  readonly calls: string[] = [];
  async encode(content: string): Promise<string> {
    this.calls.push(content);
    return `data:image/png;base64,STUB-FOR-${content.length}-CHARS`;
  }
}

describe('UPI QR generator', () => {
  function buildUpiUri(): string {
    return buildUpiDeepLink({
      payeeVpa: 'john.doe@oksbi',
      payeeName: 'John Doe',
      amount: 42.50,
      currencyCode: 'INR',
      note: 'Dinner split',
    }).uri;
  }

  describe('happy path', () => {
    it('encodes a valid upi:// URI into a QR data URL', async () => {
      const encoder = new StubQrEncoder();
      const uri = buildUpiUri();
      const result = await generateUpiQr({
        upiUri: uri,
        encoder,
      });
      expect(result.qrDataUrl).toBe(`data:image/png;base64,STUB-FOR-${uri.length}-CHARS`);
      expect(result.encodedContent).toBe(uri);
      expect(result.sizePixels).toBe(256); // default
      expect(encoder.calls).toEqual([uri]);
    });

    it('accepts a custom sizePixels', async () => {
      const result = await generateUpiQr({
        upiUri: buildUpiUri(),
        encoder: new StubQrEncoder(),
        sizePixels: 512,
      });
      expect(result.sizePixels).toBe(512);
    });
  });

  describe('validation errors', () => {
    it('rejects a non-upi:// URI', async () => {
      await expect(
        generateUpiQr({
          upiUri: 'https://example.com',
          encoder: new StubQrEncoder(),
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('rejects an empty URI', async () => {
      await expect(
        generateUpiQr({
          upiUri: '',
          encoder: new StubQrEncoder(),
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('rejects a URI longer than 500 chars', async () => {
      const longUri = 'upi://pay?pa=' + 'x'.repeat(550);
      await expect(
        generateUpiQr({
          upiUri: longUri,
          encoder: new StubQrEncoder(),
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('rejects an out-of-range sizePixels', async () => {
      await expect(
        generateUpiQr({
          upiUri: buildUpiUri(),
          encoder: new StubQrEncoder(),
          sizePixels: 32, // too small
        }),
      ).rejects.toThrow(InvalidEntityError);

      await expect(
        generateUpiQr({
          upiUri: buildUpiUri(),
          encoder: new StubQrEncoder(),
          sizePixels: 2048, // too large
        }),
      ).rejects.toThrow(InvalidEntityError);

      await expect(
        generateUpiQr({
          upiUri: buildUpiUri(),
          encoder: new StubQrEncoder(),
          sizePixels: 256.5, // not an integer
        }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });

  describe('safety: only the URI is encoded', () => {
    it('passes only the upiUri to the encoder — no metadata, no tokens', async () => {
      const encoder = new StubQrEncoder();
      const uri = buildUpiUri();
      await generateUpiQr({ upiUri: uri, encoder });
      // The encoder received exactly one call with exactly the URI.
      expect(encoder.calls).toEqual([uri]);
      expect(encoder.calls[0]).toBe(uri);
    });
  });
});
