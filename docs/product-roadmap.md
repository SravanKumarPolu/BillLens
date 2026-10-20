# Product Roadmap

This document describes the BillLens product roadmap framework. The
roadmap is **data-driven** — every feature must be validated against
real usage data from the privacy-safe analytics before
implementation begins.

The implementation lives in `src/domain/roadmap/`.

---

## 1. Overview

The product roadmap is built from **feature candidates** — 10
features selected from internal brainstorming + feedback analysis.
Each candidate is validated by the **feature validator**, which
pulls real usage data from the privacy-safe analytics (Prompt 83)
and the user feedback system (Prompt 82).

CRITICAL: **Every feature must be validated against user demand
before implementation.** A feature with no evidence of user demand
MUST NOT be implemented, no matter how promising it looks on paper.

The roadmap is then planned by the **roadmap planner**, which
distributes validated features across N quarters (default 4)
respecting:
  - Prerequisites (a feature ships AFTER its prerequisites).
  - Capacity per quarter (default 60 dev-days).
  - Risk level (high-risk features get an extra review quarter).

---

## 2. Feature candidates

File: `src/domain/roadmap/feature-candidate.ts`

10 feature candidates are tracked:

  1. `recurring_expenses` — Auto-create expenses on a schedule.
  2. `budget_tracking` — Set monthly budgets per category.
  3. `family_accounts` — Shared family group with role-based access.
  4. `business_workspaces` — Multi-tenant workspaces for SMBs.
  5. `ai_spending_insights` — On-device ML spending trends.
  6. `multi_language_ocr` — Hindi, Tamil, Bengali OCR support.
  7. `shared_shopping_lists` — Group-shared lists that convert to expenses.
  8. `expense_forecasting` — Forecast next month's spend.
  9. `calendar_integration` — Sync bills to the system calendar.
  10. `accounting_exports` — Export to CSV / XLSX / QuickBooks / Xero.

Each candidate carries:
  - `userDemandScore` (0..100) — INITIAL demand, overridden by the
    validator.
  - `implementationEffort` (`small` / `medium` / `large` / `xlarge`).
  - `estimatedValue` (1..5) — relative business value.
  - `riskLevel` (`low` / `medium` / `high`).
  - `prerequisites` — other feature keys that must ship first.

### Effort → dev-day ranges

  | Effort | Dev-days     |
  |--------|--------------|
  | small  | 1..5         |
  | medium | 5..15        |
  | large  | 15..40       |
  | xlarge | 40..120      |

---

## 3. Feature validator

File: `src/domain/roadmap/feature-validator.ts`

CRITICAL: the validator refuses to operate on any analytics source
other than `privacy_safe_analytics`. Feature decisions must be based
on redacted, aggregate analytics, never raw PII.

### Inputs

  | Field                    | Source                       | Required? |
  |--------------------------|------------------------------|-----------|
  | `feature`                | Feature candidate            | yes       |
  | `feedbackCount`          | Feedback system (Prompt 82)  | yes       |
  | `relatedFeatureAdoption` | Product analytics (Prompt 83)| yes       |
  | `userDemandScore`        | Initial score + analytics    | yes       |
  | `implementationCost`     | Engineering estimate         | yes       |
  | `estimatedUsersImpacted` | Product analytics (Prompt 83)| yes       |
  | `analyticsSource`        | MUST be `privacy_safe_analytics` | yes  |

### Thresholds

  - `userDemandScore >= 50`
  - `feedbackCount >= 20`
  - `relatedFeatureAdoption >= 0.3`
  - `estimatedUsersImpacted >= 0.1`
  - `cost/value ratio <= 10` (i.e. `implementationCost / estimatedValue <= 10`)

### Decision

`shouldImplement = true` ONLY if ALL of:
  - `userDemandScore >= 50`
  - `feedbackCount >= 20`
  - `relatedFeatureAdoption >= 0.3`
  - `cost/value tradeoff acceptable`

### Confidence level

  - `high`   — all 5 thresholds met.
  - `medium` — 3..4 thresholds met.
  - `low`    — fewer than 3 thresholds met.

### Recommended priority

  - `now`   — shouldImplement=true AND confidence=high.
  - `next`  — shouldImplement=true AND confidence=medium.
  - `later` — shouldImplement=false but at least one threshold met.
  - `never` — shouldImplement=false AND zero thresholds met.

### Evidence sources

Every validation result records `evidenceSources` — the list of
analytics sources that informed the decision. All evidence sources
are prefixed with `privacy_safe_analytics:` so it is auditable that
the decision was based on privacy-safe data.

### Conditions

  - When `shouldImplement=true`:
    - Ship after prerequisites.
    - High-risk features need a design review.
    - Re-validate analytics quarterly.
  - When `shouldImplement=false`:
    - Specific conditions to re-validate (e.g. "collect >= 20
      feedback entries before re-validation").

---

## 4. Roadmap planner

File: `src/domain/roadmap/roadmap-planner.ts`

Plans a quarterly roadmap from validated features.

### Inputs

  - `items` — array of `{ candidate, result, estimatedDevDays }`
    (only items with `result.shouldImplement = true` are planned).
  - `quarterCount` — number of quarters to plan (default 4).
  - `capacityPerQuarterDevDays` — capacity per quarter (default 60).
  - `deferHighRisk` — whether high-risk features get an extra review
    quarter (default true).

### Algorithm

  1. Filter to `shouldImplement=true` items.
  2. Sort by priority (`now` < `next` < `later`), then by user demand
     score descending.
  3. For each item, find the earliest quarter where:
     - All prerequisites have been scheduled in an earlier quarter.
     - The quarter has remaining capacity.
     - If `deferHighRisk` is true AND the item is high-risk, the
       quarter must be >= 2.
  4. Items that don't fit any quarter go into `deferredFeatures`.

### Output

  - `quarters` — array of `QuarterPlan` (label, entries, planned
    dev-days, capacity, isOverCapacity).
  - `totalFeatures` — count of features scheduled.
  - `totalDevDays` — sum of dev-days across all quarters.
  - `deferredFeatures` — feature keys that didn't fit.

### Prerequisites

A feature can declare prerequisites — other feature keys that must
ship first. The planner ensures a feature ships in a quarter STRICTLY
AFTER all its prerequisites. Transitive prerequisites (A → B → C)
are respected: C ships in a quarter after B, which ships after A.

If a prerequisite is not in the input items list (i.e. not scheduled),
the dependent feature is deferred.

### Risk-level deferral

When `deferHighRisk=true` (the default), high-risk features are
forced to ship in Q2 or later — this gives the team an extra quarter
to conduct a design review before implementation begins.

---

## 5. Privacy guarantees

  - The validator ONLY accepts `privacy_safe_analytics` as the
    analytics source. Raw analytics, manual estimates, or any other
    source are rejected at the input-validation layer.
  - Every validation result records `evidenceSources` — all prefixed
    with `privacy_safe_analytics:` — so it is auditable that the
    decision was based on privacy-safe data.
  - The feature candidates do NOT carry PII — only aggregate scores
    and effort estimates.
  - The roadmap planner does NOT consult individual user data — only
    the aggregate `shouldImplement` decision + the feature candidate
    metadata.

---

## 6. Example

Given the 10 feature candidates with their initial `userDemandScore`
values, the validator might produce:

  | Feature                | Demand | Feedback | Adoption | Cost | Value | shouldImplement? | Priority |
  |------------------------|--------|----------|----------|------|-------|------------------|----------|
  | recurring_expenses     | 65     | 35       | 0.4      | 10   | 4     | yes              | now      |
  | budget_tracking        | 55     | 25       | 0.35     | 20   | 4     | yes              | now      |
  | accounting_exports     | 70     | 40       | 0.5      | 10   | 5     | yes              | now      |
  | ai_spending_insights   | 60     | 22       | 0.4      | 30   | 4     | yes              | next     |
  | multi_language_ocr     | 50     | 20       | 0.3      | 12   | 3     | yes              | next     |
  | shared_shopping_lists  | 45     | 18       | 0.4      | 12   | 3     | no               | later    |
  | family_accounts        | 40     | 15       | 0.2      | 35   | 3     | no               | later    |
  | business_workspaces    | 35     | 10       | 0.15     | 80   | 4     | no               | never    |
  | expense_forecasting    | 30     | 8        | 0.1      | 30   | 3     | no               | never    |
  | calendar_integration   | 25     | 5        | 0.1      | 4    | 2     | no               | never    |

The planner would then schedule `recurring_expenses`, `budget_tracking`,
and `accounting_exports` in Q1 (assuming they fit within 60 dev-days
capacity), and `ai_spending_insights` in Q2 (it depends on
`budget_tracking`), and so on.

---

## 7. Re-validation

Analytics data evolves over time. The validator SHOULD be re-run
quarterly for every feature in the roadmap, including those already
implemented (to verify they're still meeting user-expectation
thresholds) and those deferred (to see if they've gathered enough
evidence to be re-prioritized).

The conditions on each validation result guide the re-validation
cadence — e.g. "collect >= 20 feedback entries before re-validation"
for features that didn't meet the feedback threshold.

---

## 8. References

  - `docs/product-analytics.md` — privacy-safe analytics (Prompt 83).
  - `docs/user-feedback-system.md` — feedback system (Prompt 82).
  - `docs/privacy-and-trust.md` — privacy commitments.
  - `src/domain/roadmap/` — implementation.
