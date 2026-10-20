/**
 * Expenses application layer.
 *
 * Write path:
 *   - CreateExpenseFromDraftUseCase — the capture pipeline's
 *     review-then-confirm path (OCR output NEVER becomes an expense
 *     without user review).
 *   - CreateExpenseManuallyUseCase — the manual form path
 *     (`/expenses/new`): user-typed values ARE the ground truth, so no
 *     draft stage exists.
 *
 * Read path:
 *   - ListRecentExpensesForGroupUseCase — the group home screen's
 *     recent-expenses cards (payer display name + participant count).
 *   - GetExpenseDetailUseCase — the `/expenses/[expenseId]` screen's
 *     full detail view (expense + payers + shares with names resolved).
 */

export * from './create-expense-from-draft.usecase';
export * from './create-expense-manually.usecase';
export * from './get-expense-detail.usecase';
export * from './list-recent-expenses.usecase';
