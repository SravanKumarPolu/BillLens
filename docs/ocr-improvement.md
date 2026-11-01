# OCR Improvement

This document describes the BillLens OCR improvement system
(Phase 9 Prompt 85). The system analyzes user corrections to improve
the OCR engine, while preserving user privacy.

## CRITICAL contracts

1. **NEVER upload user receipts to the training dataset without explicit
   opt-in.** The `consent-manager.ts` module defaults to the MOST
   conservative consent scope (`anonymous_stats_only` with
   `consentGiven=false`). Training on individual receipts requires BOTH
   `scope='individual_receipts'` AND `consentGiven=true`.
2. **Correction analysis uses structured field-level diff data, NOT raw
   image scraping.** The `field-level-diff.ts` module computes STRUCTURED
   diffs between extracted and corrected values, with all values
   ANONYMIZED to structural patterns. The diff NEVER contains raw receipt
   data, merchant names, amounts, dates, or user IDs.
3. **The default consent is the MOST conservative.** No data of any kind
   is uploaded — not even anonymous aggregate statistics — until the user
   explicitly opts in.

## Consent manager

The consent scope is a strict hierarchy:

```
anonymous_stats_only ⊂ aggregated_patterns ⊂ individual_receipts
```

| Function | Returns `true` when |
|---|---|
| `canUseAnonymousStats` | `consentGiven === true` (any scope) |
| `canUseAggregatedPatterns` | `consentGiven === true` AND scope is `aggregated_patterns` or `individual_receipts` |
| `canUseReceiptForTraining` | `consentGiven === true` AND scope is `individual_receipts` |

Default consent (`getDefaultConsent(profileId)`):
- `scope = 'anonymous_stats_only'`
- `consentGiven = false`
- `consentVersion = '2025.01'`

Consent is reversible: `withdrawConsent(consent, withdrawnAt)` reverts to
the default and records `withdrawnAt`. After withdrawal, ALL three
`canUse...` checks return `false`.

## Field-level diff

The `computeDiff(extracted, corrected)` function returns a list of
`FieldLevelDiff` entries — one per field that was corrected. Each entry
contains:

- `fieldName`: one of `total`, `date`, `merchant`, `line_items`, `tax`,
  `subtotal`, `payment_method`.
- `extractedValuePattern`: an ANONYMIZED pattern of the extracted value
  (e.g. `<amount>`, `<date:YYYY-MM-DD>`, `<merchant:len=medium,has_digits>`).
- `correctedValuePattern`: an ANONYMIZED pattern of the corrected value.
- `extractionConfidence`: `high` / `medium` / `low` / `unknown`.
- `correctionType`: `value_change` / `format_change` / `field_added` /
  `field_removed`.

### Anonymization rules

| Field type | Pattern | What it captures |
|---|---|---|
| `total`, `subtotal`, `tax` | `<amount>` / `<non_amount>` | Whether the value looked like an amount |
| `date` | `<date:YYYY-MM-DD>` etc. | The date FORMAT (not the actual date) |
| `merchant` | `<merchant:len=medium,has_digits,has_special>` | Length category + character-class features |
| `payment_method` | `<payment_method:card>` etc. | Canonical payment-method token |
| `line_items` | `<line_items>` | Presence only (never item names) |

`diffContainsRawPii(diffs)` returns `true` if any raw PII (email, UPI VPA,
ISO date) leaked into the diff. Used by tests as a defensive assertion.

## Correction statistics

The `computeCorrectionStatistics(batches, options)` function aggregates
anonymized diffs across receipts into:

- `totalReceipts`, `totalCorrections`
- `fieldCorrectionRates[]`: per-field correction rate
- `commonPatterns[]`: top-N most common extracted→corrected pattern pairs
- `worstPerformingFields[]`: highest correction rate (min 5 occurrences)
- `correctionTypeCounts`: per-correction-type counts

`statisticsContainRawPii(stats)` returns `true` if any raw PII leaked
into the patterns. Used by tests as a defensive assertion.

## Failure analysis

The `categorizeFailure(input)` function categorizes an OCR failure into
one of 12 categories, in priority order:

1. `extraction_timeout`
2. `image_quality_poor`
3. `no_text_detected`
4. `field_missing_critical` (total, date, or merchant missing)
5. `total_mismatch`
6. `amount_unparseable`
7. `date_unparseable`
8. `merchant_unrecognized`
9. `line_items_empty`
10. `field_missing_optional`
11. `low_confidence`
12. `unknown`

`analyzeFailures(inputs)` aggregates failures across many receipts and
returns per-category counts + rates.

## Merchant pattern learner

The `learnMerchantPattern(patterns, learnedAt, patternId)` function
learns a regex template from AGGREGATED, ANONYMIZED correction patterns.

CRITICAL constraints:
- Requires a MINIMUM of 10 corrections before producing a pattern
  (`MIN_CORRECTIONS_FOR_PATTERN = 10`). Below that threshold, returns
  `null` to avoid overfitting to noise.
- The learned pattern is an ANONYMIZED regex template that captures the
  SHAPE of merchant names (length, character classes) — NEVER the actual
  merchant name.
- `patternContainsRawMerchantName(pattern)` returns `true` if a raw
  merchant name leaked into the pattern. Should always return `false`.

## Use case: AggregateCorrectionStatsUseCase

The use case:
1. Loads consent for each profile (default = most conservative).
2. Filters profiles by the requested aggregation level
   (`anonymous_stats_only` or `aggregated_patterns`).
3. Hashes profile IDs to anonymous IDs (FNV-1a 32-bit) before passing
   them to the repository — the repository never sees raw profile IDs.
4. Fetches correction records from the time window.
5. Computes aggregate statistics via `computeCorrectionStatistics`.

The output NEVER contains raw receipt data, merchant names, or user IDs.

## Privacy guarantees (test-enforced)

1. `getDefaultConsent(profileId)` returns the MOST conservative default
   (scope=`anonymous_stats_only`, consentGiven=`false`).
2. `canUseReceiptForTraining(default)` returns `false`.
3. `canUseReceiptForTraining(grantedAt='individual_receipts')` returns
   `true` ONLY when `consentGiven === true`.
4. `computeDiff(...)` never produces a diff containing raw values — all
   values are anonymized patterns.
5. `diffContainsRawPii(diffs)` returns `false` for any diff produced by
   `computeDiff`.
6. `computeCorrectionStatistics(...)` never produces statistics containing
   raw merchant names, user IDs, or receipt IDs in pattern values.
7. `learnMerchantPattern(...)` never produces a pattern containing a raw
   merchant name.
8. After `withdrawConsent(...)`, all `canUse...` checks return `false`.

## Test coverage

| Suite | Tests | What it verifies |
|---|---|---|
| `consent-manager.test.ts` | 50+ | Default is most conservative; training requires explicit opt-in; withdrawal reverts to default |
| `field-level-diff.test.ts` | 60+ | Raw values are anonymized; format vs value change detection; multiple-diff handling |
| `correction-statistics.test.ts` | 30+ | Aggregation correctness; no raw PII in stats; worst-performing fields |
