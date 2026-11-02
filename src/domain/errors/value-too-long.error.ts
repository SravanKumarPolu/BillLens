import { DomainError } from './domain-error';

/** Thrown when a value exceeds its maximum allowed length (e.g. group name > 100 chars). */
export class ValueTooLongError extends DomainError {
  readonly code = 'VALUE_TOO_LONG';

  constructor(
    message: string,
    readonly field: string,
    readonly maxLength: number,
    readonly actualLength: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
