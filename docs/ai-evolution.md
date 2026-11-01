# AI Evolution

> Phase 10 Prompt 96 — enhanced AI capabilities that remain explainable, auditable, and advisory-only. **AI NEVER makes financial decisions.**

## 1. Goals

BillLens evolves its AI capabilities responsibly:

- **Better receipt understanding** — improve OCR field extraction quality.
- **Merchant recognition** — identify merchants from extracted text.
- **Spending categorisation** — suggest expense categories.
- **Intelligent duplicate detection** — find likely-duplicate expenses.
- **Personalised insights** — surface spending trends and saving opportunities.
- **Fraud-pattern detection** — flag unusual patterns (advisory only).
- **Natural-language search** — parse "expenses over $50 at Starbucks last month".
- **Smart budgeting** — suggest budget limits per category.

Every AI capability is **advisory only**. The user makes every financial decision. The AI explains its output and is auditable.

## 2. The AI safety constitution

Every capability has a safety contract (`AiSafetyContract`). Four invariants are **non-negotiable** — TypeScript enforces them as literal types:

| Invariant                       | Type          | Meaning |
|---------------------------------|---------------|---------|
| `makesFinancialDecisions`       | `false`       | AI NEVER makes financial decisions |
| `isAdvisoryOnly`                | `true`        | AI output is a suggestion, never a command |
| `explainable`                   | `true`        | Every AI output includes a `reasoning` field |
| `auditable`                     | `true`        | Every AI invocation is logged for audit |

Two per-capability fields may vary:

| Field                | Type      | Description |
|----------------------|-----------|-------------|
| `requiresHumanReview`| `boolean` | Whether a human must review the AI output before it takes effect |
| `consentRequired`    | `boolean` | Whether the user must opt in to this capability |

### 2.1 Per-capability review + consent

| Capability                 | Requires review | Consent required |
|----------------------------|-----------------|------------------|
| receipt_understanding      | ✓               | ✓                |
| merchant_recognition       | —               | —                |
| spending_categorisation    | ✓               | —                |
| duplicate_detection        | ✓               | —                |
| personalised_insights      | —               | ✓                |
| fraud_pattern_detection    | ✓ (ALWAYS)      | —                |
| natural_language_search    | —               | —                |
| smart_budgeting            | ✓               | —                |

## 3. Output validation

`validateAiOutput(capability, output)` is called by the application layer BEFORE showing AI output to the user. It rejects any output that:

1. **Lacks a `reasoning` field** (string, non-empty). Every output must be explainable.
2. **Contains forbidden decision phrases**: `auto-categorised`, `auto-blocked`, `auto-approved`, `auto-settled`, `auto-paid`, `auto-deleted`, `auto-merged`, `auto-refunded`, `blocked transaction`, `rejected transaction`, `declined transaction`, `executed payment`, `processed refund`.
3. **Has a truthy `decision` field** (defensive).
4. **Has `autoExecute=true`** (defensive).
5. **Has `blockTransaction=true`** (defensive).
6. **Has `executeAction=true`** (defensive).
7. For `fraud_pattern_detection`: contains the phrases `block this expense` or `reject this expense` — the recommendation MUST say `review this expense`.

When validation fails, the application layer logs the violation and shows a fallback message instead of the AI output.

## 4. Capabilities

### 4.1 Receipt understanding

Extracts structured fields from receipt images (merchant, total, line items, date, tax). Output is presented to the user for review; the user confirms before any field is saved.

Consent is required because OCR data is processed by an AI model. The consent prompt is shown once at first use, with the option to disable later.

### 4.2 Merchant recognition

Recognises merchant name + category from extracted receipt text. The module operates on **extracted text** (already produced by OCR), not on raw receipt images. The matched pattern is **anonymized** (e.g. `starbucks*`), not the raw text.

Pattern matching is done against a static in-memory table of ~35 known merchants across 10 categories. Confidence:

- 0.95 — single match, pattern > 4 chars.
- 0.85 — multiple matches, longest-pattern wins.
- 0.75 — short pattern (≤ 4 chars, more likely a false positive).

### 4.3 Spending categorisation

Suggests an expense category based on three signals:

1. **Merchant** (confidence 0.85+) — strongest signal.
2. **Title keywords** (confidence 0.55-0.75).
3. **Amount heuristics** (confidence 0.30) — weak signal.

Multiple signals combine via probabilistic OR (`1 - ∏(1 - cᵢ)`), capped at 0.95.

**CRITICAL**: the function returns a sorted list of suggestions. The user picks the category; the AI NEVER auto-categorises.

### 4.4 Intelligent duplicate detection

Detects potential duplicates based on four signals:

| Signal    | Weight | Similarity computation                                |
|-----------|--------|-------------------------------------------------------|
| amount    | 0.40   | exact match → 1.0; within 2% → 0.95; within 10% → 0.50 |
| date      | 0.30   | 1 - (hoursApart / 24)                                 |
| title     | 0.20   | 1 - (levenshtein / max(len))                          |
| merchant  | 0.10   | Levenshtein on merchant names                         |

Combined confidence is a weighted average. `isDuplicate=true` when confidence ≥ 0.85.

**CRITICAL**: the function returns `{ isDuplicate, confidence, signals }`. The application layer presents this as a warning. The user decides whether to keep both, merge, or delete. NEVER auto-deletes.

### 4.5 Personalised insights

Generates advisory insights from a privacy-safe spending summary:

| Insight type          | Trigger                                              | Severity |
|-----------------------|------------------------------------------------------|----------|
| spending_trend        | Total spend up/down > 15% vs last month              | warning / info |
| category_increase     | A category up > 50% vs last month                    | warning  |
| duplicate_warning     | Potential duplicates detected                        | warning  |
| settlement_reminder   | Pending settlements awaiting confirmation            | suggestion |
| budget_suggestion     | A category > 30% above monthly average               | suggestion |
| saving_opportunity    | A category went from non-zero to zero this month     | info     |

**CRITICAL**: insights NEVER auto-execute. Even insights with `actionable: true` only navigate the user to a screen — they don't perform an action.

### 4.6 Fraud pattern detection

Detects unusual patterns and emits an advisory. The advisory's `recommendation` field ALWAYS says "review this expense" — NEVER "block", "reject", "refund", "cancel", or "decline".

| Signal                | Detection                                                |
|-----------------------|----------------------------------------------------------|
| unusual_amount        | amount > 5× average + 3σ                                  |
| unusual_frequency     | 11+ expenses in a 1-hour window                          |
| unusual_merchant      | new merchant + amount > 2× average                       |
| unusual_time          | expense at 3-5 AM (UTC)                                  |
| unusual_location      | location differs from user's usual (stub — needs geo)   |
| duplicate_pattern     | same amount + same merchant within 1 hour                |
| impossible_sequence   | B created after A but timestamped before A (stub)        |

`isAdvisorySafe(advisory)` is a defense-in-depth check the application layer runs before display. It rejects any advisory whose `recommendation` contains block/reject/refund/cancel/decline language, or that lacks "review".

**CRITICAL**: fraud detection is ADVISORY ONLY. It NEVER blocks transactions. The user/admin reviews and decides whether to dispute, refund, or ignore.

### 4.7 Natural-language search

Parses queries like "show me expenses over $50 at Starbucks last month" into structured filters:

```ts
{
  intent: 'find_expense',
  filters: {
    amountRange: { min: 5000 },         // bucketed to minor units
    merchant: 'STARBUCKS',              // anonymized canonical name
    dateRange: { from: '2026-06-01...', to: '2026-06-30...' },
    category: undefined,
  },
  originalQuery: 'show me expenses over $50 at Starbucks last month',
}
```

- Amount ranges are bucketed (parsed from "$50" to 5000 minor units, ×100).
- Merchant names are **anonymized**: the parser returns the canonical uppercase name (e.g. `STARBUCKS`), not the raw user input.
- Date expressions resolve relative to `now` (injected for testability): `today`, `yesterday`, `this week`, `last week`, `this month`, `last month`, `this year`, `last year`.

The module is **read-only** — it parses a query, it does NOT modify any data.

### 4.8 Smart budgeting

Suggests per-category budget limits from historical spending:

```
suggestedLimit = avg + 1σ
capped at 1.5 × avg
rounded to nearest 1000 minor units
```

Categories with < 3 months of data get a low-confidence note in the `reasoning` field. Categories with 0 historical spend are NOT suggested.

**CRITICAL**: the function returns SUGGESTIONS only. The user sets the actual budget. The AI NEVER auto-enforces a budget or blocks an expense for being over-budget. (Over-budget expenses trigger an advisory warning via personalised-insights, not a block.)

## 5. Audit trail

Every AI invocation is logged with:

- The capability invoked.
- The input (privacy-safe — no PII, no expense amounts).
- The output.
- The user id (NOT the input data itself).
- The timestamp.
- Whether the output passed `validateAiOutput()`.
- Whether the user accepted, rejected, or ignored the suggestion.

Logs are retained for 90 days. Access to logs requires `auditor` role (see enterprise-permissions.ts).

## 6. Privacy

| Concern                                | Mitigation                                                |
|----------------------------------------|-----------------------------------------------------------|
| Raw receipt images uploaded to AI      | Receipt understanding runs on-device (OCR) — only extracted text is processed by AI |
| Raw user input persisted in NL search  | Only the parsed filters are persisted; `originalQuery` is shown in the UI but not stored in analytics |
| Individual expense amounts in insights | Insights operate on aggregated category totals, not individual expenses |
| Merchant PII                           | Merchant recognition returns an anonymized pattern (`starbucks*`), not the raw text |
| Consent for AI data processing         | `receipt_understanding` and `personalised_insights` require explicit consent |

## 7. Files

| File                                                                | Responsibility                                                |
|---------------------------------------------------------------------|---------------------------------------------------------------|
| `src/domain/ai/ai-safety-contract.ts`                               | Constitutional guard: makesFinancialDecisions=false etc.      |
| `src/domain/ai/merchant-recognition.ts`                             | Pattern-based merchant + category recognition (anonymized)    |
| `src/domain/ai/spending-categorisation.ts`                          | Multi-signal category suggestion (advisory)                   |
| `src/domain/ai/intelligent-duplicate-detection.ts`                  | Weighted-similarity duplicate detection (advisory)            |
| `src/domain/ai/personalised-insights.ts`                            | Advisory spending insights                                    |
| `src/domain/ai/fraud-detection.ts`                                  | Fraud-pattern advisories (NEVER blocks)                       |
| `src/domain/ai/natural-language-search.ts`                          | NL query → structured filters (read-only)                     |
| `src/domain/ai/smart-budgeting.ts`                                  | Budget suggestions (advisory)                                 |
| `src/domain/ai/index.ts`                                            | Barrel                                                        |
| `src/domain/ai/__tests__/ai-safety-contract.test.ts`                | Constitutional invariants + output validation                 |
| `src/domain/ai/__tests__/spending-categorisation.test.ts`           | Categorisation tests                                          |
| `src/domain/ai/__tests__/fraud-detection.test.ts`                   | Fraud tests + CRITICAL advisory-only checks                   |

## 8. Future work

- On-device LLM for natural-language search (privacy-preserving, no cloud round-trip).
- Federated learning for OCR improvement (model trains on user corrections, never uploads raw data).
- Confidence calibration: track when users accept/reject AI suggestions and adjust confidence thresholds.
- Per-user personalisation: adapt merchant recognition and categorisation based on the user's own corrections.
- Multi-modal receipt understanding: combine OCR text with image features (logo detection, layout analysis).
- Explainability dashboard: show users WHY the AI made each suggestion (which signals fired, with what weights).

## 9. What the AI NEVER does

This list is a hard contract, verified by tests:

- ❌ Auto-categorise an expense.
- ❌ Auto-merge or auto-delete a duplicate.
- ❌ Auto-block a transaction (fraud or otherwise).
- ❌ Auto-set a budget.
- ❌ Auto-settle a balance.
- ❌ Auto-pay a refund.
- ❌ Make any financial decision on behalf of the user.
- ❌ Operate without a `reasoning` field (every output must be explainable).
- ❌ Operate without an audit log entry (every invocation must be auditable).
