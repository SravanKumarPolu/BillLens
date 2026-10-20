/**
 * Settlement reminders application layer — Phase 6 Track 6.
 *
 * Use cases for respectful payment follow-up (Prompt 59). The
 * `settlement_reminders` table was created in Track 1's migration;
 * Track 6 builds the entity, repository contract, scheduling rules,
 * and the five required use cases:
 *
 *   CreateSettlementReminderUseCase       — schedule a reminder (with cool-down)
 *   CancelSettlementReminderUseCase       — manual cancellation
 *   ListSettlementRemindersUseCase         — list reminders for a group
 *   ReconcileReminderStateUseCase          — auto-cancel on settle/dispute/remove
 *   GenerateGroupSettlementSummaryUseCase  — neutral group summary message
 *
 * ── Safety invariant ──
 *
 * The wording is neutral. The spec forbids shame-oriented language
 * ("You still haven't paid", "Pay immediately", "Everyone is waiting",
 * public ranking of late payers). The `buildNeutralReminderMessage`
 * function in the scheduling-rules module produces the spec's
 * example wording; the `containsShameLanguage` function validates
 * user-customised templates.
 */

export * from './create-settlement-reminder.usecase';
export * from './cancel-settlement-reminder.usecase';
export * from './list-settlement-reminders.usecase';
export * from './reconcile-reminder-state.usecase';
export * from './generate-group-settlement-summary.usecase';
