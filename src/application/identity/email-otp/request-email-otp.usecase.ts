import type { AuthenticationProvider } from '@domain/ports/authentication-provider.port';
import type { EmailAddress } from '@domain/value-objects/email-address';
import { asEmailAddress, isEmailAddress } from '@domain/value-objects/email-address';

import { type AuthError, mapInfraErrorToAuthError } from '../auth-errors';

/**
 * RequestEmailOtpUseCase — kicks off an email-OTP sign-in flow.
 *
 * Responsibilities:
 *   - Normalise the email (trim + lowercase) before forwarding to the
 *     {@link AuthenticationProvider}.
 *   - Validate the email shape up-front so the provider only sees
 *     well-formed addresses.
 *   - Translate infrastructure errors into application-safe
 *     {@link AuthError}s WITHOUT revealing whether an account already
 *     exists for the address.
 *
 * SECURITY:
 *   - The email is forwarded to the provider; this use case does NOT
 *     log the email or any OTP value.
 *   - Rate-limit and account-existence signals are intentionally
 *     ambiguous — both a known and an unknown address return
 *     `success: true` (or a rate-limit error) so a malicious caller
 *     cannot enumerate accounts by observing response timings.
 *
 * NOTE: this use case does NOT persist any state. It is the caller's
 * responsibility (presentation layer) to remember the email between
 * the request and the verify step.
 */

/** Result of {@link RequestEmailOtpUseCase.execute}. */
export interface RequestEmailOtpResult {
  /**
   * `true` if the provider accepted the request and sent (or pretended
   * to send) an OTP. `false` only when the use case short-circuits on a
   * client-side validation error.
   */
  readonly success: boolean;
  /**
   * When the provider returns a rate-limit error, this is the number of
   * milliseconds the caller MUST wait before re-issuing the request.
   * The presentation layer uses this to drive the resend countdown.
   */
  readonly retryAfterMs?: number;
  /**
   * Application-safe error code when `success` is false. The use case
   * never throws — it returns the error so the UI can render it
   * inline without try/catch boilerplate.
   */
  readonly errorCode?: AuthError['code'];
  readonly errorMessage?: string;
}

/** Default cooldown between consecutive OTP requests (Supabase default is 60s). */
export const DEFAULT_OTP_RESEND_COOLDOWN_MS = 60_000;

export class RequestEmailOtpUseCase {
  constructor(
    private readonly authProvider: AuthenticationProvider,
  ) {}

  async execute(rawEmail: string): Promise<RequestEmailOtpResult> {
    // 1. Validate the email shape up-front. We return a structured
    //    error rather than throwing so the UI can show inline feedback.
    if (!rawEmail || typeof rawEmail !== 'string') {
      return {
        success: false,
        errorCode: 'invalid_email',
        errorMessage: 'Please enter a valid email address.',
      };
    }
    let email: EmailAddress;
    try {
      email = asEmailAddress(rawEmail);
    } catch {
      return {
        success: false,
        errorCode: 'invalid_email',
        errorMessage: 'Please enter a valid email address.',
      };
    }

    // 2. Forward to the provider. Translate any infrastructure error
    //    into an application-safe AuthError WITHOUT revealing whether
    //    an account exists for the address.
    try {
      await this.authProvider.signInWithEmailOtp(email as string);
      return { success: true };
    } catch (error) {
      const authError = mapInfraErrorToAuthError(error);
      if (authError.code === 'rate_limited') {
        return {
          success: false,
          errorCode: 'rate_limited',
          errorMessage: 'Too many attempts. Please wait before requesting a new code.',
          // Use a deterministic cooldown when the provider does not
          // surface a specific retry-after value. Supabase returns a
          // generic error so we fall back to the default.
          retryAfterMs: DEFAULT_OTP_RESEND_COOLDOWN_MS,
        };
      }
      // Network and other failures — return the mapped code. We never
      // surface the raw infrastructure message.
      return {
        success: false,
        errorCode: authError.code,
        errorMessage: authError.message,
      };
    }
  }
}

/**
 * Re-exported predicate for presentation layers that need to validate
 * an email WITHOUT issuing an OTP (e.g. to enable/disable the Send
 * Code button).
 */
export { isEmailAddress };
