/**
 * Authentication error types.
 *
 * The infrastructure layer (Supabase, network, OAuth providers) throws a
 * heterogeneous mess of errors. This module defines a single, application-
 * safe `AuthError` class with a closed set of error codes, plus a mapper
 * function that converts arbitrary infrastructure errors into the right
 * code.
 *
 * The `AuthErrorCode` union is the source of truth for what the UI can
 * display to the user — codes are translated to human-readable strings in
 * the presentation layer.
 */

export type AuthErrorCode =
  | 'invalid_email'
  | 'invalid_otp'
  | 'expired_otp'
  | 'network_unavailable'
  | 'provider_cancelled'
  | 'provider_unavailable'
  | 'session_expired'
  | 'account_disabled'
  | 'rate_limited'
  | 'unknown_auth_failure';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Map an arbitrary infrastructure error to an application-safe AuthError.
 *
 * Heuristics (evaluated in order):
 *   1. If the error is already an AuthError, return it unchanged.
 *   2. Match the error message against common patterns:
 *      - "network|fetch|timeout" → network_unavailable
 *      - "rate.?limit"           → rate_limited
 *      - "expired"               → expired_otp
 *      - "invalid|incorrect"     → invalid_otp
 *      - "cancel"                → provider_cancelled
 *   3. Otherwise, unknown_auth_failure.
 *
 * SECURITY: never include the original error's stack or raw message in
 * the returned AuthError — the message might contain a token, OTP, or
 * other sensitive value that the infrastructure layer logged by mistake.
 * The AuthError carries only a generic, human-readable message.
 */
export function mapInfraErrorToAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/network|fetch|timeout/i.test(message)) {
    return new AuthError('network_unavailable', 'Network unavailable');
  }
  if (/rate.?limit/i.test(message)) {
    return new AuthError('rate_limited', 'Too many attempts. Please wait.');
  }
  if (/expired/i.test(message)) {
    return new AuthError('expired_otp', 'Code has expired');
  }
  if (/invalid|incorrect/i.test(message)) {
    return new AuthError('invalid_otp', 'Invalid code');
  }
  if (/cancel/i.test(message)) {
    return new AuthError('provider_cancelled', 'Sign-in cancelled');
  }
  if (/disabled|banned/i.test(message)) {
    return new AuthError('account_disabled', 'Account is disabled');
  }
  if (/unavailable|server|500|502|503/i.test(message)) {
    return new AuthError('provider_unavailable', 'Sign-in service unavailable');
  }
  return new AuthError('unknown_auth_failure', 'Authentication failed');
}
