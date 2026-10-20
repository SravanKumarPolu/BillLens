# User Feedback System

> Phase 9 — Prompt 82
>
> BillLens ships an in-app feedback system that lets users submit general
> feedback, feature requests, bug reports, OCR corrections, NPS scores,
> and App Store review prompts. CRITICAL: every feedback body is
> PII-redacted before storage, bug reports NEVER upload local-only
> attachments, and review prompts NEVER interrupt financial tasks.

## Goals

1. Give users a clear channel to surface bugs, request features, and
   rate the app.
2. Capture NPS scores with strict eligibility gating.
3. Prompt for App Store reviews ONLY when the user is delighted AND
   idle — never during settlement, expense editing, UPI payment,
   backup/restore, or conflict resolution.
4. Never leak PII (file paths, attachments, exact amounts, UPI IDs,
   emails, payment references, raw OCR text) in stored feedback.

## Feedback types (6)

| Type                 | Body required | NPS score | Notes                                       |
| -------------------- | ------------- | --------- | ------------------------------------------- |
| `general`            | Yes           | No        | General comments                            |
| `feature_request`    | Yes           | No        | User-requested features                     |
| `bug_report`         | Yes           | No        | Attachment references stripped entirely    |
| `ocr_correction`     | Yes           | No        | Carries `ocrCorrection` metadata            |
| `nps`                | Optional      | Yes (0-10)| Single-question NPS survey                  |
| `app_store_review`   | Optional      | No        | Sentinel record when a review prompt fired  |

## Architecture

```
src/domain/feedback/
  feedback-model.ts          # Feedback entity + 6 types + NPS scoring
  feedback-redactor.ts       # redactFeedbackBody / redactFeedbackBodyForType
  review-prompt-guard.ts     # shouldPromptForReview — pure function

src/application/feedback/
  feedback-repository.port.ts                  # FeedbackRepository + ReviewPromptLedger
  submit-feedback.usecase.ts                   # redacts body, validates, persists
  submit-nps-survey.usecase.ts                 # NPS with 7-day / 5-expense / 90-day cooldown
  prompt-app-store-review.usecase.ts           # gated by domain guard

src/infrastructure/sqlite/
  sqlite-feedback-repository.ts                # BOTH ports over migration 0004 (v2.2.0)

src/presentation/screens/feedback/
  FeedbackScreen.tsx                           # Settings → Send feedback form (v2.2.0)

app/settings/feedback.tsx                      # /settings/feedback route (v2.2.0)
```

The domain layer has **zero** framework imports. The application layer
depends only on the domain layer + repository ports. The composition root
wires the shared `SqliteFeedbackRepository` into the `feedback` bucket
(submitFeedback + submitNpsSurvey + promptAppStoreReview).

## Local persistence & UI surface (v2.2.0)

The last documented Prompt 82 gap ("feedback UI surface pending
integration") is closed end-to-end:

- **Migration 0004** (`feedback_store`) creates `feedback_records` (the
  PII-redacted local store; CHECK-constrained types/scores/platforms) and
  `review_prompt_ledger` (one row per user — the 180-day cooldown source).
- **`SqliteFeedbackRepository`** re-redacts defensively on `save` (the same
  double-redaction contract as the metric adapter — an unsafe upstream
  caller cannot leak PII into the table), is idempotent by `id` (first
  write wins; a retried submission never rewrites history), and links NPS
  rows to users by EXACT id-prefix match (`substr(id, 1, ?) = ?` — never
  LIKE, so ids containing `%` or `_` cannot over-match). Corrupted
  `ocr_correction` JSON degrades to "no metadata" instead of crashing a
  read.
- **`FeedbackScreen`** (Settings → "Send feedback" → `/settings/feedback`)
  offers the three manual types (general / feature request / bug report),
  shows the privacy notice BEFORE submission, a live 0/4000 counter, and a
  contact opt-in that stores ONLY the boolean. The confirmation card says
  honestly that nothing leaves the device today. NPS and the App Store
  review prompt are deliberately NOT on this form — they stay
  eligibility-gated.
- The cloud feedback backend (support ticket creation, cross-user
  aggregation, upload of redacted records) is deferred until the Supabase
  project is provisioned. Because persisted bodies are already redacted,
  uploading them later requires no migration of `feedback_records`.

## Privacy contract

`redactFeedbackBody` is a **pure function** that runs before any feedback
is stored. It:

1. Removes `file://` URIs and absolute paths (`/data/`, `/var/`, `/Users/`,
   `/home/`, `/tmp/`, `/storage/`, `/Documents/`).
2. Replaces UPI IDs / VPAs (`name@bank`) with `[REDACTED:upi_id]`.
3. Replaces email addresses (`x@y.z`) with `[REDACTED:email]`.
4. Replaces payment references / UTR / RRN (10+ digit runs) with
   `[REDACTED:payment_reference]`.
5. Replaces raw OCR text markers (`OCR:`, `Raw text:`, `Receipt text:`,
   `Extracted text:`) with `[REDACTED:ocr_text]`.
6. Buckets amount expressions (`₹1,250.00`, `Rs 1250`, `INR 15000`,
   `$12.50`, `€40.00`) into coarse ranges (`< 100`, `100-1000`,
   `1000-10000`, `> 10000`). NEVER the exact amount.

For `bug_report` feedback, the redactor ALSO strips attachment references
ENTIRELY:
- Lines like `Attachment: <path>`, `See attached: <path>`,
  `Screenshot: <path>`, `Log file: <path>`, `Crash log: <path>`.
- Markdown image syntax `![alt](path)`.

The local-only file is NEVER uploaded. Even with the path redacted, the
file contents (receipt images, OCR text, crash dumps with stack traces)
are out of scope for the feedback backend.

## Review prompt guard

`shouldPromptForReview(currentTask, eligibility)` returns `true` ONLY when
ALL of:

- `currentTask` is `null` or NOT a `FinancialTask`.
- `daysSinceFirstLaunch >= 30`.
- `totalExpensesCreated >= 10`.
- `latestNpsScore >= 9` (and not null).
- `lastPromptedAt` is null OR more than 180 days ago.

The function returns `false` if ANY criterion fails. In particular:

- `currentTask === 'settlement_confirmation'` → ALWAYS `false`. BillLens
  NEVER interrupts a settlement confirmation with a review prompt.
- Same for `expense_creation`, `expense_editing`, `upi_payment`,
  `backup_restore`, `conflict_resolution`.
- Unparseable timestamps → `false` (fail closed).

The use case (`PromptAppStoreReviewUseCase`) wraps the guard and records
the prompt time on a `ReviewPromptLedger` only when the guard returns
`true`. The cooldown starts ticking immediately after a successful prompt.

## NPS survey eligibility

`SubmitNpsSurveyUseCase` accepts an NPS submission only when:

- `daysSinceFirstLaunch >= 7`.
- `totalExpensesCreated >= 5`.
- No NPS submission within the last 90 days.

NPS category (computed from the score):

- 0-6 → `detractor`
- 7-8 → `passive`
- 9-10 → `promoter`

## Testing

- `src/domain/feedback/__tests__/feedback-redactor.test.ts` — verifies
  no PII leaks across 8+ categories (file URIs, paths, emails, UPI,
  payment refs, OCR text, amounts, bug report attachments).
- `src/domain/feedback/__tests__/review-prompt-guard.test.ts` — verifies
  CRITICAL rule: NO prompt during settlement_confirmation (or any other
  financial task), plus all eligibility edge cases.
- `src/infrastructure/__tests__/sqlite-feedback-repository.test.ts` (12
  tests) — migration 0004, round-trips, idempotent save, defensive
  redaction, NPS id-prefix linkage (including the prefix-collision
  probe), corrupted-JSON degradation, ledger upsert, and all three use
  cases executing over the real adapter.
- `src/presentation/screens/__tests__/feedback-screen.test.tsx` (9
  tests) — privacy notice, type selection, counter, submit gating
  (whitespace body / services not ready), error banner, submitted card,
  opt-in toggle.
- `e2e/maestro/phase9/send-feedback.yaml` — structural Maestro flow
  (Settings → form → bug report → saved confirmation).

## Operational notes

- Feedback records should be reviewed by a human before being forwarded
  to engineering. Even with redaction, free-text feedback can carry
  unusual PII shapes the regex doesn't catch.
- The review prompt ledger should be backed up with the user's data so
  the 180-day cooldown survives device transfers.
- NPS submissions should be aggregated monthly to compute the
  company-level NPS score (`% promoters - % detractors`).
