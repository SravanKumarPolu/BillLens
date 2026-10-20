import { DomainError } from './domain-error';

/**
 * Thrown when a settlement state transition is invalid.
 *
 * Settlements follow an explicit state machine (see
 * `settlement-state-machine.ts` in `src/domain/services/settlements/`).
 * Each transition is whitelisted; any transition not on the whitelist
 * throws this error.
 *
 * The error carries the `from` and `to` states so callers (UI, audit,
 * sync conflict resolution) can produce a meaningful message without
 * parsing the error string.
 */
export class InvalidStateTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';

  constructor(
    message: string,
    readonly from: string,
    readonly to: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
