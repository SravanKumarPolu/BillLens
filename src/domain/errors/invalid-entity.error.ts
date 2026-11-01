import { DomainError } from './domain-error';

/** Thrown when an entity invariant (other than the specific ones above) is violated. */
export class InvalidEntityError extends DomainError {
  readonly code = 'INVALID_ENTITY';
}
