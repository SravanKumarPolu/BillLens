import { DomainError } from './domain-error';

/**
 * Thrown when attempting arithmetic, comparison, or allocation between
 * `Money` values with different `CurrencyCode`s.
 *
 * Money in BillLens is strongly typed by currency. The only way to combine
 * two money values is if they share the same currency; otherwise the
 * caller must explicitly convert (a future feature — Phase 1 is
 * single-currency-per-group).
 */
export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';

  constructor(
    message: string,
    readonly left: string,
    readonly right: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
