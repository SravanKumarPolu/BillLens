import type { AuthenticationProvider } from '@domain/ports/authentication-provider.port';

import { type AuthError, mapInfraErrorToAuthError } from '../auth-errors';

import {
  DEFAULT_OTP_RESEND_COOLDOWN_MS,
  type RequestEmailOtpResult,
} from './request-email-otp.usecase';

/**
 * ResendEmailOtpUseCase — re-issues an OTP request after a cooldown.
 *
 * Responsibilities:
 *   - Enforce a client-side cooldown so the UI cannot spam the
 *     provider (the provider enforces its own rate limit too, but
 *     failing fast on the client avoids a network round-trip and a
 *     generic rate-limit error).
 *   - Forward to {@link AuthenticationProvider.signInWithEmailOtp}.
 *   - Return timing information the UI uses to drive the resend
 *     countdown.
 *
 * SECURITY: same as {@link RequestEmailOtpUseCase} — no emails or
 * OTPs are logged, and rate-limit / account-existence signals are
 * ambiguous.
 */

/** Input to {@link ResendEmailOtpUseCase.execute}. */
export interface ResendEmailOtpInput {
  readonly email: string;
  /**
   * Epoch milliseconds of the last successful OTP request. The use
   * case refuses to resend until at least `cooldownMs` have elapsed.
   */
  readonly lastSentAtMs: number;
  /** Optional cooldown override (defaults to the Supabase 60s value). */
  readonly cooldownMs?: number;
}

/** Result of {@link ResendEmailOtpUseCase.execute}. */
export interface ResendEmailOtpResult {
  readonly success: boolean;
  /**
   * Epoch milliseconds when the caller should next allow a resend.
   * The UI uses this to compute the countdown.
   */
  readonly nextAllowedAtMs: number;
  /** Milliseconds remaining until the next resend is allowed (for UI). */
  readonly retryAfterMs: number;
  readonly errorCode?: AuthError['code'];
  readonly errorMessage?: string;
}

export class ResendEmailOtpUseCase {
  constructor(
    private readonly authProvider: AuthenticationProvider,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(input: ResendEmailOtpInput): Promise<ResendEmailOtpResult> {
    const cooldown = input.cooldownMs ?? DEFAULT_OTP_RESEND_COOLDOWN_MS;
    const now = this.now();
    const elapsed = now - input.lastSentAtMs;
    const nextAllowedAtMs = input.lastSentAtMs + cooldown;

    if (elapsed < cooldown) {
      return {
        success: false,
        nextAllowedAtMs,
        retryAfterMs: cooldown - elapsed,
        errorCode: 'rate_limited',
        errorMessage: 'Please wait before requesting a new code.',
      };
    }

    try {
      await this.authProvider.signInWithEmailOtp(input.email);
      return {
        success: true,
        // Reset the cooldown — caller records this timestamp.
        nextAllowedAtMs: now + cooldown,
        retryAfterMs: cooldown,
      };
    } catch (error) {
      const authError = mapInfraErrorToAuthError(error);
      if (authError.code === 'rate_limited') {
        return {
          success: false,
          nextAllowedAtMs: now + cooldown,
          retryAfterMs: cooldown,
          errorCode: 'rate_limited',
          errorMessage: 'Too many attempts. Please wait.',
        };
      }
      return {
        success: false,
        nextAllowedAtMs,
        retryAfterMs: 0,
        errorCode: authError.code,
        errorMessage: authError.message,
      };
    }
  }
}

/** Re-export the request result type for symmetry. */
export type { RequestEmailOtpResult };
