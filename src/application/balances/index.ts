/**
 * Balance query application layer — Phase 6 Track 3.
 *
 * The seven use cases required by Prompt 51:
 *
 *   GetGroupBalancesUseCase           — per-currency balances for the whole group
 *   GetMemberBalanceUseCase           — per-currency balances for one member
 *   GetBalanceBreakdownUseCase        — per-expense breakdown for one member
 *   GetGroupCurrencySummariesUseCase  — list of currencies + counts
 *   GetUnsettledMembersUseCase         — members with non-zero balances
 *   RecalculateGroupBalancesUseCase   — force a recompute
 *   ValidateBalanceInvariantsUseCase  — per-currency zero-sum check
 *
 * All seven are backed by the multi-currency balance engine
 * (`calculateGroupBalancesByCurrency` in
 * `src/domain/services/balances/balance-engine.ts`). They differ
 * only in how they slice the engine output for the UI.
 *
 * `GetGroupBalancesUseCase` is the foundation — the others compose
 * with it. They never re-load data; they filter the per-currency
 * results `GetGroupBalancesUseCase` already computed.
 */

export * from './balance-query.port';
export * from './get-group-balances.usecase';
export * from './get-member-balance.usecase';
export * from './get-balance-breakdown.usecase';
export * from './get-group-currency-summaries.usecase';
export * from './get-unsettled-members.usecase';
export * from './recalculate-group-balances.usecase';
export * from './validate-balance-invariants.usecase';
