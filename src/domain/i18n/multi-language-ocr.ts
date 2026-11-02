/**
 * Multi-language OCR support — receipt language detection + config.
 *
 * Phase 10 Prompt 93: International Expansion.
 *
 * Defines the languages BillLens OCR can recognise on receipts, and
 * provides a heuristic detector that inspects extracted text for
 * Unicode script markers (Devanagari for Hindi/Marathi, Tamil, etc.).
 *
 * This module is PURE and READ-ONLY.
 *
 * See `docs/international-expansion.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OcrLanguage =
  | 'en'
  | 'hi'
  | 'ta'
  | 'te'
  | 'kn'
  | 'ml'
  | 'bn'
  | 'mr'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt'
  | 'ar'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'id'
  | 'th'
  | 'vi';

export interface OcrLanguageConfig {
  readonly language: OcrLanguage;
  /** English display name. */
  readonly displayName: string;
  /** Native display name. */
  readonly nativeName: string;
  /** Common receipt layout patterns (descriptive, for OCR tuning). */
  readonly receiptFormats: readonly string[];
  /** Expected date format on receipts in this language. */
  readonly dateFormat: string;
  /** Expected number format on receipts in this language. */
  readonly numberFormat: string;
}

// ---------------------------------------------------------------------------
// OCR language registry
// ---------------------------------------------------------------------------

export const OCR_LANGUAGES: Readonly<Record<OcrLanguage, OcrLanguageConfig>> =
  Object.freeze({
    en: Object.freeze({
      language: 'en',
      displayName: 'English',
      nativeName: 'English',
      receiptFormats: ['merchant_top', 'items_table', 'totals_bottom', 'card_strip'],
      dateFormat: 'MM/DD/YYYY',
      numberFormat: '1,234.56',
    }),
    hi: Object.freeze({
      language: 'hi',
      displayName: 'Hindi',
      nativeName: 'हिन्दी',
      receiptFormats: ['merchant_top_devanagari', 'items_table', 'totals_bottom'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,234.56',
    }),
    ta: Object.freeze({
      language: 'ta',
      displayName: 'Tamil',
      nativeName: 'தமிழ்',
      receiptFormats: ['merchant_top_tamil', 'items_table'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,234.56',
    }),
    te: Object.freeze({
      language: 'te',
      displayName: 'Telugu',
      nativeName: 'తెలుగు',
      receiptFormats: ['merchant_top_telugu', 'items_table'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,234.56',
    }),
    kn: Object.freeze({
      language: 'kn',
      displayName: 'Kannada',
      nativeName: 'ಕನ್ನಡ',
      receiptFormats: ['merchant_top_kannada', 'items_table'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,234.56',
    }),
    ml: Object.freeze({
      language: 'ml',
      displayName: 'Malayalam',
      nativeName: 'മലയാളം',
      receiptFormats: ['merchant_top_malayalam', 'items_table'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,234.56',
    }),
    bn: Object.freeze({
      language: 'bn',
      displayName: 'Bengali',
      nativeName: 'বাংলা',
      receiptFormats: ['merchant_top_bengali', 'items_table'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,234.56',
    }),
    mr: Object.freeze({
      language: 'mr',
      displayName: 'Marathi',
      nativeName: 'मराठी',
      receiptFormats: ['merchant_top_devanagari', 'items_table'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,234.56',
    }),
    es: Object.freeze({
      language: 'es',
      displayName: 'Spanish',
      nativeName: 'Español',
      receiptFormats: ['merchant_top', 'items_table', 'iva_breakdown'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1.234,56',
    }),
    fr: Object.freeze({
      language: 'fr',
      displayName: 'French',
      nativeName: 'Français',
      receiptFormats: ['merchant_top', 'items_table', 'tva_breakdown'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1.234,56',
    }),
    de: Object.freeze({
      language: 'de',
      displayName: 'German',
      nativeName: 'Deutsch',
      receiptFormats: ['merchant_top', 'items_table', 'mwst_breakdown'],
      dateFormat: 'DD.MM.YYYY',
      numberFormat: '1.234,56',
    }),
    pt: Object.freeze({
      language: 'pt',
      displayName: 'Portuguese',
      nativeName: 'Português',
      receiptFormats: ['merchant_top', 'items_table', 'imposto_breakdown'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1.234,56',
    }),
    ar: Object.freeze({
      language: 'ar',
      displayName: 'Arabic',
      nativeName: 'العربية',
      receiptFormats: ['merchant_top_rtl', 'items_table_rtl'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,234.56',
    }),
    zh: Object.freeze({
      language: 'zh',
      displayName: 'Chinese',
      nativeName: '中文',
      receiptFormats: ['merchant_top', 'items_table'],
      dateFormat: 'YYYY/MM/DD',
      numberFormat: '1,234.56',
    }),
    ja: Object.freeze({
      language: 'ja',
      displayName: 'Japanese',
      nativeName: '日本語',
      receiptFormats: ['merchant_top', 'items_table', 'consumption_tax_breakdown'],
      dateFormat: 'YYYY/MM/DD',
      numberFormat: '1,234.56',
    }),
    ko: Object.freeze({
      language: 'ko',
      displayName: 'Korean',
      nativeName: '한국어',
      receiptFormats: ['merchant_top', 'items_table'],
      dateFormat: 'YYYY/MM/DD',
      numberFormat: '1,234.56',
    }),
    id: Object.freeze({
      language: 'id',
      displayName: 'Indonesian',
      nativeName: 'Bahasa Indonesia',
      receiptFormats: ['merchant_top', 'items_table', 'ppn_breakdown'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1.234,56',
    }),
    th: Object.freeze({
      language: 'th',
      displayName: 'Thai',
      nativeName: 'ไทย',
      receiptFormats: ['merchant_top', 'items_table', 'vat_breakdown'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,234.56',
    }),
    vi: Object.freeze({
      language: 'vi',
      displayName: 'Vietnamese',
      nativeName: 'Tiếng Việt',
      receiptFormats: ['merchant_top', 'items_table', 'vat_breakdown'],
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1.234,56',
    }),
  });

// ---------------------------------------------------------------------------
// Unicode script detection (heuristic, pure)
// ---------------------------------------------------------------------------

const SCRIPT_RANGES: readonly {
  readonly language: OcrLanguage;
  readonly pattern: RegExp;
}[] = [
  // Devanagari (Hindi + Marathi) — favour Hindi as default.
  { language: 'hi', pattern: /[\u0900-\u097F]/ },
  // Tamil
  { language: 'ta', pattern: /[\u0B80-\u0BFF]/ },
  // Telugu
  { language: 'te', pattern: /[\u0C00-\u0C7F]/ },
  // Kannada
  { language: 'kn', pattern: /[\u0C80-\u0CFF]/ },
  // Malayalam
  { language: 'ml', pattern: /[\u0D00-\u0D7F]/ },
  // Bengali
  { language: 'bn', pattern: /[\u0980-\u09FF]/ },
  // Arabic
  { language: 'ar', pattern: /[\u0600-\u06FF\u0750-\u077F]/ },
  // Thai
  { language: 'th', pattern: /[\u0E00-\u0E7F]/ },
  // CJK Unified Ideographs — Japanese shares these with Chinese; we
  // disambiguate Japanese via Hiragana/Katakana below.
  { language: 'zh', pattern: /[\u4E00-\u9FFF]/ },
  // Hiragana + Katakana → Japanese (overrides CJK).
  { language: 'ja', pattern: /[\u3040-\u309F\u30A0-\u30FF]/ },
  // Hangul (Korean)
  { language: 'ko', pattern: /[\uAC00-\uD7AF\u1100-\u11FF]/ },
];

// Latin-script language hints — these only fire when NO non-Latin
// script is detected AND a strong Latin-script signal is present.
// We deliberately use DISTINCTIVE words per language (avoiding
// shared pan-Romance words like "Total" / "Subtotal" / "Importe")
// so the first match wins reliably.
const LATIN_HINTS: readonly {
  readonly language: OcrLanguage;
  readonly pattern: RegExp;
}[] = [
  // German-specific words
  { language: 'de', pattern: /\b(MwSt|Betrag|Summe|Gesamt|Rechnung)\b/i },
  // French-specific words
  { language: 'fr', pattern: /\b(TVA|Montant|Facture|Hors)\b/i },
  // Spanish-specific words
  { language: 'es', pattern: /\b(IVA|Importe|Factura)\b/i },
  // Portuguese-specific words
  { language: 'pt', pattern: /\b(ICMS|Valor|Nota fiscal)\b/i },
  // Indonesian-specific words
  { language: 'id', pattern: /\b(PPN|Jumlah|Faktur)\b/i },
  // Vietnamese-specific words (with diacritics)
  { language: 'vi', pattern: /\b(Tổng|Tiền|Thuế|Hóa đơn)\b/ },
];

/**
 * Detects the receipt language from extracted text.
 *
 * Strategy:
 *  1. Walk SCRIPT_RANGES in order; return the first language whose
 *     Unicode pattern matches the text.
 *  2. If no non-Latin script matched, try LATIN_HINTS for German,
 *     French, Spanish, Portuguese, Indonesian, Vietnamese.
 *  3. Default to English ('en') when nothing else matches.
 *
 * Returns null when `extractedText` is empty or not a string.
 *
 * Note: this is a heuristic, NOT a language classifier. Production
 * OCR pipelines should use a dedicated language-detection library.
 */
export function detectReceiptLanguage(
  extractedText: string,
): OcrLanguage | null {
  if (typeof extractedText !== 'string' || extractedText.length === 0) {
    return null;
  }
  for (const { language, pattern } of SCRIPT_RANGES) {
    if (pattern.test(extractedText)) {
      return language;
    }
  }
  for (const { language, pattern } of LATIN_HINTS) {
    if (pattern.test(extractedText)) {
      return language;
    }
  }
  return 'en';
}

/**
 * Returns the OCR language config for a given language. Throws on
 * unknown language — a programming error.
 */
export function getOcrLanguageConfig(language: OcrLanguage): OcrLanguageConfig {
  const cfg = OCR_LANGUAGES[language];
  if (!cfg) {
    throw new Error(`Unknown OCR language: ${language}`);
  }
  return cfg;
}

/**
 * Returns true when `language` is a supported OCR language.
 */
export function isOcrLanguageSupported(language: string): boolean {
  return Boolean(language && OCR_LANGUAGES[language as OcrLanguage]);
}
