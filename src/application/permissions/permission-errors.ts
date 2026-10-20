/**
 * Permission error types — Phase 3 Prompt 29.
 *
 * The application and domain layers throw a heterogeneous mix of errors
 * when an actor lacks permission to perform an action. This module
 * defines a single, application-safe `PermissionError` class with a
 * closed set of error codes, plus a mapper function that converts
 * arbitrary infrastructure/domain errors into the right code.
 *
 * The `PermissionErrorCode` union is the source of truth for what the
 * UI can display to the user — codes are translated to human-readable
 * strings in the presentation layer via `permissionErrorMessage`.
 *
 * SECURITY: the error message never includes the original error's stack
 * or raw message — that might contain sensitive identifiers. The
 * `PermissionError` carries only a generic, user-facing message.
 */

export type PermissionErrorCode =
  | 'access_removed'
  | 'admin_required'
  | 'owner_required'
  | 'group_archived'
  | 'action_unavailable_offline'
  | 'record_changed_remotely';

export class PermissionError extends Error {
  readonly code: PermissionErrorCode;

  constructor(code: PermissionErrorCode, message?: string) {
    super(message ?? permissionErrorMessage(code));
    this.name = 'PermissionError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * User-facing message for each permission error code.
 *
 * Kept in the application layer (not presentation) so use cases can
 * surface a stable, testable message — the presentation layer may still
 * localise or rephrase for accessibility.
 */
export function permissionErrorMessage(code: PermissionErrorCode): string {
  switch (code) {
    case 'access_removed':
      return 'You no longer have access to this group.';
    case 'admin_required':
      return 'Only group admins can perform this action.';
    case 'owner_required':
      return 'Only the group owner can perform this action.';
    case 'group_archived':
      return 'This group has been archived.';
    case 'action_unavailable_offline':
      return 'This action requires an internet connection.';
    case 'record_changed_remotely':
      return 'This record was changed on another device. Refresh and try again.';
  }
}

/**
 * Map an arbitrary error to a `PermissionError`. Heuristics:
 *
 *   1. If the error is already a `PermissionError`, return it unchanged.
 *   2. If the error message contains a known permission reason string,
 *      map it to the matching code (see table below).
 *   3. Otherwise, default to `admin_required` (the most common
 *      permission failure — most privileged actions require admin).
 *
 * Reason → code table:
 *   - /removed|left the group|no longer active/i → access_removed
 *   - /owner/i                                   → owner_required
 *   - /admin/i                                   → admin_required
 *   - /archived/i                                → group_archived
 *   - /offline|network|sync/i                    → action_unavailable_offline
 *   - /version conflict|changed remotely/i       → record_changed_remotely
 */
export function mapErrorToPermissionError(error: unknown): PermissionError {
  if (error instanceof PermissionError) return error;
  const message = error instanceof Error ? error.message : String(error);

  if (/removed|left the group|no longer active/i.test(message)) {
    return new PermissionError('access_removed');
  }
  if (/owner/i.test(message)) {
    return new PermissionError('owner_required');
  }
  if (/admin/i.test(message)) {
    return new PermissionError('admin_required');
  }
  if (/archived/i.test(message)) {
    return new PermissionError('group_archived');
  }
  if (/offline|network|sync/i.test(message)) {
    return new PermissionError('action_unavailable_offline');
  }
  if (/version conflict|changed remotely/i.test(message)) {
    return new PermissionError('record_changed_remotely');
  }
  return new PermissionError('admin_required');
}

/**
 * Map an `AuthorizationDecision.reason` string (as returned by
 * `GroupAuthorizationService.canPerform`) to the matching
 * `PermissionErrorCode`. Used by use cases that want to throw a
 * typed `PermissionError` rather than an `InvalidEntityError`.
 */
export function reasonToPermissionErrorCode(
  reason: string | undefined,
): PermissionErrorCode {
  if (!reason) return 'admin_required';
  if (reason === 'access_removed') return 'access_removed';
  if (reason === 'action_unavailable_offline') return 'action_unavailable_offline';
  if (reason === 'group_archived') return 'group_archived';
  if (/owner/i.test(reason)) return 'owner_required';
  if (/admin/i.test(reason)) return 'admin_required';
  if (/version conflict|changed remotely/i.test(reason)) {
    return 'record_changed_remotely';
  }
  return 'admin_required';
}
