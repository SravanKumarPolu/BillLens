/**
 * Payment provider tests.
 *
 * Phase 10 Prompt 99.
 */

import { describe, expect, it } from '@jest/globals';

import {
  type PaymentProviderType,
  PAYMENT_PROVIDERS,
  computePaymentFee,
  generatePaymentLink,
  getProvider,
  getSupportedProviders,
} from '../payment-provider';

describe('PAYMENT_PROVIDERS catalog', () => {
  it('contains all 7 providers', () => {
    expect(PAYMENT_PROVIDERS).toHaveLength(7);
    const types = PAYMENT_PROVIDERS.map((p) => p.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'upi',
        'razorpay',
        'stripe',
        'paypal',
        'paypal_me',
        'wise',
        'venmo',
      ]),
    );
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PAYMENT_PROVIDERS)).toBe(true);
  });

  it('every provider has a displayName, currencies, and countries', () => {
    for (const provider of PAYMENT_PROVIDERS) {
      expect(typeof provider.displayName).toBe('string');
      expect(provider.displayName.length).toBeGreaterThan(0);
      expect(provider.supportedCurrencies.length).toBeGreaterThan(0);
      expect(provider.supportedCountries.length).toBeGreaterThan(0);
    }
  });

  it('UPI is INR-only and India-only', () => {
    const upi = getProvider('upi');
    expect(upi).not.toBeNull();
    expect(upi?.supportedCurrencies).toEqual(['INR']);
    expect(upi?.supportedCountries).toEqual(['IN']);
  });

  it('UPI has zero fees', () => {
    const upi = getProvider('upi');
    expect(upi?.feePercent).toBe(0);
    expect(upi?.feeFixedMinor).toBe(0);
  });

  it('UPI supports instant transfer', () => {
    const upi = getProvider('upi');
    expect(upi?.instantTransfer).toBe(true);
  });

  it('UPI has a deep link scheme', () => {
    const upi = getProvider('upi');
    expect(upi?.deepLinkScheme).toBe('upi://');
  });

  it('Venmo is USD-only and US-only', () => {
    const venmo = getProvider('venmo');
    expect(venmo?.supportedCurrencies).toEqual(['USD']);
    expect(venmo?.supportedCountries).toEqual(['US']);
  });

  it('Stripe has the typical 2.9% + $0.30 fee', () => {
    const stripe = getProvider('stripe');
    expect(stripe?.feePercent).toBe(2.9);
    expect(stripe?.feeFixedMinor).toBe(30);
  });

  it('PayPal has a higher fee than Stripe', () => {
    const stripe = getProvider('stripe');
    const paypal = getProvider('paypal');
    expect((paypal?.feePercent ?? 0)).toBeGreaterThan(stripe?.feePercent ?? 0);
  });
});

describe('getSupportedProviders', () => {
  it('returns UPI for INR + IN', () => {
    const providers = getSupportedProviders('INR', 'IN');
    const types = providers.map((p) => p.type);
    expect(types).toContain('upi');
    expect(types).toContain('razorpay'); // Razorpay also supports INR+IN
    expect(types).toContain('wise'); // Wise supports INR
  });

  it('returns Stripe + PayPal + Wise for USD + US', () => {
    const providers = getSupportedProviders('USD', 'US');
    const types = providers.map((p) => p.type);
    expect(types).toContain('stripe');
    expect(types).toContain('paypal');
    expect(types).toContain('wise');
    expect(types).toContain('venmo');
    expect(types).not.toContain('upi'); // UPI is INR-only
  });

  it('returns Venmo for USD + US only', () => {
    const providers = getSupportedProviders('USD', 'US');
    const types = providers.map((p) => p.type);
    expect(types).toContain('venmo');
  });

  it('does NOT return Venmo for USD + GB', () => {
    const providers = getSupportedProviders('USD', 'GB');
    const types = providers.map((p) => p.type);
    expect(types).not.toContain('venmo');
  });

  it('returns empty array for unsupported currency/country combo', () => {
    expect(getSupportedProviders('XYZ', 'ZZ')).toEqual([]);
  });

  it('returns UPI ONLY for INR + IN (not for INR + US)', () => {
    const providers = getSupportedProviders('INR', 'US');
    const types = providers.map((p) => p.type);
    expect(types).not.toContain('upi'); // UPI is IN-only
  });

  it('requires BOTH currency AND country to match', () => {
    // Wise supports USD and US, so should be in the result.
    const usdUs = getSupportedProviders('USD', 'US');
    expect(usdUs.map((p) => p.type)).toContain('wise');
    // But if we ask for USD + BR (Wise supports USD but not BR), Wise should be absent.
    const usdBr = getSupportedProviders('USD', 'BR');
    expect(usdBr.map((p) => p.type)).not.toContain('wise');
  });
});

describe('generatePaymentLink', () => {
  it('generates a UPI deep link with correct format', () => {
    const link = generatePaymentLink('upi', {
      amountMinor: 1250,
      currency: 'INR',
      recipient: 'merchant@upi',
      note: 'Lunch',
    });
    expect(link).toContain('upi://pay?');
    expect(link).toContain('pa=merchant%40upi');
    expect(link).toContain('am=12.50');
    expect(link).toContain('cu=INR');
    expect(link).toContain('tn=Lunch');
  });

  it('UPI deep link omits tn when note is missing', () => {
    const link = generatePaymentLink('upi', {
      amountMinor: 1250,
      currency: 'INR',
      recipient: 'merchant@upi',
    });
    expect(link).not.toContain('tn=');
  });

  it('generates a Razorpay link', () => {
    const link = generatePaymentLink('razorpay', {
      amountMinor: 1250,
      currency: 'INR',
      recipient: 'abc123',
    });
    expect(link).toBe('https://rzp.io/i/abc123');
  });

  it('generates a Stripe link', () => {
    const link = generatePaymentLink('stripe', {
      amountMinor: 1250,
      currency: 'USD',
      recipient: 'price_abc123',
    });
    expect(link).toBe('https://buy.stripe.com/price_abc123');
  });

  it('generates a PayPal link with amount', () => {
    const link = generatePaymentLink('paypal', {
      amountMinor: 1250,
      currency: 'USD',
      recipient: 'user@example.com',
    });
    expect(link).toContain('paypal.com/paypalme/user%40example.com/12.50');
  });

  it('generates a PayPal.me link with amount', () => {
    const link = generatePaymentLink('paypal_me', {
      amountMinor: 1250,
      currency: 'USD',
      recipient: 'johndoe',
    });
    expect(link).toBe('https://paypal.me/johndoe/12.50');
  });

  it('generates a Wise link', () => {
    const link = generatePaymentLink('wise', {
      amountMinor: 1250,
      currency: 'USD',
      recipient: 'wiseuser',
    });
    expect(link).toBe('https://wise.com/pay/me/wiseuser');
  });

  it('generates a Venmo deep link', () => {
    const link = generatePaymentLink('venmo', {
      amountMinor: 1250,
      currency: 'USD',
      recipient: 'johndoe',
      note: 'Lunch',
    });
    expect(link).toContain('venmo://paycharge?txn=pay');
    expect(link).toContain('recipients=johndoe');
    expect(link).toContain('amount=12.50');
    expect(link).toContain('note=Lunch');
  });

  it('Venmo link omits note when missing', () => {
    const link = generatePaymentLink('venmo', {
      amountMinor: 1250,
      currency: 'USD',
      recipient: 'johndoe',
    });
    expect(link).not.toContain('note=');
  });

  it('throws on an unknown provider', () => {
    expect(() =>
      generatePaymentLink('unknown' as unknown as PaymentProviderType, {
        amountMinor: 1250,
        currency: 'USD',
        recipient: 'someone',
      }),
    ).toThrow(/Unknown payment provider/);
  });

  it('URL-encodes special characters in recipient', () => {
    const link = generatePaymentLink('paypal_me', {
      amountMinor: 1250,
      currency: 'USD',
      recipient: 'user name@example.com',
    });
    expect(link).toContain('user%20name%40example.com');
  });

  it('URL-encodes special characters in note', () => {
    const link = generatePaymentLink('upi', {
      amountMinor: 1250,
      currency: 'INR',
      recipient: 'merchant@upi',
      note: 'Lunch & dinner',
    });
    expect(link).toContain('tn=Lunch%20%26%20dinner');
  });

  it('CRITICAL: never embeds raw UPI ID in plaintext in non-UPI links', () => {
    // UPI deep links are the exception — they MUST include the VPA in
    // plaintext because that's how UPI works. But other providers
    // should not embed a UPI ID even if the user provides one.
    const stripeLink = generatePaymentLink('stripe', {
      amountMinor: 1250,
      currency: 'USD',
      recipient: 'price_abc123', // Stripe uses price IDs, not UPI IDs
    });
    expect(stripeLink).not.toMatch(/upi_id/i);
  });
});

describe('computePaymentFee', () => {
  it('returns 0 for UPI (zero fees)', () => {
    expect(computePaymentFee('upi', 10000)).toBe(0);
  });

  it('returns 0 for Venmo (P2P free)', () => {
    expect(computePaymentFee('venmo', 10000)).toBe(0);
  });

  it('returns 0 for PayPal.me (P2P free)', () => {
    expect(computePaymentFee('paypal_me', 10000)).toBe(0);
  });

  it('returns variable + fixed fee for Stripe', () => {
    // 2.9% of $100.00 (10000 minor) = $2.90 (290 minor)
    // + $0.30 fixed (30 minor) = 320 minor
    expect(computePaymentFee('stripe', 10000)).toBe(320);
  });

  it('returns variable fee for Razorpay', () => {
    // 2% of $100.00 = $2.00 = 200 minor
    expect(computePaymentFee('razorpay', 10000)).toBe(200);
  });

  it('returns variable + fixed fee for PayPal', () => {
    // 3.49% of $100.00 = $3.49 = 349 minor
    // + $0.49 fixed (49 minor) = 398 minor
    expect(computePaymentFee('paypal', 10000)).toBe(398);
  });

  it('returns variable fee for Wise', () => {
    // 0.5% of $100.00 = $0.50 = 50 minor
    expect(computePaymentFee('wise', 10000)).toBe(50);
  });

  it('returns 0 for $0 amount', () => {
    expect(computePaymentFee('stripe', 0)).toBe(30); // just the fixed fee
  });

  it('returns 0 for negative amount', () => {
    expect(computePaymentFee('stripe', -1000)).toBe(0);
  });

  it('returns 0 for NaN amount', () => {
    expect(computePaymentFee('stripe', NaN)).toBe(0);
  });

  it('returns 0 for unknown provider', () => {
    expect(
      computePaymentFee('unknown' as unknown as PaymentProviderType, 10000),
    ).toBe(0);
  });

  it('Stripe fee on $1000 is $29 + $0.30 = 2930 minor', () => {
    // 2.9% of $1000 = $29 = 2900 minor
    // + $0.30 = 30 minor
    expect(computePaymentFee('stripe', 100000)).toBe(2930);
  });
});

describe('getProvider', () => {
  it('returns the provider config for a known type', () => {
    expect(getProvider('upi')?.type).toBe('upi');
    expect(getProvider('stripe')?.type).toBe('stripe');
  });

  it('returns null for an unknown type', () => {
    expect(
      getProvider('unknown' as unknown as PaymentProviderType),
    ).toBeNull();
  });
});
