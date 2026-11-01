/**
 * Locale model — supported locales registry.
 *
 * Phase 10 Prompt 93: International Expansion.
 *
 * Defines the list of locales BillLens supports. Each locale has a
 * language code, country code, display name (in English), native
 * name (in the locale's own language), and an RTL flag (true for
 * Arabic).
 *
 * This module is PURE and READ-ONLY.
 *
 * See `docs/international-expansion.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupportedLocale =
  | 'en-US'
  | 'en-GB'
  | 'en-IN'
  | 'hi-IN'
  | 'ta-IN'
  | 'te-IN'
  | 'kn-IN'
  | 'ml-IN'
  | 'bn-IN'
  | 'mr-IN'
  | 'es-ES'
  | 'fr-FR'
  | 'de-DE'
  | 'pt-BR'
  | 'ar-SA'
  | 'zh-CN'
  | 'ja-JP'
  | 'ko-KR'
  | 'id-ID'
  | 'th-TH'
  | 'vi-VN';

export interface LocaleConfig {
  readonly locale: SupportedLocale;
  /** BCP-47 language code (e.g. 'en', 'hi'). */
  readonly languageCode: string;
  /** ISO 3166-1 alpha-2 country code (e.g. 'US', 'IN'). */
  readonly countryCode: string;
  /** English display name (e.g. 'English (United States)'). */
  readonly displayName: string;
  /** Native display name (e.g. 'English (United States)'). */
  readonly nativeName: string;
  /** Right-to-left rendering (true for Arabic). */
  readonly rtl: boolean;
}

// ---------------------------------------------------------------------------
// Supported locales registry
// ---------------------------------------------------------------------------

export const SUPPORTED_LOCALES: readonly LocaleConfig[] = Object.freeze([
  {
    locale: 'en-US',
    languageCode: 'en',
    countryCode: 'US',
    displayName: 'English (United States)',
    nativeName: 'English (United States)',
    rtl: false,
  },
  {
    locale: 'en-GB',
    languageCode: 'en',
    countryCode: 'GB',
    displayName: 'English (United Kingdom)',
    nativeName: 'English (United Kingdom)',
    rtl: false,
  },
  {
    locale: 'en-IN',
    languageCode: 'en',
    countryCode: 'IN',
    displayName: 'English (India)',
    nativeName: 'English (India)',
    rtl: false,
  },
  {
    locale: 'hi-IN',
    languageCode: 'hi',
    countryCode: 'IN',
    displayName: 'Hindi (India)',
    nativeName: 'हिन्दी (भारत)',
    rtl: false,
  },
  {
    locale: 'ta-IN',
    languageCode: 'ta',
    countryCode: 'IN',
    displayName: 'Tamil (India)',
    nativeName: 'தமிழ் (இந்தியா)',
    rtl: false,
  },
  {
    locale: 'te-IN',
    languageCode: 'te',
    countryCode: 'IN',
    displayName: 'Telugu (India)',
    nativeName: 'తెలుగు (భారతదేశం)',
    rtl: false,
  },
  {
    locale: 'kn-IN',
    languageCode: 'kn',
    countryCode: 'IN',
    displayName: 'Kannada (India)',
    nativeName: 'ಕನ್ನಡ (ಭಾರತ)',
    rtl: false,
  },
  {
    locale: 'ml-IN',
    languageCode: 'ml',
    countryCode: 'IN',
    displayName: 'Malayalam (India)',
    nativeName: 'മലയാളം (ഇന്ത്യ)',
    rtl: false,
  },
  {
    locale: 'bn-IN',
    languageCode: 'bn',
    countryCode: 'IN',
    displayName: 'Bengali (India)',
    nativeName: 'বাংলা (ভারত)',
    rtl: false,
  },
  {
    locale: 'mr-IN',
    languageCode: 'mr',
    countryCode: 'IN',
    displayName: 'Marathi (India)',
    nativeName: 'मराठी (भारत)',
    rtl: false,
  },
  {
    locale: 'es-ES',
    languageCode: 'es',
    countryCode: 'ES',
    displayName: 'Spanish (Spain)',
    nativeName: 'Español (España)',
    rtl: false,
  },
  {
    locale: 'fr-FR',
    languageCode: 'fr',
    countryCode: 'FR',
    displayName: 'French (France)',
    nativeName: 'Français (France)',
    rtl: false,
  },
  {
    locale: 'de-DE',
    languageCode: 'de',
    countryCode: 'DE',
    displayName: 'German (Germany)',
    nativeName: 'Deutsch (Deutschland)',
    rtl: false,
  },
  {
    locale: 'pt-BR',
    languageCode: 'pt',
    countryCode: 'BR',
    displayName: 'Portuguese (Brazil)',
    nativeName: 'Português (Brasil)',
    rtl: false,
  },
  {
    locale: 'ar-SA',
    languageCode: 'ar',
    countryCode: 'SA',
    displayName: 'Arabic (Saudi Arabia)',
    nativeName: 'العربية (السعودية)',
    rtl: true,
  },
  {
    locale: 'zh-CN',
    languageCode: 'zh',
    countryCode: 'CN',
    displayName: 'Chinese (China)',
    nativeName: '中文 (中国)',
    rtl: false,
  },
  {
    locale: 'ja-JP',
    languageCode: 'ja',
    countryCode: 'JP',
    displayName: 'Japanese (Japan)',
    nativeName: '日本語 (日本)',
    rtl: false,
  },
  {
    locale: 'ko-KR',
    languageCode: 'ko',
    countryCode: 'KR',
    displayName: 'Korean (Korea)',
    nativeName: '한국어 (대한민국)',
    rtl: false,
  },
  {
    locale: 'id-ID',
    languageCode: 'id',
    countryCode: 'ID',
    displayName: 'Indonesian (Indonesia)',
    nativeName: 'Bahasa Indonesia (Indonesia)',
    rtl: false,
  },
  {
    locale: 'th-TH',
    languageCode: 'th',
    countryCode: 'TH',
    displayName: 'Thai (Thailand)',
    nativeName: 'ไทย (ประเทศไทย)',
    rtl: false,
  },
  {
    locale: 'vi-VN',
    languageCode: 'vi',
    countryCode: 'VN',
    displayName: 'Vietnamese (Vietnam)',
    nativeName: 'Tiếng Việt (Việt Nam)',
    rtl: false,
  },
]);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const SUPPORTED_LOCALE_STRINGS: ReadonlySet<string> = new Set(
  SUPPORTED_LOCALES.map((l) => l.locale),
);

const LOCALE_BY_STRING = new Map<string, LocaleConfig>(
  SUPPORTED_LOCALES.map((l) => [l.locale, l] as const),
);

/**
 * Returns true when `locale` is one of the supported locale strings.
 * Case-sensitive (BCP-47 locale tags are case-insensitive in theory
 * but BillLens uses the canonical form).
 */
export function isLocaleSupported(locale: string): boolean {
  return SUPPORTED_LOCALE_STRINGS.has(locale);
}

/**
 * Returns the LocaleConfig for `locale`, or null when unsupported.
 *
 * Accepts the canonical locale string (e.g. 'en-US'). Does NOT
 * perform fuzzy matching — callers must normalise locale strings
 * before calling.
 */
export function getLocaleConfig(locale: string): LocaleConfig | null {
  return LOCALE_BY_STRING.get(locale) ?? null;
}

/**
 * Returns the default locale: en-US. Used as a fallback when the
 * user's preferred locale is unsupported.
 */
export function getDefaultLocale(): LocaleConfig {
  return LOCALE_BY_STRING.get('en-US')!;
}

/**
 * Returns the list of RTL locales (currently only ar-SA).
 */
export function getRtlLocales(): readonly LocaleConfig[] {
  return SUPPORTED_LOCALES.filter((l) => l.rtl);
}

/**
 * Returns the list of locales for a given country code (e.g. 'IN'
 * returns all 8 Indian locales).
 */
export function getLocalesForCountry(countryCode: string): readonly LocaleConfig[] {
  return SUPPORTED_LOCALES.filter((l) => l.countryCode === countryCode);
}
