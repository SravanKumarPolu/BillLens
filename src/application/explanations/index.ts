/**
 * Explanation engine application layer — Phase 6 Track 2.
 *
 * The six use cases required by Prompt 55, plus the confirmation
 * preview required by Prompt 53:
 *
 *   GenerateSettlementSuggestionsUseCase     — suggested transfers per currency
 *   PreviewSettlementImpactUseCase             — before/after balance impact
 *   ExplainMemberDebtUseCase                   — per-member debt breakdown
 *   ExplainMemberCreditUseCase                 — per-member credit breakdown
 *   GetSuggestedTransferExplanationUseCase     — structured reasoning for one transfer
 *   CompareOriginalAndSimplifiedPlanUseCase     — side-by-side comparison
 *   PreviewSettlementRecordingUseCase           — confirmation preview before recording (Prompt 53)
 *
 * All use cases are read-side — they load the group's balance data
 * via the `BalanceQueryPort` (from Track 3) and wrap the multi-
 * currency balance engine (Track 3). None of them mutate any
 * settlement; the mutations happen via the Track 1 use cases
 * (`CreateSettlementDraftUseCase`, `RecordSettlementUseCase`, etc.).
 *
 * ── Spec rule (Prompt 55) ──
 *
 *   "Explanations must be generated from structured domain data.
 *    Do not use generative AI to invent amounts, participants,
 *    causes, settlement status, or rounding explanations."
 *
 * Every explanation is derived from the balance engine's structured
 * output — never from a language model.
 */

export * from './generate-settlement-suggestions.usecase';
export * from './preview-settlement-impact.usecase';
export * from './explain-member-debt.usecase';
export * from './get-suggested-transfer-explanation.usecase';
export * from './compare-original-and-simplified-plan.usecase';
