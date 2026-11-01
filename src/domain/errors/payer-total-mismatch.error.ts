import { DomainError } from './domain-error';

/**
 * Thrown when the sum of `ExpensePayer` amounts does not equal the expense
 * total. Every expense must have at least one payer, and the sum of all
 * payer amounts must exactly match the expense's `totalAmountMinor`.
 */
export class PayerTotalMismatchError extends DomainError {
  readonly code = 'PAYER_TOTAL_MISMATCH';

  constructor(
    message: string,
    readonly expectedTotalMinor: number,
    readonly actualTotalMinor: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
