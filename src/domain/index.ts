/**
 * Domain layer barrel.
 *
 * HARD RULE: this layer must not import from React, React Native, Expo,
 * Supabase, SQLite, Zustand, or TanStack Query. Enforced by ESLint in
 * Prompt 2 and by the programmatic test in
 * `src/domain/__tests__/domain-independence.test.ts`.
 */

export * from './entities';
export * from './value-objects';
export * from './errors';
export * from './ports';
export * from './services/splits';
export * from './services/balances';
export * from './services/settlements';
export * from './services/permissions';
export * from './item-assignment';
// `./services/balances` and `./explanations` both export a function called
// `explainMemberBalance`. A wildcard `export * from './explanations'` would
// collide with the existing re-export from `./services/balances`, so we list
// the explanation exports explicitly and omit `explainMemberBalance` from the
// top-level barrel. Import the structured BalanceExplanation-returning
// `explainMemberBalance` directly from `@domain/explanations`; the legacy
// text-only version remains reachable via `@domain/services/balances`.
export {
  type BalanceExplanation,
  type ExpenseContribution,
  type RoundingExplanation,
  type SettlementExplanation,
  buildRoundingExplanations,
  buildSettlementExplanations,
} from './explanations';
