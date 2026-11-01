/**
 * Application-layer permissions barrel — Phase 3 Prompt 29.
 *
 * Exposes:
 *   - `PermissionError` class + `PermissionErrorCode` union.
 *   - `permissionErrorMessage` user-facing message lookup.
 *   - `mapErrorToPermissionError` mapper for arbitrary infrastructure errors.
 *   - `reasonToPermissionErrorCode` for converting the reason strings
 *     returned by `GroupAuthorizationService.canPerform`.
 */

export * from './permission-errors';
