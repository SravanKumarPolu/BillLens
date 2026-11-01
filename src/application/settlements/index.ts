/**
 * Settlements application layer — Phase 6 Track 1 + Track 5.
 *
 * Use cases for the settlement state machine (Prompt 52) and the
 * receiver-confirmation / dispute flows (Prompt 57).
 *
 * ── Track 1 — Prompt 52 (state machine) ──
 *
 *   CreateSettlementDraftUseCase     — create a draft settlement
 *   RequestSettlementUseCase         — draft → requested
 *   RecordSettlementUseCase          — draft|requested → pending_confirmation
 *   ConfirmSettlementUseCase         — pending_confirmation → completed
 *   RejectSettlementUseCase          — pending_confirmation → failed
 *   CancelSettlementUseCase          — requested|pending_confirmation → cancelled
 *   ReverseSettlementUseCase         — completed → reversed (with new reversal record)
 *   DeleteSettlementUseCase          — soft-delete (any state)
 *   RestoreSettlementUseCase          — undo soft-delete
 *   RetrySettlementAsDraftUseCase    — failed → draft (retry path)
 *   GetSettlementUseCase             — read single settlement by id
 *   ListSettlementsUseCase           — list filtered settlements for a group
 *
 * ── Track 5 — Prompt 57 (confirmation + disputes) ──
 *
 *   DisputeSettlementUseCase          — pending_confirmation → disputed
 *   ResolveDisputeUseCase             — disputed → completed|cancelled
 *   RequestMoreInfoUseCase            — ask the payer for more context (no state change)
 *   MarkDuplicateSettlementUseCase    — flag as duplicate (dispute with reason 'duplicate')
 *   CorrectSettlementAmountUseCase    — correction proposal flow (dispute + new draft)
 *   ListPendingConfirmationsUseCase   — receiver's pending-confirmation inbox
 *   ListDisputedSettlementsUseCase    — dispute-resolution queue
 */

// Track 1 — state machine
export * from './create-settlement-draft.usecase';
export * from './request-settlement.usecase';
export * from './record-settlement.usecase';
export * from './confirm-settlement.usecase';
export * from './reject-settlement.usecase';
export * from './cancel-settlement.usecase';
export * from './reverse-settlement.usecase';
export * from './delete-settlement.usecase';
export * from './restore-settlement.usecase';
export * from './retry-settlement-as-draft.usecase';
export * from './get-settlement.usecase';
export * from './list-settlements.usecase';

// Track 5 — confirmation + disputes
export * from './dispute-settlement.usecase';
export * from './resolve-dispute.usecase';
export * from './request-more-info.usecase';
export * from './mark-duplicate-settlement.usecase';
export * from './correct-settlement-amount.usecase';
export * from './list-pending-confirmations.usecase';
export * from './list-disputed-settlements.usecase';
