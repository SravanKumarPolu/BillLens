import { DomainError } from './domain-error';

/** Thrown when an entity version conflicts (e.g. editing a stale version of an expense). */
export class VersionConflictError extends DomainError {
  readonly code = 'VERSION_CONFLICT';

  constructor(
    message: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
