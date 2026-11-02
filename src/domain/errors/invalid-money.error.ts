import { DomainError } from './domain-error';

/**
 * Thrown when constructing a `Money` value object with an invalid amount.
 *
 * Reasons include:
 *  - NaN, Infinity, or non-integer values
 *  - Unsafe integers (outside Number.MAX_SAFE_INTEGER range)
 *  - Negative values where positivity is required (e.g. expense totals)
 *  - Mixed-currency arithmetic
 */
export class InvalidMoneyError extends DomainError {
  readonly code = 'INVALID_MONEY';
}
