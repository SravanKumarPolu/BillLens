import type {
  AuthSession,
  AuthenticationProvider,
  ProviderIdentityInfo,
} from '@domain/ports/authentication-provider.port';
import type { SessionStoragePort } from '@domain/ports/session-storage.port';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { LinkedAuthIdentityRepository } from '@domain/repositories/linked-auth-identity.repository';
import type { UserRepository } from '@domain/repositories/user.repository';
import type { UserId } from '@shared-types/index';

import { AuthError, mapInfraErrorToAuthError } from '../auth-errors';

/**
 * SignInWithGoogleUseCase — Google OAuth sign-in.
 *
 * Flow:
 *   1. Call `authProvider.signInWithGoogle()` to obtain an
 *      {@link AuthSession}.
 *   2. Call `authProvider.getCurrentProviderIdentity()` to obtain the
 *      provider-issued subject (NOT the email — see
 *      {@link ProviderIdentityInfo}).
 *   3. Look up the provider subject in
 *      {@link LinkedAuthIdentityRepository.findByProviderSubject}.
 *      - If found: this is an EXISTING account. Restore the session,
 *        bump `lastUsedAt` on the linked identity, return
 *        `outcome: 'restored'`.
 *      - If NOT found: this is a NEW provider identity.
 *        - If a local guest identity has data → return
 *          `outcome: 'needs_upgrade'` so the caller can run the
 *          guest-upgrade flow (P25). The provider session is still
 *          persisted so the upgrade executor can use it.
 *        - Otherwise: create a new `User` profile + a new
 *          `LinkedAuthIdentity` for `(google, providerSubject)`,
 *          persist the session, return `outcome: 'new_account'`.
 *
 * SECURITY:
 *   - The provider subject is the link key, NEVER the email. Two
 *     users with the same email on different providers are NOT
 *     auto-merged.
 *   - The session is persisted via {@link SessionStoragePort} only
 *     after the lookup succeeds. We do NOT persist a session for a
 *     cancelled or errored sign-in.
 *   - No tokens, OTPs, or provider subjects are logged.
 *
 * ERROR HANDLING:
 *   - `provider_cancelled` — the user dismissed the Google popup.
 *   - `provider_unavailable` — Google Play Services missing / network
 *     error / 5xx from Google.
 *   - `network_unavailable` — device is offline.
 *   - `unknown_auth_failure` — anything else.
 */

/** Input to {@link SignInWithGoogleUseCase.execute}. */
export interface SignInWithGoogleInput {
  /**
   * Whether a local guest identity exists with local data. When true
   * AND the provider subject is not yet linked, the use case returns
   * `outcome: 'needs_upgrade'` instead of creating a new profile, so
   * the caller can run the guest-upgrade flow.
   */
  readonly hasLocalGuestData: boolean;
  /**
   * Optional display name to use when creating a new profile. If
   * omitted, the use case derives a placeholder from the provider
   * email (or 'Google user' if no email is available).
   */
  readonly displayName?: string;
}

/** Result of {@link SignInWithGoogleUseCase.execute}. */
export type SignInWithGoogleResult =
  | {
      readonly outcome: 'restored';
      readonly session: AuthSession;
      readonly profileId: UserId;
    }
  | {
      readonly outcome: 'new_account';
      readonly session: AuthSession;
      readonly profileId: UserId;
    }
  | {
      readonly outcome: 'needs_upgrade';
      readonly session: AuthSession;
    }
  | { readonly outcome: 'cancelled' }
  | { readonly outcome: 'error'; readonly error: AuthError };

export class SignInWithGoogleUseCase {
  constructor(
    private readonly authProvider: AuthenticationProvider,
    private readonly sessionStorage: SessionStoragePort,
    private readonly linkedIdentityRepo: LinkedAuthIdentityRepository,
    private readonly userRepo: UserRepository,
    private readonly auditRepo: AuditRepository,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async execute(input: SignInWithGoogleInput): Promise<SignInWithGoogleResult> {
    // 1. Sign in with Google.
    let session: AuthSession;
    try {
      session = await this.authProvider.signInWithGoogle();
    } catch (error) {
      const authError = mapInfraErrorToAuthError(error);
      if (authError.code === 'provider_cancelled') {
        return { outcome: 'cancelled' };
      }
      return { outcome: 'error', error: authError };
    }

    // 2. Get the provider identity (providerSubject is the link key).
    let providerIdentity: ProviderIdentityInfo | null;
    try {
      providerIdentity = await this.authProvider.getCurrentProviderIdentity();
    } catch (error) {
      const authError = mapInfraErrorToAuthError(error);
      return { outcome: 'error', error: authError };
    }
    if (!providerIdentity || providerIdentity.provider !== 'google') {
      // The provider returned a session but not a Google identity —
      // this is a configuration error.
      return {
        outcome: 'error',
        error: new AuthError(
          'provider_unavailable',
          'Google sign-in returned an unexpected identity',
        ),
      };
    }

    // 3. Look up the provider subject.
    const existing = await this.linkedIdentityRepo.findByProviderSubject(
      'google',
      providerIdentity.providerSubject,
    );

    if (existing) {
      // Existing account — restore the session.
      await this.sessionStorage.saveSession(session);
      await this.writeAuditSafe(session.userId, {
        provider: 'google',
        outcome: 'restored',
      });
      return {
        outcome: 'restored',
        session,
        profileId: existing.profileId,
      };
    }

    // 4. New provider identity.
    if (input.hasLocalGuestData) {
      // Persist the session so the upgrade executor can use it, then
      // signal the caller to run the upgrade flow.
      await this.sessionStorage.saveSession(session);
      await this.writeAuditSafe(session.userId, {
        provider: 'google',
        outcome: 'needs_upgrade',
      });
      return { outcome: 'needs_upgrade', session };
    }

    // 5. Create a new profile + linked identity.
    const profileId = session.userId;
    const displayName =
      input.displayName ??
      this.deriveDisplayName(providerIdentity) ??
      'Google user';

    await this.userRepo.save({
      id: profileId,
      displayName: displayName as never,
      email: (providerIdentity.providerEmail ?? 'unknown@google') as never,
      createdAt: this.now() as never,
      updatedAt: this.now() as never,
      version: 1 as never,
    });

    await this.linkedIdentityRepo.save({
      id: this.generateId(),
      profileId,
      provider: 'google',
      providerSubject: providerIdentity.providerSubject,
      ...(providerIdentity.providerEmail !== undefined
        ? { providerEmail: providerIdentity.providerEmail }
        : {}),
      createdAt: this.now() as never,
      lastUsedAt: this.now() as never,
      version: 1 as never,
    });

    await this.sessionStorage.saveSession(session);
    await this.writeAuditSafe(profileId, {
      provider: 'google',
      outcome: 'new_account',
    });

    return { outcome: 'new_account', session, profileId };
  }

  private deriveDisplayName(identity: ProviderIdentityInfo): string | undefined {
    if (!identity.providerEmail) return undefined;
    const localPart = identity.providerEmail.split('@')[0];
    return localPart || undefined;
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
      // Best-effort audit.
    }
  }
}
