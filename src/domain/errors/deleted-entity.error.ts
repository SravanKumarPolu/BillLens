import { DomainError } from './domain-error';

/**
 * Thrown when an operation attempts to mutate or assign to a soft-deleted
 * entity. Soft-deleted entities retain their data for historical integrity
 * but cannot be modified or assigned to.
 */
export class DeletedEntityError extends DomainError {
  readonly code = 'DELETED_ENTITY';

  constructor(
    message: string,
    readonly entityType: string,
    readonly entityId: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
