/**
 * GuestAuthenticationProvider — the honest NULL-OBJECT implementation of
 * `AuthenticationProvider` for devices without a configured Supabase
 * project (or before sign-in).
 *
 * It never fabricates a session: `getSession()` resolves null (→ guest
 * branch in account deletion etc.), and every cloud-only operation fails
 * loudly with an actionable message instead of pretending to succeed.
 * This keeps the `AuthenticationProvider` contract non-optional in the
 * identity services while the app runs offline-first.
 */

import type {
  AuthSession,
  AuthState,
  AuthenticationProvider,
  ProviderIdentityInfo,
  VerifyOtpInput,
  Unsubscribe,
} from '@domain/ports/authentication-provider.port';

const NOT_AVAILABLE =
  'Cloud sign-in is not available: no Supabase project is configured on this device. ' +
  'Set EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY to enable accounts.';

export class GuestAuthenticationProvider implements AuthenticationProvider {
  async getSession(): Promise<AuthSession | null> {
    return null;
  }

  async refreshSession(): Promise<AuthSession> {
    throw new Error(NOT_AVAILABLE);
  }

  async signInWithEmailOtp(): Promise<void> {
    throw new Error(NOT_AVAILABLE);
  }

  async verifyEmailOtp(_input: VerifyOtpInput): Promise<AuthSession> {
    throw new Error(NOT_AVAILABLE);
  }

  async signInWithGoogle(): Promise<AuthSession> {
    throw new Error(NOT_AVAILABLE);
  }

  async signInWithApple(): Promise<AuthSession> {
    throw new Error(NOT_AVAILABLE);
  }

  async getCurrentProviderIdentity(): Promise<ProviderIdentityInfo | null> {
    return null;
  }

  async signOut(): Promise<void> {
    // Guest mode has no cloud session — sign-out is a no-op by design.
  }

  onAuthStateChange(listener: (state: AuthState) => void): Unsubscribe {
    // A guest provider never changes state; the subscription is inert.
    listener('guest');
    return () => {};
  }
}
