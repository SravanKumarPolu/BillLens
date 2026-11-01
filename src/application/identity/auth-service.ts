import type {
  AuthSession,
  AuthState,
  AuthenticationProvider,
} from '@domain/ports/authentication-provider.port';
import type { SessionStoragePort } from '@domain/ports/session-storage.port';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import type { UserId } from '@shared-types/index';

import { mapInfraErrorToAuthError } from './auth-errors';

/**
 * AuthService — the application-layer wrapper around the domain
 * {@link AuthenticationProvider} port.
 *
 * Responsibilities:
 *   - Translate infrastructure errors into application-safe AuthError.
 *   - Persist/restore the session via the {@link SessionStoragePort}.
 *   - Mirror auth state into the UI store via the {@link AuthStateWriter}
 *     port (so React components can subscribe to state changes).
 *   - Write audit entries for sign-in / sign-out events.
 *   - NEVER delete local data on auth failure or sign-out — local
 *     groups, drafts, receipts, sync ops, guest history, and privacy
 *     settings are always preserved.
 *
 * Architecture boundary: this service lives in the application layer
 * and depends ONLY on:
 *   - Domain ports (AuthenticationProvider, SessionStoragePort,
 *     SecureStorage — all from `@domain/ports/*`).
 *   - Domain repositories (AuditRepository, GuestIdentityRepository).
 *   - The local `AuthStateWriter` port (defined below).
 *   - The local `auth-errors` module.
 *
 * It does NOT depend on:
 *   - React, React Native, Expo, Zustand, Supabase, SQLite.
 *   - `@store/*`, `@infrastructure/*`, `@presentation/*`, `@config/*`.
 */

/**
 * Port for writing auth-state changes to the UI store.
 *
 * The application layer cannot import `@store/*` (architecture boundary),
 * so it depends on this minimal interface instead. The composition root
 * (in the presentation layer) wires this port to the real Zustand
 * `useAuthStore` via the `getAuthStoreWriter()` adapter.
 */
export interface AuthStateWriter {
  setAuthState(state: AuthState): void;
  setUserId(id: string | null): void;
}

/**
 * Listener for session lifecycle events. Useful for triggering sync,
 * analytics, or UI refreshes. Listeners are invoked AFTER the state
 * has been mirrored to the AuthStateWriter.
 */
export type AuthEventListener = (event: AuthEvent) => void;

export type AuthEvent =
  | { readonly type: 'session_restored'; userId: UserId }
  | { readonly type: 'session_expired' }
  | { readonly type: 'signed_in'; userId: UserId; provider: AuthSession['provider'] }
  | { readonly type: 'signed_out' }
  | { readonly type: 'session_refreshed' }
  | { readonly type: 'reauthentication_required' };

/**
 * Result of restoreSession().
 */
export type RestoreSessionResult =
  | { readonly outcome: 'authenticated'; userId: UserId }
  | { readonly outcome: 'session_expired' }
  | { readonly outcome: 'no_session' }
  | { readonly outcome: 'reauthentication_required' };

export class AuthService {
  private readonly listeners = new Set<AuthEventListener>();

  constructor(
    private readonly authProvider: AuthenticationProvider,
    private readonly sessionStorage: SessionStoragePort,
    private readonly stateWriter: AuthStateWriter,
    private readonly auditRepo: AuditRepository,
    private readonly guestRepo: GuestIdentityRepository,
    private readonly generateId: () => string,
  ) {}

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  /**
   * Restore the session on app launch.
   *
   * Flow:
   *   1. Load cached session from SessionStorage.
   *   2. If no session → set state to 'guest' or 'signed_out' (based on
   *      whether a guest identity exists). Local data is NEVER deleted.
   *   3. If session exists → attempt to refresh via the provider.
   *      - Refresh succeeds → state 'authenticated', persist new session.
   *      - Refresh fails with session_expired → state 'session_expired'.
   *      - Refresh fails with reauth required → state
   *        'reauthentication_required' (tokens cleared).
   *      - Refresh fails with network → state 'offline_authenticated'
   *        (use cached session, do NOT clear tokens).
   *
   * CRITICAL: this method does NOT delete local data on any path. The
   * user can always continue in guest mode.
   */
  async restoreSession(): Promise<RestoreSessionResult> {
    const cached = await this.sessionStorage.loadSession();
    if (!cached) {
      await this.transitionToGuestOrSignedOut();
      return { outcome: 'no_session' };
    }

    let refreshed: AuthSession;
    try {
      refreshed = await this.authProvider.refreshSession();
    } catch (error) {
      const authError = mapInfraErrorToAuthError(error);
      if (authError.code === 'network_unavailable') {
        // Offline — use cached session. Do NOT clear tokens.
        this.stateWriter.setAuthState('offline_authenticated');
        this.stateWriter.setUserId(cached.userId as string);
        this.emit({ type: 'session_restored', userId: cached.userId });
        return { outcome: 'authenticated', userId: cached.userId };
      }
      if (authError.code === 'session_expired') {
        this.stateWriter.setAuthState('session_expired');
        this.stateWriter.setUserId(null);
        this.emit({ type: 'session_expired' });
        return { outcome: 'session_expired' };
      }
      // Reauth required (refresh token invalid) — clear tokens.
      await this.sessionStorage.clearSession();
      this.stateWriter.setAuthState('reauthentication_required');
      this.stateWriter.setUserId(null);
      this.emit({ type: 'reauthentication_required' });
      await this.writeAudit('restore_session_failed', undefined, {
        reason: authError.code,
      });
      return { outcome: 'reauthentication_required' };
    }

    await this.sessionStorage.saveSession(refreshed);
    this.stateWriter.setAuthState('authenticated');
    this.stateWriter.setUserId(refreshed.userId as string);
    this.emit({ type: 'session_restored', userId: refreshed.userId });
    return { outcome: 'authenticated', userId: refreshed.userId };
  }

  /**
   * Refresh the current session. Called when the access token is near
   * expiry or after a 401 response.
   *
   * On success: persists the new session, state → 'authenticated'.
   * On network failure: state → 'offline_authenticated' (cached session
   *   is still valid for offline reads; do NOT clear tokens).
   * On other failure: state → 'reauthentication_required', tokens cleared.
   */
  async refreshSession(): Promise<AuthSession> {
    try {
      const session = await this.authProvider.refreshSession();
      await this.sessionStorage.saveSession(session);
      this.stateWriter.setAuthState('authenticated');
      this.stateWriter.setUserId(session.userId as string);
      this.emit({ type: 'session_refreshed' });
      return session;
    } catch (error) {
      const authError = mapInfraErrorToAuthError(error);
      if (authError.code === 'network_unavailable') {
        this.stateWriter.setAuthState('offline_authenticated');
        throw authError;
      }
      await this.sessionStorage.clearSession();
      this.stateWriter.setAuthState('reauthentication_required');
      this.stateWriter.setUserId(null);
      this.emit({ type: 'reauthentication_required' });
      throw authError;
    }
  }

  // -------------------------------------------------------------------------
  // Sign-in flows
  // -------------------------------------------------------------------------

  /**
   * Send an OTP to the given email. Does NOT change auth state.
   *
   * SECURITY: the email is forwarded to the provider; this method does
   * not log the email or any OTP.
   */
  async signInWithEmailOtp(email: string): Promise<void> {
    try {
      await this.authProvider.signInWithEmailOtp(email);
    } catch (error) {
      throw mapInfraErrorToAuthError(error);
    }
  }

  /**
   * Verify the OTP. On success: persist session, state → 'authenticated',
   * write audit entry.
   */
  async verifyEmailOtp(email: string, code: string): Promise<AuthSession> {
    let session: AuthSession;
    try {
      session = await this.authProvider.verifyEmailOtp({ email, code });
    } catch (error) {
      throw mapInfraErrorToAuthError(error);
    }
    await this.sessionStorage.saveSession(session);
    this.stateWriter.setAuthState('authenticated');
    this.stateWriter.setUserId(session.userId as string);
    this.emit({ type: 'signed_in', userId: session.userId, provider: session.provider });
    await this.writeAudit('sign_in', session.userId, { provider: session.provider });
    return session;
  }

  /**
   * Sign in with Google OAuth. On success: persist session, state →
   * 'authenticated', write audit entry.
   */
  async signInWithGoogle(): Promise<AuthSession> {
    let session: AuthSession;
    try {
      session = await this.authProvider.signInWithGoogle();
    } catch (error) {
      throw mapInfraErrorToAuthError(error);
    }
    await this.sessionStorage.saveSession(session);
    this.stateWriter.setAuthState('authenticated');
    this.stateWriter.setUserId(session.userId as string);
    this.emit({ type: 'signed_in', userId: session.userId, provider: 'google' });
    await this.writeAudit('sign_in', session.userId, { provider: 'google' });
    return session;
  }

  /**
   * Sign in with Apple OAuth. On success: persist session, state →
   * 'authenticated', write audit entry.
   */
  async signInWithApple(): Promise<AuthSession> {
    let session: AuthSession;
    try {
      session = await this.authProvider.signInWithApple();
    } catch (error) {
      throw mapInfraErrorToAuthError(error);
    }
    await this.sessionStorage.saveSession(session);
    this.stateWriter.setAuthState('authenticated');
    this.stateWriter.setUserId(session.userId as string);
    this.emit({ type: 'signed_in', userId: session.userId, provider: 'apple' });
    await this.writeAudit('sign_in', session.userId, { provider: 'apple' });
    return session;
  }

  // -------------------------------------------------------------------------
  // Sign-out
  // -------------------------------------------------------------------------

  /**
   * Sign out the current cloud user.
   *
   * CRITICAL RULES:
   *   1. Clear tokens from SecureStore (via SessionStorage.clearSession).
   *   2. Call the provider's signOut (clears server-side session).
   *   3. Set auth state to 'signed_out'.
   *   4. Then transition to 'guest' if a guest identity exists locally.
   *   5. NEVER delete local groups, drafts, receipts, sync ops, guest
   *      history, or privacy settings. The user can continue in guest
   *      mode with all their local data intact.
   *
   * If the provider's signOut fails (e.g. network), we still clear local
   * tokens and transition to guest mode — the server-side session will
   * expire naturally. Local data is always preserved.
   */
  async signOut(): Promise<void> {
    const previousUserId = await this.getCurrentUserIdFromStorage();
    // Always clear local tokens, even if the provider call fails.
    try {
      await this.authProvider.signOut();
    } catch (error) {
      // Log but do not rethrow — local sign-out must still complete.
      const mapped = mapInfraErrorToAuthError(error);
      // Swallow the error: the user wants to sign out locally regardless.
      void mapped;
    }
    await this.sessionStorage.clearSession();
    this.stateWriter.setAuthState('signed_out');
    this.stateWriter.setUserId(null);
    this.emit({ type: 'signed_out' });
    await this.writeAudit('sign_out', previousUserId as UserId | undefined, {});

    // Transition to guest mode if a local guest identity exists.
    await this.transitionToGuestOrSignedOut();
  }

  // -------------------------------------------------------------------------
  // Event subscription
  // -------------------------------------------------------------------------

  /**
   * Subscribe to auth lifecycle events. Returns an unsubscribe function.
   */
  onAuthEvent(listener: AuthEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private emit(event: AuthEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not propagate to the caller.
      }
    }
  }

  /**
   * Transition to 'guest' if a guest identity exists locally, otherwise
   * 'signed_out'. Local data is NEVER deleted.
   */
  private async transitionToGuestOrSignedOut(): Promise<void> {
    const hasGuest = await this.hasLocalGuestIdentity();
    if (hasGuest) {
      this.stateWriter.setAuthState('guest');
    } else {
      this.stateWriter.setAuthState('signed_out');
    }
    this.stateWriter.setUserId(null);
  }

  private async hasLocalGuestIdentity(): Promise<boolean> {
    try {
      const list = await this.guestRepo.list({ limit: 1 });
      return list.items.length > 0;
    } catch {
      // If the repository is unavailable (e.g. DB locked), default to
      // 'signed_out' — the user can re-launch the app.
      return false;
    }
  }

  private async getCurrentUserIdFromStorage(): Promise<string | null> {
    const session = await this.sessionStorage.loadSession();
    return session ? (session.userId as string) : null;
  }

  private async writeAudit(
    action: 'sign_in' | 'sign_out' | 'restore_session_failed',
    actorId: UserId | undefined,
    changeSummary: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    try {
      await this.auditRepo.append({
        id: this.generateId(),
        entityType: 'auth_session',
        entityId: actorId ?? 'unknown',
        action: action === 'restore_session_failed' ? 'sync' : 'create',
        actorId,
        changeSummary,
      });
    } catch {
      // Audit failures must not block auth flows. The entry is lost;
      // a future sync attempt will not retry it (audit is best-effort
      // for auth events, unlike financial mutations which are durable).
    }
  }
}
