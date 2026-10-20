/**
 * Regional configuration — country-specific defaults.
 *
 * Phase 10 Prompt 93: International Expansion.
 *
 * Maps country code → regional config (currency, locale, timezone,
 * tax terminology, payment methods, compliance, onboarding flow).
 *
 * This module is PURE and READ-ONLY.
 *
 * See `docs/international-expansion.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OnboardingFlow =
  | 'standard'
  | 'india_upi'
  | 'eu_vat'
  | 'us_sales_tax';

export interface RegionalConfig {
  /** ISO 3166-1 alpha-2 country code (e.g. 'US', 'IN'). */
  readonly countryCode: string;
  /** ISO 4217 currency code (e.g. 'USD', 'INR'). */
  readonly currencyCode: string;
  /** Default BCP-47 locale (e.g. 'en-US', 'hi-IN'). */
  readonly locale: string;
  /** IANA timezone (e.g. 'America/New_York', 'Asia/Kolkata'). */
  readonly timezone: string;
  /** Regional tax terminology: 'GST' | 'VAT' | 'Sales Tax' | 'Consumption Tax' | 'Service Tax'. */
  readonly taxTerminology: string;
  /** Payment methods commonly available in this region. */
  readonly paymentMethods: readonly string[];
  /** Compliance requirements specific to this region. */
  readonly complianceRequirements: readonly string[];
  /** Which onboarding flow to use. */
  readonly onboardingFlow: OnboardingFlow;
}

// ---------------------------------------------------------------------------
// Regional config registry
// ---------------------------------------------------------------------------

export const REGIONAL_CONFIGS: Readonly<Record<string, RegionalConfig>> =
  Object.freeze({
    US: Object.freeze({
      countryCode: 'US',
      currencyCode: 'USD',
      locale: 'en-US',
      timezone: 'America/New_York',
      taxTerminology: 'Sales Tax',
      paymentMethods: ['credit_card', 'debit_card', 'bank_transfer', 'apple_pay', 'google_pay'],
      complianceRequirements: ['CCPA_NOTICE', 'PCI_DSS'],
      onboardingFlow: 'us_sales_tax',
    }),
    GB: Object.freeze({
      countryCode: 'GB',
      currencyCode: 'GBP',
      locale: 'en-GB',
      timezone: 'Europe/London',
      taxTerminology: 'VAT',
      paymentMethods: ['credit_card', 'debit_card', 'bank_transfer', 'apple_pay', 'google_pay'],
      complianceRequirements: ['GDPR_CONSENT', 'PCI_DSS'],
      onboardingFlow: 'eu_vat',
    }),
    IN: Object.freeze({
      countryCode: 'IN',
      currencyCode: 'INR',
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      taxTerminology: 'GST',
      paymentMethods: ['upi', 'credit_card', 'debit_card', 'net_banking', 'wallet'],
      complianceRequirements: ['GST_DISPLAY', 'DPDP_CONSENT'],
      onboardingFlow: 'india_upi',
    }),
    DE: Object.freeze({
      countryCode: 'DE',
      currencyCode: 'EUR',
      locale: 'de-DE',
      timezone: 'Europe/Berlin',
      taxTerminology: 'VAT',
      paymentMethods: ['credit_card', 'debit_card', 'sepa', 'paypal'],
      complianceRequirements: ['GDPR_CONSENT', 'PCI_DSS'],
      onboardingFlow: 'eu_vat',
    }),
    FR: Object.freeze({
      countryCode: 'FR',
      currencyCode: 'EUR',
      locale: 'fr-FR',
      timezone: 'Europe/Paris',
      taxTerminology: 'VAT',
      paymentMethods: ['credit_card', 'debit_card', 'sepa', 'paypal'],
      complianceRequirements: ['GDPR_CONSENT', 'PCI_DSS'],
      onboardingFlow: 'eu_vat',
    }),
    ES: Object.freeze({
      countryCode: 'ES',
      currencyCode: 'EUR',
      locale: 'es-ES',
      timezone: 'Europe/Madrid',
      taxTerminology: 'VAT',
      paymentMethods: ['credit_card', 'debit_card', 'sepa', 'paypal'],
      complianceRequirements: ['GDPR_CONSENT', 'PCI_DSS'],
      onboardingFlow: 'eu_vat',
    }),
    BR: Object.freeze({
      countryCode: 'BR',
      currencyCode: 'BRL',
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      taxTerminology: 'VAT',
      paymentMethods: ['credit_card', 'debit_card', 'pix', 'boleto'],
      complianceRequirements: ['LGPD_CONSENT', 'PCI_DSS'],
      onboardingFlow: 'standard',
    }),
    SA: Object.freeze({
      countryCode: 'SA',
      currencyCode: 'SAR',
      locale: 'ar-SA',
      timezone: 'Asia/Riyadh',
      taxTerminology: 'VAT',
      paymentMethods: ['credit_card', 'debit_card', 'mada', 'stc_pay'],
      complianceRequirements: ['PCI_DSS'],
      onboardingFlow: 'standard',
    }),
    CN: Object.freeze({
      countryCode: 'CN',
      currencyCode: 'CNY',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      taxTerminology: 'VAT',
      paymentMethods: ['wechat_pay', 'alipay', 'union_pay'],
      complianceRequirements: ['PIPL_CONSENT'],
      onboardingFlow: 'standard',
    }),
    JP: Object.freeze({
      countryCode: 'JP',
      currencyCode: 'JPY',
      locale: 'ja-JP',
      timezone: 'Asia/Tokyo',
      taxTerminology: 'Consumption Tax',
      paymentMethods: ['credit_card', 'debit_card', 'konbini', 'pay_pay'],
      complianceRequirements: ['APPI_CONSENT'],
      onboardingFlow: 'standard',
    }),
    KR: Object.freeze({
      countryCode: 'KR',
      currencyCode: 'KRW',
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      taxTerminology: 'VAT',
      paymentMethods: ['credit_card', 'debit_card', 'kakao_pay', 'toss'],
      complianceRequirements: ['PIPC_CONSENT'],
      onboardingFlow: 'standard',
    }),
    ID: Object.freeze({
      countryCode: 'ID',
      currencyCode: 'IDR',
      locale: 'id-ID',
      timezone: 'Asia/Jakarta',
      taxTerminology: 'VAT',
      paymentMethods: ['credit_card', 'debit_card', 'gopay', 'ovo', 'qris'],
      complianceRequirements: ['PDP_LAW_CONSENT'],
      onboardingFlow: 'standard',
    }),
    TH: Object.freeze({
      countryCode: 'TH',
      currencyCode: 'THB',
      locale: 'th-TH',
      timezone: 'Asia/Bangkok',
      taxTerminology: 'VAT',
      paymentMethods: ['credit_card', 'debit_card', 'promptpay', 'true_money'],
      complianceRequirements: ['PDPA_CONSENT'],
      onboardingFlow: 'standard',
    }),
    VN: Object.freeze({
      countryCode: 'VN',
      currencyCode: 'VND',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      taxTerminology: 'VAT',
      paymentMethods: ['credit_card', 'debit_card', 'momo', 'vnpay'],
      complianceRequirements: ['PDPD_CONSENT'],
      onboardingFlow: 'standard',
    }),
    AU: Object.freeze({
      countryCode: 'AU',
      currencyCode: 'AUD',
      locale: 'en-US',
      timezone: 'Australia/Sydney',
      taxTerminology: 'GST',
      paymentMethods: ['credit_card', 'debit_card', 'bank_transfer', 'apple_pay', 'google_pay'],
      complianceRequirements: ['PRIVACY_ACT_CONSENT', 'PCI_DSS'],
      onboardingFlow: 'standard',
    }),
    CA: Object.freeze({
      countryCode: 'CA',
      currencyCode: 'CAD',
      locale: 'en-US',
      timezone: 'America/Toronto',
      taxTerminology: 'GST',
      paymentMethods: ['credit_card', 'debit_card', 'bank_transfer', 'apple_pay', 'google_pay'],
      complianceRequirements: ['PIPEDA_CONSENT', 'PCI_DSS'],
      onboardingFlow: 'standard',
    }),
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_REGIONAL_CONFIG: RegionalConfig = REGIONAL_CONFIGS['US']!;

/**
 * Returns the regional config for a country code. Falls back to US
 * defaults when the country is unknown — never throws.
 */
export function getRegionalConfig(countryCode: string): RegionalConfig {
  const upper = countryCode?.toUpperCase();
  if (upper && REGIONAL_CONFIGS[upper]) {
    return REGIONAL_CONFIGS[upper]!;
  }
  return DEFAULT_REGIONAL_CONFIG;
}

/**
 * Returns true when a regional config exists for the given country.
 */
export function isRegionSupported(countryCode: string): boolean {
  const upper = countryCode?.toUpperCase();
  return Boolean(upper && REGIONAL_CONFIGS[upper]);
}

/**
 * Returns the list of countries that use the given onboarding flow.
 */
export function getCountriesForOnboardingFlow(
  flow: OnboardingFlow,
): readonly string[] {
  return Object.values(REGIONAL_CONFIGS)
    .filter((c) => c.onboardingFlow === flow)
    .map((c) => c.countryCode);
}
