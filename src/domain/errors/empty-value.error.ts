import { DomainError } from './domain-error';

/** Thrown when an empty string is supplied for a field that requires a non-empty value (e.g. group name, expense title). */
export class EmptyValueError extends DomainError {
  readonly code = 'EMPTY_VALUE';
}
