# International Expansion

> Phase 10 Prompt 93 — Global markets: localisation, currencies,
> locale-aware formatting, tax terminology, multi-language OCR,
> regional payment methods, compliance, time zones.

This document describes how BillLens supports users across multiple
countries, languages, and regulatory regimes.

## 1. Supported Locales

**Module:** `src/domain/i18n/locale-model.ts`

21 locales are supported, spanning 12 countries and 17 languages:

| Locale | Language | Country | RTL |
|--------|----------|---------|-----|
| `en-US` | English | United States | no |
| `en-GB` | English | United Kingdom | no |
| `en-IN` | English | India | no |
| `hi-IN` | Hindi | India | no |
| `ta-IN` | Tamil | India | no |
| `te-IN` | Telugu | India | no |
| `kn-IN` | Kannada | India | no |
| `ml-IN` | Malayalam | India | no |
| `bn-IN` | Bengali | India | no |
| `mr-IN` | Marathi | India | no |
| `es-ES` | Spanish | Spain | no |
| `fr-FR` | French | France | no |
| `de-DE` | German | Germany | no |
| `pt-BR` | Portuguese | Brazil | no |
| `ar-SA` | Arabic | Saudi Arabia | **yes** |
| `zh-CN` | Chinese | China | no |
| `ja-JP` | Japanese | Japan | no |
| `ko-KR` | Korean | Korea | no |
| `id-ID` | Indonesian | Indonesia | no |
| `th-TH` | Thai | Thailand | no |
| `vi-VN` | Vietnamese | Vietnam | no |

`isLocaleSupported(locale)` / `getLocaleConfig(locale)` /
`getDefaultLocale()` are the public API. `getDefaultLocale()` always
returns `en-US` as the fallback.

## 2. Locale-Aware Formatting

**Module:** `src/domain/i18n/locale-formatter.ts`

All formatting uses `Intl.NumberFormat` and `Intl.DateTimeFormat`,
which are available in React Native and produce locale-correct output
on the user's device.

### 2.1 Amount formatting

```ts
formatAmountMinor(125050, 'INR', 'en-IN')  // '₹1,250.50'
formatAmountMinor(125050, 'USD', 'en-US')  // '$1,250.50'
formatAmountMinor(1250,    'JPY', 'ja-JP')  // '¥1,250'  (no decimals)
formatAmountMinor(125050, 'KWD', 'ar-SA')  // 3 decimals
formatAmountMinor(1250,    'VND', 'vi-VN')  // no decimals
```

**Financial safety:** amounts are ALWAYS integer minor units in
storage. The formatter divides by `10^exponent` for display only —
the original minor-unit value is never altered.

### 2.2 Currency exponents

| Exponent | Currencies |
|----------|-----------|
| 0 | `JPY`, `KRW`, `VND`, `CLP`, `COP` |
| 2 | `USD`, `EUR`, `GBP`, `INR`, `AUD`, … (most) |
| 3 | `KWD`, `BHD`, `OMR`, `JOD` |

Unknown currencies default to exponent 2.

### 2.3 Date formatting

```ts
formatDate('2026-01-15T12:00:00.000Z', 'en-US', 'short')  // '1/15/26'
formatDate('2026-01-15T12:00:00.000Z', 'en-US', 'medium') // 'Jan 15, 2026'
formatDate('2026-01-15T12:00:00.000Z', 'en-US', 'long')   // 'January 15, 2026'
```

### 2.4 Number + percentage formatting

```ts
formatNumber(1234567, 'en-US')          // '1,234,567'
formatNumber(1234567, 'de-DE')          // '1.234.567'
formatPercentage(0.75, 'en-US')         // '75%'
formatPercentage(0.1234, 'en-US', 2)    // '12.34%'
```

### 2.5 Relative time labels (Hermes compatibility)

**Module:** `src/presentation/utils/relative-time.ts`

The activity feed and the drafts inbox label rows with relative time
("5 minutes ago", "Yesterday"). `Intl.RelativeTimeFormat` is an
**optional** ECMA-402 API. Hermes implements only `Intl.Collator`,
`Intl.DateTimeFormat`, `Intl.NumberFormat` and `getCanonicalLocales`;
`Intl.RelativeTimeFormat`, `Intl.Segmenter` and `Intl.DisplayNames` are
`undefined`, so `new Intl.RelativeTimeFormat(...)` throws
`TypeError: undefined cannot be used as a constructor`.

`formatRelativeTime(iso, now?)` therefore probes the constructor once,
caches it against the constructor reference, and falls back when the
API is absent or throws. It never throws, and returns `''` for an
invalid timestamp so a single malformed row cannot take down a screen.

| Input | Intl available | Fallback (no Intl.RelativeTimeFormat) |
|-------|----------------|--------------------------------------|
| `< 1 minute` past | `Just now` (fixed English) | `Just now` |
| `< 1 minute` future | `In a few seconds` (fixed English) | `In a few seconds` |
| same day, `< 1 hour` | `N minutes ago` (localised) | `N minute(s) ago` |
| same day, `>= 1 hour` | `N hours ago` (localised) | `N hour(s) ago` |
| previous day | `yesterday` (localised) | `Yesterday` |
| next day | `tomorrow` (localised) | `Tomorrow` |
| 2–6 days away | `N days ago` / `in N days` (localised) | `N days ago` / `In N days` |
| older than 6 days | `Date.toLocaleDateString()` | `Date.toLocaleDateString()` |
| invalid timestamp / invalid `now` | `''` | `''` |

Localisation behaviour: when Intl is present the wording follows the
device locale, unchanged from before. When it is absent the English
fallback above is used; calendar dates still follow the device locale.
Translated relative strings require an Intl-capable runtime or a future
locale catalogue — no third-party service is introduced.

Regression tests in
`src/presentation/screens/__tests__/activity-screen.test.tsx` replace
`Intl.RelativeTimeFormat` with `undefined` and with a throwing
constructor, and render the Activity screen with several rows.

> Do not add `Intl.Segmenter`, `Intl.DisplayNames`, `Intl.ListFormat`,
> `Intl.PluralRules` or `Intl.Locale` calls without a feature check — Hermes
> does not implement them. `Intl.NumberFormat` `notation`/`style: 'unit'` and
> `Intl.DateTimeFormat` `dateStyle`/`timeStyle` are also unsupported, so keep
> date formatting to explicit `year`/`month`/`day` parts.

## 3. Regional Configuration

**Module:** `src/domain/i18n/regional-config.ts`

16 regions registered, each with currency, locale, timezone, tax
terminology, payment methods, compliance requirements, and onboarding
flow.

| Region | Currency | Tax term | Onboarding | Payments |
|--------|----------|----------|------------|----------|
| US | USD | Sales Tax | `us_sales_tax` | card, apple/google pay |
| GB | GBP | VAT | `eu_vat` | card, apple/google pay |
| IN | INR | GST | `india_upi` | upi, card, net_banking, wallet |
| DE | EUR | VAT | `eu_vat` | card, sepa, paypal |
| JP | JPY | Consumption Tax | `standard` | card, konbini, pay_pay |
| SA | SAR | VAT | `standard` | mada, stc_pay |
| CN | CNY | VAT | `standard` | wechat_pay, alipay |
| KR | KRW | VAT | `standard` | kakao_pay, toss |
| BR | BRL | VAT | `standard` | pix, boleto |
| AU | AUD | GST | `standard` | card, apple/google pay |
| CA | CAD | GST | `standard` | card, apple/google pay |

`getRegionalConfig(countryCode)` falls back to US defaults when the
country is unknown — never throws.

### 3.1 Onboarding flows

| Flow | Used for | Differences |
|------|----------|-------------|
| `standard` | Most regions | Email + phone, default currency |
| `india_upi` | India | Adds UPI ID collection + GST info |
| `eu_vat` | EU + UK | Adds VAT number collection |
| `us_sales_tax` | US | Adds state selection for sales tax |

## 4. Multi-Language OCR

**Module:** `src/domain/i18n/multi-language-ocr.ts`

19 languages supported. Each has display name, native name, receipt
format patterns, date format, and number format.

`detectReceiptLanguage(extractedText)` uses Unicode script detection:

1. Walks Devanagari → Tamil → Telugu → Kannada → Malayalam → Bengali
   → Arabic → Thai → CJK → Hiragana/Katakana → Hangul.
2. Falls back to Latin-script hints for German/French/Spanish/
   Portuguese/Indonesian/Vietnamese.
3. Defaults to English.

**Note:** this is a heuristic, not a full language classifier.
Production OCR pipelines should layer a dedicated language-detection
library on top.

```ts
detectReceiptLanguage('कॉफी शॉप\nकुल: ₹100')  // 'hi'
detectReceiptLanguage('Rechnung\nMwSt: 19%')  // 'de'
detectReceiptLanguage('Facture\nTVA: 20%')    // 'fr'
detectReceiptLanguage('Coffee Shop\nTotal')    // 'en'
```

## 5. Timezone Handling

**Module:** `src/domain/i18n/timezone-handler.ts`

All timestamps are stored as UTC ISO strings. Conversion to the user's
timezone happens only at display time.

```ts
getUserTimezone()  // 'America/New_York' (from device)

convertToUserTimezone('2026-01-01T12:00:00.000Z', 'Asia/Kolkata')
// → '2026-01-01T17:30:00.000+05:30'

formatInTimezone('2026-01-01T12:00:00.000Z', 'Asia/Tokyo', 'YYYY-MM-DD HH:mm')
// → '2026-01-01 21:00'

getTimezoneOffset('America/New_York', '2026-01-15T12:00:00.000Z')
// → -300 (UTC-5 in January, EST)
getTimezoneOffset('America/New_York', '2026-07-15T12:00:00.000Z')
// → -240 (UTC-4 in July, EDT — DST active)
```

`getTimezoneOffset()` correctly handles daylight saving time because
it uses `Intl.DateTimeFormat` under the hood.

## 6. Regional Compliance

**Module:** `src/domain/i18n/regional-compliance.ts`

22 compliance requirements across 13 regions.

| Region | Requirements |
|--------|-------------|
| IN | GST_DISPLAY, DPDP_CONSENT, UPI_COMPLIANCE |
| EU | GDPR_CONSENT, GDPR_RIGHT_TO_ERASURE, GDPR_DATA_PORTABILITY, VAT_MOSS |
| US | CCPA_NOTICE, PCI_DSS, STATE_TAX_DISPLAY |
| BR | LGPD_CONSENT, PIX_COMPLIANCE |
| CN | PIPL_CONSENT, PIPL_CROSS_BORDER |
| JP | APPI_CONSENT, CONSUMPTION_TAX_DISPLAY |
| KR | PIPC_CONSENT |
| ID | PDP_LAW_CONSENT |
| TH | PDPA_CONSENT |
| VN | PDPD_CONSENT |
| AU | PRIVACY_ACT_CONSENT |
| CA | PIPEDA_CONSENT |
| SA | PCI_DSS |

```ts
getComplianceForRegion('IN')
// → [GST_DISPLAY, DPDP_CONSENT, UPI_COMPLIANCE]

getMandatoryComplianceForRegion('EU')
// → [GDPR_CONSENT, GDPR_RIGHT_TO_ERASURE, GDPR_DATA_PORTABILITY]
// (VAT_MOSS filtered out as non-mandatory)

hasMandatoryCompliance('ZZ')  // false — no requirements
```

Each region's `RegionalConfig.complianceRequirements` list aligns with
this registry — there is one source of truth.

## 7. Country-Specific Onboarding

The onboarding flow is selected by `RegionalConfig.onboardingFlow`:

### 7.1 `standard` flow
1. Welcome screen
2. Guest name entry
3. Permissions (camera, notifications)
4. Complete → home dashboard

### 7.2 `india_upi` flow
1. Welcome screen (English + Hindi toggle)
2. Phone number (for UPI linking)
3. UPI ID collection (optional, can skip)
4. GST info (for business users, optional)
5. Permissions
6. Complete

### 7.3 `eu_vat` flow
1. Welcome screen
2. Email + GDPR consent (mandatory, before any data collection)
3. VAT number (for business users, optional)
4. Permissions
5. Complete

### 7.4 `us_sales_tax` flow
1. Welcome screen
2. Email
3. State selection (for sales tax calculation)
4. CCPA notice (mandatory for California residents)
5. Permissions
6. Complete

## 8. RTL Support

Arabic (`ar-SA`) is the only RTL locale. The presentation layer
uses `I18nManager` from React Native to flip the layout. All
components must be tested in RTL mode before declaring them done.

`getRtlLocales()` returns the list of RTL locales (currently only
`ar-SA`).

## 9. Translation Pipeline

Translation strings live in `src/i18n/locales/{locale}.json` (Phase 11
work — not yet implemented). The pipeline:

1. Developer adds a new key to `en-US.json`.
2. CI extracts new keys + pushes to translation vendor (Lokalise or
   Crowdin).
3. Vendor returns translated JSON for each supported locale.
4. CI verifies completeness (no missing keys per locale).
5. Translations are bundled into the app binary.

Until Phase 11, the app uses English-only strings; locale-aware
formatting (amounts, dates, numbers) is already wired up via
`locale-formatter.ts`.

## 10. Regional Payment Methods

| Region | Native methods |
|--------|---------------|
| India | UPI, Net Banking, Wallets |
| Brazil | Pix, Boleto |
| China | WeChat Pay, Alipay, UnionPay |
| Japan | Konbini, PayPay |
| Korea | KakaoPay, Toss |
| Indonesia | GoPay, OVO, QRIS |
| Thailand | PromptPay, TrueMoney |
| Vietnam | MoMo, VNPay |
| Saudi Arabia | Mada, STC Pay |

These methods are surfaced in the regional onboarding flow and in the
settlement screen when both parties are in the same region.

## 11. Tax Terminology

| Region | Term | Display |
|--------|------|---------|
| India | GST | "GST (incl. ₹X)" |
| EU + UK | VAT | "VAT (incl. €X)" |
| US | Sales Tax | "Sales Tax (incl. $X)" |
| Japan | Consumption Tax | "Consumption Tax (incl. ¥X)" |
| Australia | GST | "GST (incl. $A X)" |
| Canada | GST | "GST (incl. $C X)" |

`RegionalConfig.taxTerminology` is the canonical string; the
presentation layer uses it to label tax lines on receipts and
expenses.

## 12. Data Residency

Each region's data residency is governed by the org's
`OrgSettings.dataResidency` setting (enterprise feature). For
consumer users (no org), data residency defaults to the region of
the user's country code:

| User country | Storage region |
|--------------|---------------|
| US, CA | us-east-1 |
| GB, DE, FR, ES | eu-central-1 |
| IN | ap-south-1 |
| JP, KR | ap-northeast-1 |
| AU | ap-southeast-2 |
| BR | sa-east-1 |

Cross-region data transfer is logged in the audit trail.

## 13. Compliance Enforcement Points

| Compliance | Enforcement point |
|-----------|-------------------|
| GDPR_CONSENT | Onboarding (must accept before data collection) |
| GDPR_RIGHT_TO_ERASURE | Settings → Delete account (30-day SLA) |
| CCPA_NOTICE | Onboarding for California residents |
| GST_DISPLAY | Receipt render (above ₹5 000) |
| PIPL_CROSS_BORDER | Data export from CN region requires review |
| PCI_DSS | All card data tokenised at PSP; never stored |

## 14. Future Work

- Translation pipeline (Phase 11)
- Dynamic locale switching without app restart (Phase 11)
- Regional receipt templates (Phase 12)
- Currency conversion at expense entry (Phase 13)
- Local tax calculation engine (Phase 13)
- Regional payment integrations (UPI live in Phase 11, Pix in 12)
