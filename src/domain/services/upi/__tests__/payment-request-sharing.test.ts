import { describe, expect, it } from '@jest/globals';

import { InvalidEntityError } from '../../../errors';
import {
  buildPaymentRequestMessage,
} from '../payment-request-sharing';
import {
  buildUpiDeepLink,
} from '../upi-deep-link-builder';

describe('Payment-request sharing', () => {
  function buildUri(): string {
    return buildUpiDeepLink({
      payeeVpa: 'john.doe@oksbi',
      payeeName: 'John Doe',
      amount: 42.50,
      currencyCode: 'INR',
      note: 'Dinner split',
    }).uri;
  }

  describe('happy path', () => {
    it('builds a complete shareable message with group context', () => {
      const uri = buildUri();
      const message = buildPaymentRequestMessage({
        payerName: 'Jane Doe',
        receiverName: 'John Doe',
        receiverMaskedVpa: 'jo***@oksbi',
        amount: 42.50,
        currencyCode: 'INR',
        groupName: 'Weekend Trip',
        upiUri: uri,
        billLensLink: 'billlens://settlement/s/abc123',
      }).message;

      // Verify each required piece is present.
      expect(message).toContain('Weekend Trip — ');
      expect(message).toContain('Jane Doe → John Doe');
      expect(message).toContain('₹42.50');
      expect(message).toContain('Pay to: jo***@oksbi');
      expect(message).toContain('Tap to pay via UPI:');
      expect(message).toContain(uri);
      expect(message).toContain('billlens://settlement/s/abc123');
    });

    it('omits the group prefix when groupName is undefined', () => {
      const message = buildPaymentRequestMessage({
        payerName: 'Jane Doe',
        receiverName: 'John Doe',
        receiverMaskedVpa: 'jo***@oksbi',
        amount: 100,
        currencyCode: 'INR',
        upiUri: buildUri(),
      }).message;
      expect(message.startsWith('Jane Doe → John Doe')).toBe(true);
      expect(message).not.toContain(' — ');
    });

    it('omits the BillLens link line when billLensLink is undefined', () => {
      const message = buildPaymentRequestMessage({
        payerName: 'Jane Doe',
        receiverName: 'John Doe',
        receiverMaskedVpa: 'jo***@oksbi',
        amount: 100,
        currencyCode: 'INR',
        upiUri: buildUri(),
      }).message;
      expect(message).not.toContain('billlens://');
      expect(message).not.toContain('https://billlens.app');
    });

    it('formats integer amounts without decimals', () => {
      const message = buildPaymentRequestMessage({
        payerName: 'A',
        receiverName: 'B',
        receiverMaskedVpa: 'b***@ibl',
        amount: 100,
        currencyCode: 'INR',
        upiUri: buildUri(),
      }).message;
      expect(message).toContain('₹100');
      expect(message).not.toContain('₹100.00');
    });

    it('formats fractional amounts with 2 decimal places', () => {
      const message = buildPaymentRequestMessage({
        payerName: 'A',
        receiverName: 'B',
        receiverMaskedVpa: 'b***@ibl',
        amount: 42.5,
        currencyCode: 'INR',
        upiUri: buildUri(),
      }).message;
      expect(message).toContain('₹42.50');
    });

    it('falls back to the ISO currency code for unknown currencies', () => {
      const message = buildPaymentRequestMessage({
        payerName: 'A',
        receiverName: 'B',
        receiverMaskedVpa: 'b***@ibl',
        amount: 100,
        currencyCode: 'XYZ',
        upiUri: buildUri(),
      }).message;
      expect(message).toContain('XYZ 100');
    });
  });

  describe('privacy — never embeds the full VPA in the message body', () => {
    it('uses the masked VPA in the "Pay to" line, NOT the full VPA', () => {
      const message = buildPaymentRequestMessage({
        payerName: 'A',
        receiverName: 'B',
        receiverMaskedVpa: 'jo***@oksbi',
        amount: 100,
        currencyCode: 'INR',
        upiUri: buildUri(),
      }).message;
      expect(message).toContain('Pay to: jo***@oksbi');
      expect(message).not.toContain('Pay to: john.doe@oksbi');
    });

    it('refuses to embed an unmasked VPA (must contain ***)', () => {
      expect(() =>
        buildPaymentRequestMessage({
          payerName: 'A',
          receiverName: 'B',
          receiverMaskedVpa: 'john.doe@oksbi', // unmasked — should be refused
          amount: 100,
          currencyCode: 'INR',
          upiUri: buildUri(),
        }),
      ).toThrow(InvalidEntityError);
    });
  });

  describe('validation errors', () => {
    it('rejects empty payerName', () => {
      expect(() =>
        buildPaymentRequestMessage({
          payerName: '',
          receiverName: 'B',
          receiverMaskedVpa: 'b***@ibl',
          amount: 100,
          currencyCode: 'INR',
          upiUri: buildUri(),
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects empty receiverName', () => {
      expect(() =>
        buildPaymentRequestMessage({
          payerName: 'A',
          receiverName: '',
          receiverMaskedVpa: 'b***@ibl',
          amount: 100,
          currencyCode: 'INR',
          upiUri: buildUri(),
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a non-upi:// URI', () => {
      expect(() =>
        buildPaymentRequestMessage({
          payerName: 'A',
          receiverName: 'B',
          receiverMaskedVpa: 'b***@ibl',
          amount: 100,
          currencyCode: 'INR',
          upiUri: 'https://example.com',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a non-billlens:// BillLens link', () => {
      expect(() =>
        buildPaymentRequestMessage({
          payerName: 'A',
          receiverName: 'B',
          receiverMaskedVpa: 'b***@ibl',
          amount: 100,
          currencyCode: 'INR',
          upiUri: buildUri(),
          billLensLink: 'https://example.com/s/abc',
        }),
      ).toThrow(InvalidEntityError);
    });

    it('rejects a zero amount', () => {
      expect(() =>
        buildPaymentRequestMessage({
          payerName: 'A',
          receiverName: 'B',
          receiverMaskedVpa: 'b***@ibl',
          amount: 0,
          currencyCode: 'INR',
          upiUri: buildUri(),
        }),
      ).toThrow(InvalidEntityError);
    });
  });
});
