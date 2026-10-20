import type {
  AuthSession,
  AuthenticationProvider,
} from '@domain/ports/authentication-provider.port';
import type { SessionStoragePort } from '@domain/ports/session-storage.port';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { UserId } from '@shared-types/index';

import { AuthError, mapInfraErrorToAuthError } from '../auth-errors';

/**
 * VerifyEmailOtpUseCase — completes an email-OTP sign-in.
 *
 * Flow:
 *   1. Validate the code is a 6-digit string.
 *   2. Forward the verification call to the {@link AuthenticationProvider}.
 *   3. On success: persist the session via {@link SessionStoragePort},
 *      write an audit entry, and return the session.
 *   4. On failure: translate the error to an {@link AuthError} and
 *      re-throw so the UI can render the appropriate message.
 *
 * CRITICAL: this use case does NOT merge guest data into the cloud
 * account. That is the responsibility of the guest-upgrade flow (P25).
 * The use case only establishes the cloud session.
 *
 * SECURITY: the OTP value is forwarded to the provider; this use case
 * does NOT log it. The {@link AuthError} returned on failure contains
 * only a generic, human-readable message — never the original error
 * text (which might contain the code or a token in a misconfigured
 * provider).
 */

/** Input to {@link VerifyEmailOtpUseCase.execute}. */
export interface VerifyEmailOtpInput {
  readonly email: string;
  readonly code: string;
}

/** Result of {@link VerifyEmailOtpUseCase.execute}. */
export interface VerifyEmailOtpResult {
  readonly session: AuthSession;
}

const OTP_CODE_RE = /^\d{6}$/;

export class VerifyEmailOtpUseCase {
  constructor(
    private readonly authProvider: AuthenticationProvider,
    private readonly sessionStorage: SessionStoragePort,
    private readonly auditRepo: AuditRepository,
    private readonly generateId: () => string,
  ) {}

  async execute(input: VerifyEmailOtpInput): Promise<VerifyEmailOtpResult> {
    const code = (input.code ?? '').trim();

    // 1. Validate the code shape. We do NOT distinguish between
    //    "missing" and "wrong" — both surface as invalid_otp so a
    //    malicious caller cannot probe for partial code acceptance.
    if (!OTP_CODE_RE.test(code)) {
      throw new AuthError('invalid_otp', 'Invalid code');
    }

    // 2. Forward to the provider. Translate the error.
    let session: AuthSession;
    try {
      session = await this.authProvider.verifyEmailOtp({
        email: input.email,
        code,
      });
    } catch (error) {
      throw mapInfraErrorToAuthError(error);
    }

    // 3. Persist the session.
    await this.sessionStorage.saveSession(session);

    // 4. Audit entry. Best-effort — failures here MUST NOT block
    //    sign-in.
    await this.writeAuditSafe(session.userId, {
      provider: session.provider,
    });

    return { session };
  }

  private async writeAuditSafe(
    userId: UserId,
    changeSummary: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    try {
      await this.auditRepo.append({
        id: this.generateId(),
        entityType: 'auth_session',
        entityId: userId as string,
        action: 'create',
        actorId: userId,
        changeSummary,
      });
    } catch {
      // Audit failures must not block auth flows.
    }
  }
}

/** Re-export for callers that want to inspect the OTP code shape. */
export const OTP_CODE_PATTERN = OTP_CODE_RE;
