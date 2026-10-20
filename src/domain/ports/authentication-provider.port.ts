import type { UserId } from '@shared-types/index';

/**
 * AuthenticationProvider port — declared in the domain layer, implemented
 * by infrastructure (Supabase in production, mocks in tests).
 *
 * This is a STRICT superset of the legacy `AuthProvider` interface that
 * lived inside `IdentityService`. The legacy interface is retained on
 * `IdentityService` for backwards compatibility with Phase 1 tests; new
 * Phase 3 code should depend on this port.
 *
 * The port exposes:
 *   - Session retrieval / refresh (for restore-on-launch).
 *   - Email-OTP, Google, and Apple sign-in flows.
 *   - Sign-out (clears tokens on the provider side).
 *   - A subscribe-style listener for auth-state changes.
 *
 * CRITICAL: implementations must NEVER log OTPs, tokens, or refresh
 * tokens. The `AuthSession` returned by these methods contains the
 * access/refresh tokens in memory only — persistence is the caller's
 * responsibility (see `SessionStorage`).
 */

/**
 * A live auth session. Tokens are short-lived; `refreshToken` is used to
 * obtain a new `accessToken` after `expiresAt`.
 */
export interface AuthSession {
  readonly userId: UserId;
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch milliseconds when the access token expires. */
  readonly expiresAt: number;
  readonly provider: AuthProviderType;
}

/**
 * The authentication provider that produced the session. Mirrors the
 * sign-in methods exposed below.
 */
export type AuthProviderType = 'email' | 'google' | 'apple';

/**
 * Auth state machine.
 *
 * - `initialising`        — app is restoring the session on launch.
 * - `guest`               — no cloud account; a local GuestIdentity is active.
 * - `authenticated`       — a valid cloud session is active.
 * - `session_expired`     — the access token has expired; refresh is in flight.
 * - `reauthentication_required` — the refresh token is invalid; user must sign in again.
 * - `offline_authenticated` — a cached session is being used while offline.
 * - `signed_out`          — user signed out; no cloud session. Local data is intact.
 * - `error`               — an unexpected error occurred.
 *
 * Note: `signed_out` is NOT the same as `guest`. After sign-out, the app
 * may transition to `guest` mode if a guest identity exists locally.
 */
export type AuthState =
  | 'initialising'
  | 'guest'
  | 'authenticated'
  | 'session_expired'
  | 'reauthentication_required'
  | 'offline_authenticated'
  | 'signed_out'
  | 'error';

/**
 * Input to {@link AuthenticationProvider.verifyEmailOtp}.
 */
export interface VerifyOtpInput {
  readonly email: string;
  readonly code: string;
}

/**
 * Provider-issued identity information for the currently signed-in
 * user. Returned by {@link AuthenticationProvider.getCurrentProviderIdentity}.
 *
 * CRITICAL: `providerSubject` is the stable, unique identifier issued
 * by the provider (e.g. Google's `sub` claim, Apple's `user`
 * identifier, Supabase's user UUID for email OTP). It is used as the
 * link key in {@link LinkedAuthIdentity} — NEVER use `providerEmail`
 * as the link key, because emails are mutable.
 *
 * `providerEmail` may be undefined (e.g. Apple sign-in with "Hide My
 * Email" returns only the private relay address, which the provider
 * may omit on subsequent sign-ins).
 */
export interface ProviderIdentityInfo {
  readonly provider: AuthProviderType;
  readonly providerSubject: string;
  readonly providerEmail?: string;
}

/**
 * Subscription unsubscribe function returned by
 * {@link AuthenticationProvider.onAuthStateChange}.
 */
export type Unsubscribe = () => void;

export interface AuthenticationProvider {
  /**
   * Get the current session, or null if not signed in.
   *
   * Implementations may consult a local cache; they must NOT perform a
   * network round-trip on every call.
   */
  getSession(): Promise<AuthSession | null>;

  /**
   * Refresh the session using the stored refresh token. Returns a new
   * session with a fresh access token. Throws if the refresh token is
   * invalid or expired.
   */
  refreshSession(): Promise<AuthSession>;

  /**
   * Send a one-time password to the given email. The user enters the
   * code, which is then verified by {@link verifyEmailOtp}.
   */
  signInWithEmailOtp(email: string): Promise<void>;

  /**
   * Verify the OTP code entered by the user. Returns a session on success.
   */
  verifyEmailOtp(input: VerifyOtpInput): Promise<AuthSession>;

  /**
   * Sign in with Google OAuth. Returns a session on success.
   */
  signInWithGoogle(): Promise<AuthSession>;

  /**
   * Sign in with Apple OAuth. Returns a session on success.
   */
  signInWithApple(): Promise<AuthSession>;

  /**
   * Return the provider-issued identity info (provider type, subject,
   * optional email) for the currently signed-in user, or null if not
   * signed in.
   *
   * Used by the social-auth use cases to look up
   * {@link LinkedAuthIdentity} records by `(provider, providerSubject)`
   * — the stable link key. Implementations MUST return the provider
   * subject verbatim; they MUST NOT substitute the email for the
   * subject.
   */
  getCurrentProviderIdentity(): Promise<ProviderIdentityInfo | null>;

  /**
   * Sign out the current user. Clears tokens on the provider side.
   *
   * IMPORTANT: this does NOT delete local data. Local groups, drafts,
   * receipts, sync ops, guest history, and privacy settings are
   * preserved so the user can continue in guest mode.
   */
  signOut(): Promise<void>;

  /**
   * Subscribe to auth-state changes. Returns an unsubscribe function.
   * The listener is invoked immediately with the current state when
   * first attached (implementations may choose to defer this to the
   * next tick to avoid re-entrancy).
   */
  onAuthStateChange(listener: (state: AuthState) => void): Unsubscribe;
}
