/**
 * SupabaseAuthenticationProvider — production `AuthenticationProvider`
 * adapter over `supabase.auth` (v2.4.0).
 *
 * Implements: session get/refresh, email-OTP sign-in (+ verify),
 * Google/Apple OAuth (via `signInWithOAuth` with deep-link redirect),
 * sign-out, provider-identity introspection, and auth-state event
 * mapping onto the domain `AuthState` machine.
 *
 * Credential posture: the adapter is constructed with the SAME public
 * Supabase URL + anon key the sync port uses (RLS-scoped, safe to
 * embed). No service-role secrets — ever.
 *
 * Token handling rules honoured (see the port docs):
 *   - Tokens are returned in memory only; persistence is SessionStorage's
 *     job. This adapter never writes tokens to AsyncStorage/SQLite.
 *   - OTPs / tokens are never logged (errors stringify codes only).
 *
 * TESTING HONESTY: the unit tests inject a fake supabase auth client.
 * The adapter has NOT been exercised against a live Supabase project —
 * that remains blocked on provisioning (see docs). The contract is,
 * however, fully covered: session mapping, expiry handling, event
 * mapping, sign-out semantics, and error propagation.
 */

import type {
  AuthSession,
  AuthState,
  AuthenticationProvider,
  ProviderIdentityInfo,
  VerifyOtpInput,
  Unsubscribe,
  AuthProviderType,
} from '@domain/ports/authentication-provider.port';
import type { AuthChangeEvent } from '@domain/ports/supabase-auth-events';

/** The subset of supabase-js auth this adapter needs (injectable for tests). */
export interface SupabaseAuthClient {
  getSession(): Promise<{
    data: { session: SupabaseSession | null };
    error: { message: string } | null;
  }>;
  refreshSession(currentSession?: { refresh_token: string }): Promise<{
    data: { session: SupabaseSession | null };
    error: { message: string } | null;
  }>;
  signInWithOtp(credentials: { email: string }): Promise<{ error: { message: string } | null }>;
  verifyOtp(params: {
    email: string;
    token: string;
    type: 'email';
  }): Promise<{ data: { session: SupabaseSession | null }; error: { message: string } | null }>;
  signInWithOAuth(params: {
    provider: 'google' | 'apple';
    options: { redirectTo: string };
  }): Promise<{ data: { url: string | null }; error: { message: string } | null }>;
  signOut(): Promise<{ error: { message: string } | null }>;
  onAuthStateChange(
    listener: (event: string, session: SupabaseSession | null) => void,
  ): { data: { subscription: { unsubscribe: () => void } } };
  getUser(jwt?: string): Promise<{
    data: { user: SupabaseUser | null };
    error: { message: string } | null;
  }>;
}

export interface SupabaseSession {
  user: { id: string; email?: string | null; app_metadata?: Record<string, unknown> } | null;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
}

export interface SupabaseUser {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
}

/** Maps supabase sign-in method metadata to the domain provider type. */
function providerTypeFromSession(session: SupabaseSession): AuthProviderType {
  const meta = session.user?.app_metadata ?? {};
  const provider = typeof meta['provider'] === 'string' ? meta['provider'] : undefined;
  const strategies = Array.isArray(meta['providers']) ? meta['providers'] : [];
  if (provider === 'google' || strategies.includes('google')) return 'google';
  if (provider === 'apple' || strategies.includes('apple')) return 'apple';
  return 'email';
}

export class SupabaseAuthenticationProvider implements AuthenticationProvider {
  constructor(private readonly auth: SupabaseAuthClient) {}

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await this.auth.getSession();
    if (error !== null) {
      // SIGNED_OUT and initialising both surface as (session, null).
      throw new Error(`Supabase session lookup failed: ${error.message}`);
    }
    return mapSession(data.session);
  }

  async refreshSession(): Promise<AuthSession> {
    const { data, error } = await this.auth.refreshSession();
    if (error !== null || data.session === null) {
      throw new Error(
        error !== null
          ? `Session refresh failed: ${error.message}`
          : 'Session refresh returned no session — sign in again.',
      );
    }
    return mapSession(data.session)!;
  }

  async signInWithEmailOtp(email: string): Promise<void> {
    const { error } = await this.auth.signInWithOtp({ email });
    if (error !== null) {
      throw new Error(`Could not send the login code: ${error.message}`);
    }
  }

  async verifyEmailOtp(input: VerifyOtpInput): Promise<AuthSession> {
    const { data, error } = await this.auth.verifyOtp({
      email: input.email,
      token: input.code,
      type: 'email',
    });
    if (error !== null || data.session === null) {
      throw new Error(
        error !== null ? `Invalid login code: ${error.message}` : 'Verification returned no session.',
      );
    }
    return mapSession(data.session)!;
  }

  async signInWithGoogle(): Promise<AuthSession> {
    return this.oauthSignIn('google');
  }

  async signInWithApple(): Promise<AuthSession> {
    return this.oauthSignIn('apple');
  }

  /**
   * OAuth on native: supabase-js returns an authorization URL; the app
   * opens it in the system browser / WebBrowser session and Supabase
   * redirects back to the `billlens://` deep link, where the session
   * lands via onAuthStateChange. This method therefore returns the
   * session WHEN it is immediately available (rare on native) and
   * otherwise throws a typed, actionable error telling the caller to
   * await the auth-state event.
   */
  private async oauthSignIn(provider: 'google' | 'apple'): Promise<AuthSession> {
    const { data, error } = await this.auth.signInWithOAuth({
      provider,
      options: { redirectTo: 'billlens://auth/callback' },
    });
    if (error !== null) {
      throw new Error(`Could not start ${provider} sign-in: ${error.message}`);
    }
    // The browser flow completes out-of-band. If the platform returned an
    // immediate session (web), use it; otherwise the caller awaits the
    // auth-state listener (the standard native flow).
    const session = await this.auth.getSession();
    if (session.data.session !== null && session.error === null) {
      return mapSession(session.data.session)!;
    }
    throw new OAuthRedirectPending(
      `Complete the ${provider} sign-in in your browser — BillLens will continue automatically.`,
      data.url ?? undefined,
    );
  }

  async getCurrentProviderIdentity(): Promise<ProviderIdentityInfo | null> {
    const { data, error } = await this.auth.getUser();
    if (error !== null || data.user === null) return null;
    const provider = providerTypeFromSession({
      user: data.user,
      access_token: '',
    });
    return {
      provider,
      providerSubject: data.user.id,
      ...(data.user.email != null ? { providerEmail: data.user.email } : {}),
    };
  }

  async signOut(): Promise<void> {
    const { error } = await this.auth.signOut();
    if (error !== null) {
      throw new Error(`Sign out failed: ${error.message}`);
    }
  }

  onAuthStateChange(listener: (state: AuthState) => void): Unsubscribe {
    const { data } = this.auth.onAuthStateChange((event, session) => {
      listener(mapAuthEvent(event as AuthChangeEvent, session));
    });
    return () => data.subscription.unsubscribe();
  }
}

/** Typed error: the OAuth redirect is pending in the browser. */
export class OAuthRedirectPending extends Error {
  readonly authorizationUrl: string | null;
  constructor(message: string, authorizationUrl?: string) {
    super(message);
    this.name = 'OAuthRedirectPending';
    this.authorizationUrl = authorizationUrl ?? null;
  }
}

function mapSession(session: SupabaseSession | null): AuthSession | null {
  if (session === null || session.user === null) return null;
  if (typeof session.access_token !== 'string' || session.access_token.length === 0) return null;
  const expiresAt =
    typeof session.expires_at === 'number'
      ? session.expires_at * 1000
      : Date.now() + (typeof session.expires_in === 'number' ? session.expires_in * 1000 : 3600_000);
  return {
    userId: session.user.id as never,
    accessToken: session.access_token,
    refreshToken: session.refresh_token ?? '',
    expiresAt,
    provider: providerTypeFromSession(session),
  };
}

/** Map supabase auth events onto the domain AuthState machine. */
export function mapAuthEvent(event: AuthChangeEvent, session: SupabaseSession | null): AuthState {
  if (session !== null && mapSession(session) !== null) {
    return 'authenticated';
  }
  switch (event) {
    case 'SIGNED_IN':
    case 'TOKEN_REFRESHED':
    case 'USER_UPDATED':
      // No session payload — treat as authenticated only when a session
      // follows; conservatively report authenticated and let getSession()
      // resolve the truth.
      return 'authenticated';
    case 'SIGNED_OUT':
      return 'signed_out';
    default:
      return 'guest';
  }
}
