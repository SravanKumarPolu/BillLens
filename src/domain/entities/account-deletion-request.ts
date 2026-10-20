import { InvalidEntityError, InvalidStateTransitionError } from '@domain/errors';
import type { DateTime } from '@domain/value-objects';
import { asDateTime } from '@domain/value-objects';
import type { UserId } from '@shared-types/index';
import type { EntityId } from '@shared-types/index';

/**
 * AccountDeletionRequest — Phase 8 Prompt 77 (store readiness).
 *
 * Apple App Store and Google Play both require a working in-app
 * account deletion flow. This entity records a *scheduled* account
 * deletion so the app can offer a recovery window instead of
 * destroying the cloud account instantly on a single tap.
 *
 * Lifecycle:
 *
 *   (no record)                     — account is active
 *   createAccountDeletionRequest()  — status `scheduled`
 *      ├── cancel (user signs back in and cancels before deadline) → `cancelled`
 *      └── deadline passes → server-side job completes the deletion → `completed`
 *
 * GUEST ACCOUNTS: guests have no cloud account. Deleting a guest is a
 * purely local wipe and never creates one of these records (the use
 * case handles that path directly — see RequestAccountDeletionUseCase).
 *
 * PRIVACY: this record contains ONLY the user id and timestamps. No
 * financial content, no receipt data, no tokens.
 */

export type AccountDeletionRequestId = EntityId;

export type AccountDeletionStatus = 'scheduled' | 'cancelled' | 'completed';

export interface AccountDeletionRequest {
  readonly id: AccountDeletionRequestId;
  readonly userId: UserId;
  readonly status: AccountDeletionStatus;
  /** When the user requested deletion (ISO UTC). */
  readonly requestedAt: DateTime;
  /**
   * Deletion is executed server-side after this deadline. Until then
   * the user may cancel (recovery window). ISO UTC.
   */
  readonly recoveryDeadlineAt: DateTime;
  /** Optimistic-concurrency version (matches repository conventions). */
  readonly version: number;
}

/** Default recovery window: 14 days (see docs/legal/account-deletion-policy.md). */
export const DEFAULT_ACCOUNT_DELETION_RECOVERY_DAYS = 14;

/** Minimum recovery window: 24 hours — never delete instantly on tap. */
export const MIN_ACCOUNT_DELETION_RECOVERY_DAYS = 1;

/** Maximum recovery window: 30 days — deletion must not be indefinite. */
export const MAX_ACCOUNT_DELETION_RECOVERY_DAYS = 30;

/**
 * Create a scheduled deletion request. Throws when the recovery window
 * is outside the supported bounds.
 */
export function createAccountDeletionRequest(input: {
  readonly id: AccountDeletionRequestId;
  readonly userId: UserId;
  readonly requestedAt: DateTime;
  readonly recoveryDays?: number;
  readonly version?: number;
}): AccountDeletionRequest {
  const recoveryDays = input.recoveryDays ?? DEFAULT_ACCOUNT_DELETION_RECOVERY_DAYS;

  if (!Number.isInteger(recoveryDays)) {
    throw new InvalidEntityError(
      `AccountDeletionRequest: recovery days must be an integer, got ${recoveryDays}.`,
    );
  }
  if (
    recoveryDays < MIN_ACCOUNT_DELETION_RECOVERY_DAYS ||
    recoveryDays > MAX_ACCOUNT_DELETION_RECOVERY_DAYS
  ) {
    throw new InvalidEntityError(
      `AccountDeletionRequest: recovery days must be between ` +
        `${MIN_ACCOUNT_DELETION_RECOVERY_DAYS} and ` +
        `${MAX_ACCOUNT_DELETION_RECOVERY_DAYS}, got ${recoveryDays}.`,
    );
  }

  const requestedMs = Date.parse(input.requestedAt);
  if (Number.isNaN(requestedMs)) {
    throw new InvalidEntityError(
      `AccountDeletionRequest: invalid requestedAt "${input.requestedAt}".`,
    );
  }
  const deadlineMs = requestedMs + recoveryDays * 24 * 60 * 60 * 1000;

  return {
    id: input.id,
    userId: input.userId,
    status: 'scheduled',
    requestedAt: asDateTime(input.requestedAt),
    recoveryDeadlineAt: asDateTime(new Date(deadlineMs).toISOString()),
    version: input.version ?? 1,
  };
}
/**
 * Whether the user can still cancel this scheduled deletion at `now`
 * (i.e. the record is scheduled and the recovery window has not passed).
 */
export function isRecoveryWindowOpen(
  request: AccountDeletionRequest,
  now: DateTime,
): boolean {
  if (request.status !== 'scheduled') return false;
  return Date.parse(now) < Date.parse(request.recoveryDeadlineAt);
}

/**
 * Mark the scheduled deletion as cancelled (user changed their mind).
 * Only valid while the recovery window is open.
 */
export function cancelAccountDeletion(
  request: AccountDeletionRequest,
  now: DateTime,
): AccountDeletionRequest {
  if (!isRecoveryWindowOpen(request, now)) {
    throw new InvalidStateTransitionError(
      'Recovery window is closed — the deletion cannot be cancelled.',
      request.status,
      'cancelled',
    );
  }
  return {
    ...request,
    status: 'cancelled',
    version: request.version + 1,
  };
}

/**
 * Mark the scheduled deletion as completed (server-side job finished).
 * Only valid from `scheduled` state.
 */
export function completeAccountDeletion(
  request: AccountDeletionRequest,
): AccountDeletionRequest {
  if (request.status !== 'scheduled') {
    throw new InvalidStateTransitionError(
      'Only scheduled deletions can be completed.',
      request.status,
      'completed',
    );
  }
  return {
    ...request,
    status: 'completed',
    version: request.version + 1,
  };
}
