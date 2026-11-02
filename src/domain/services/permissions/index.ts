/**
 * Domain permission module barrel — Phase 3 Prompt 29.
 *
 * Exposes:
 *   - {@link GroupAction} enumeration (the closed list of permissioned
 *     actions).
 *   - {@link checkPermission} pure matrix (role × action × ownResource).
 *   - {@link GroupAuthorizationService} interface and its default impl.
 *
 * The application layer imports these via the domain barrel so call
 * sites stay decoupled from the implementation.
 */

export * from './group-actions';
export * from './permission-matrix';
export * from './group-authorization-service';
