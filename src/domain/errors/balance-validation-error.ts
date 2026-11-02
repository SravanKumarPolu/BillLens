import { DomainError } from './domain-error';

/**
 * Thrown by the balance engine when input data violates a balance-specific
 * invariant that prevents meaningful computation:
 *
 *   - Empty members list.
 *   - Duplicate members in the members list.
 *   - Expense or settlement currency does not match the group currency
 *     (Phase 1 is single-currency per group).
 *
 * Distinct from `InvalidEntityError` (which is for single-entity invariant
 * violations) so that callers can differentiate balance-engine failures
 * from generic entity failures.
 */
export class BalanceValidationError extends DomainError {
  readonly code = 'BALANCE_VALIDATION_ERROR';
}
