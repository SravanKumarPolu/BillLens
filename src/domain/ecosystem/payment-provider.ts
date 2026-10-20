/**
 * Payment provider abstraction — UPI, Razorpay, Stripe, PayPal, Wise, Venmo.
 *
 * Phase 10 Prompt 99: Ecosystem Expansion.
 *
 * Each provider has its own currency/country support matrix, fee
 * structure, and deep-link scheme. This module declares the catalog
 * and provides helpers to find supported providers and generate
 * payment links.
 *
 * CRITICAL: payment links contain ONLY:
 *   - amountMinor, currency, recipient (a provider-specific reference)
 *   - note (optional, user-provided)
 *
 * Payment links NEVER contain:
 *   - UPI IDs in plaintext (use deep links that the OS handles)
 *   - Bank account numbers
 *   - Card numbers
 *   - OTPs / PINs
 *
 * See `docs/ecosystem-expansion.md`.
 */

import { formatMinorAmount } from '../entities/currency';
import type { CurrencyCode } from '../value-objects/currency-code';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentProviderType =
  | 'upi'
  | 'razorpay'
  | 'stripe'
  | 'paypal'
  | 'wise'
  | 'venmo'
  | 'paypal_me';

export interface PaymentProviderConfig {
  /** Provider type. */
  readonly type: PaymentProviderType;
  /** Display name. */
  readonly displayName: string;
  /** Supported ISO 4217 currency codes. */
  readonly supportedCurrencies: readonly string[];
  /** Supported ISO 3166-1 alpha-2 country codes. */
  readonly supportedCountries: readonly string[];
  /** Fee as a percentage of the transaction (optional). */
  readonly feePercent?: number;
  /** Fixed fee in minor units of the transaction currency (optional). */
  readonly feeFixedMinor?: number;
  /** Deep-link URL scheme (e.g. 'upi://', 'venmo://'). */
  readonly deepLinkScheme?: string;
  /** Whether the provider supports instant transfers. */
  readonly instantTransfer: boolean;
}

export interface PaymentLinkParams {
  readonly amountMinor: number;
  readonly currency: string;
  readonly recipient: string;
  readonly note?: string;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * BillLens's supported payment providers.
 *
 * Currency and country codes are the canonical ISO standards.
 * Providers are filtered by the user's currency + country at
 * checkout time.
 */
export const PAYMENT_PROVIDERS: readonly PaymentProviderConfig[] =
  Object.freeze([
    {
      type: 'upi',
      displayName: 'UPI',
      supportedCurrencies: ['INR'],
      supportedCountries: ['IN'],
      feePercent: 0,
      feeFixedMinor: 0,
      deepLinkScheme: 'upi://',
      instantTransfer: true,
    },
    {
      type: 'razorpay',
      displayName: 'Razorpay',
      supportedCurrencies: ['INR', 'USD', 'EUR', 'GBP'],
      supportedCountries: ['IN', 'US', 'GB', 'DE', 'FR', 'SG', 'AE'],
      feePercent: 2,
      feeFixedMinor: 0,
      instantTransfer: false,
    },
    {
      type: 'stripe',
      displayName: 'Stripe',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'SGD'],
      supportedCountries: ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'SG'],
      feePercent: 2.9,
      feeFixedMinor: 30, // $0.30 fixed
      instantTransfer: false,
    },
    {
      type: 'paypal',
      displayName: 'PayPal',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
      supportedCountries: ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP'],
      feePercent: 3.49,
      feeFixedMinor: 49, // $0.49 fixed
      instantTransfer: false,
    },
    {
      type: 'paypal_me',
      displayName: 'PayPal.me',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
      supportedCountries: ['US', 'GB', 'CA', 'AU', 'DE', 'FR'],
      feePercent: 0, // P2P transfers are free
      feeFixedMinor: 0,
      deepLinkScheme: 'https://paypal.me/',
      instantTransfer: false,
    },
    {
      type: 'wise',
      displayName: 'Wise (TransferWise)',
      supportedCurrencies: [
        'USD',
        'EUR',
        'GBP',
        'CAD',
        'AUD',
        'JPY',
        'SGD',
        'INR',
        'AED',
      ],
      supportedCountries: [
        'US',
        'GB',
        'CA',
        'AU',
        'DE',
        'FR',
        'JP',
        'SG',
        'IN',
        'AE',
      ],
      feePercent: 0.5,
      feeFixedMinor: 0,
      instantTransfer: false,
    },
    {
      type: 'venmo',
      displayName: 'Venmo',
      supportedCurrencies: ['USD'],
      supportedCountries: ['US'],
      feePercent: 0, // P2P free
      feeFixedMinor: 0,
      deepLinkScheme: 'venmo://',
      instantTransfer: false,
    },
  ]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the providers that support BOTH the given currency AND country.
 *
 * Both checks are required: a provider might support USD but not be
 * available in the US (rare, but possible for regulatory reasons).
 */
export function getSupportedProviders(
  currency: string,
  country: string,
): readonly PaymentProviderConfig[] {
  return PAYMENT_PROVIDERS.filter(
    (p) =>
      p.supportedCurrencies.includes(currency) &&
      p.supportedCountries.includes(country),
  );
}

/**
 * Returns the provider config for a given type, or null if not found.
 */
export function getProvider(
  type: PaymentProviderType,
): PaymentProviderConfig | null {
  return PAYMENT_PROVIDERS.find((p) => p.type === type) ?? null;
}

/**
 * Generates a payment link / deep link for the given provider + params.
 *
 * Format per provider:
 *
 *   - `upi` → `upi://pay?pa=<recipient>&pn=BillLens&am=<amount>&cu=INR&tn=<note>`
 *   - `razorpay` → `https://rzp.io/i/<recipient>` (Razorpay short link)
 *   - `stripe` → `https://buy.stripe.com/<recipient>` (Stripe payment link)
 *   - `paypal` → `https://www.paypal.com/paypalme/<recipient>/<amount>`
 *   - `paypal_me` → `https://paypal.me/<recipient>/<amount>`
 *   - `wise` → `https://wise.com/pay/me/<recipient>`
 *   - `venmo` → `venmo://paycharge?txn=pay&recipients=<recipient>&amount=<amount>&note=<note>`
 *
 * The `recipient` is a provider-specific reference (e.g. UPI VPA,
 * Razorpay link ID, Stripe price ID, PayPal.me username). It is NOT
 * a raw UPI ID, bank account, or card number — the application layer
 * is responsible for converting user-entered references into the
 * provider's canonical format.
 *
 * Amount is converted from minor units to major units with 2 decimal
 * places for inclusion in URLs.
 *
 * Throws if the provider type is unknown.
 */
export function generatePaymentLink(
  provider: PaymentProviderType,
  params: PaymentLinkParams,
): string {
  // v2.5.0: currency-aware minor-unit formatting (was hardcoded ÷100).
  const amountMajor = formatMinorAmount(params.amountMinor, params.currency as CurrencyCode);
  const noteEncoded = encodeURIComponent(params.note ?? '');
  const recipientEncoded = encodeURIComponent(params.recipient);

  switch (provider) {
    case 'upi':
      // UPI deep link per NPCI spec.
      // pa = payee address (VPA), am = amount, cu = currency, tn = transaction note
      return (
        `upi://pay?pa=${recipientEncoded}` +
        `&pn=BillLens` +
        `&am=${amountMajor}` +
        `&cu=${params.currency}` +
        (noteEncoded ? `&tn=${noteEncoded}` : '')
      );
    case 'razorpay':
      return `https://rzp.io/i/${recipientEncoded}`;
    case 'stripe':
      return `https://buy.stripe.com/${recipientEncoded}`;
    case 'paypal':
      return `https://www.paypal.com/paypalme/${recipientEncoded}/${amountMajor}`;
    case 'paypal_me':
      return `https://paypal.me/${recipientEncoded}/${amountMajor}`;
    case 'wise':
      return `https://wise.com/pay/me/${recipientEncoded}`;
    case 'venmo':
      return (
        `venmo://paycharge?txn=pay` +
        `&recipients=${recipientEncoded}` +
        `&amount=${amountMajor}` +
        (noteEncoded ? `&note=${noteEncoded}` : '')
      );
    default:
      throw new Error(`Unknown payment provider: ${provider}`);
  }
}

/**
 * Computes the fee for a given provider + amount.
 *
 * Returns the fee in MINOR units of the transaction currency.
 *
 * Formula: fee = round(amountMinor * feePercent / 100) + feeFixedMinor
 *
 * Returns 0 when amountMinor or feePercent are 0 / undefined.
 */
export function computePaymentFee(
  provider: PaymentProviderType,
  amountMinor: number,
): number {
  const config = getProvider(provider);
  if (config === null) {
    return 0;
  }
  if (!Number.isFinite(amountMinor) || amountMinor < 0) {
    return 0;
  }
  const percent = config.feePercent ?? 0;
  const fixed = config.feeFixedMinor ?? 0;
  if (percent === 0 && fixed === 0) {
    return 0;
  }
  const variableFee = Math.round((amountMinor * percent) / 100);
  return variableFee + fixed;
}
