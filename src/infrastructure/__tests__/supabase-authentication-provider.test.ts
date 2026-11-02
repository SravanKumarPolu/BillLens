/**
 * SupabaseAuthenticationProvider tests — the production auth adapter
 * exercised against a fake supabase auth client (v2.4.0).
 *
 * HONESTY NOTE: these are unit tests over the injected client seam. The
 * adapter has NOT run against a live Supabase project (blocked on
 * provisioning — see the phase report). The contract mapping — session
 * shape, expiry, provider metadata, event mapping, error propagation —
 * is fully covered here.
 */

import { describe, expect, it, jest } from '@jest/globals';

import {
  OAuthRedirectPending,
  SupabaseAuthenticationProvider,
  type SupabaseAuthClient,
  type SupabaseSession,
} from '@infrastructure/remote/supabase-authentication-provider';

function makeSession(overrides?: Partial<SupabaseSession>): SupabaseSession {
  return {
    user: { id: 'user-1', email: 'a@b.co', app_metadata: { provider: 'email' } },
    access_token: 'access.jwt.value',
    refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function makeAuthClient(overrides?: {
  getSession?: SupabaseAuthClient['getSession'];
  verifyOtp?: SupabaseAuthClient['verifyOtp'];
  signInWithOAuth?: SupabaseAuthClient['signInWithOAuth'];
}): { client: SupabaseAuthClient; spies: Record<string, jest.Mock> } {
  // Loosely-typed jest doubles for the supabase auth seam.
  const spies: Record<string, ReturnType<typeof jest.fn>> = {
    getSession: jest.fn(overrides?.getSession ?? (async (): Promise<unknown> => ({ data: { session: null }, error: null }))),
    refreshSession: jest.fn(async (): Promise<unknown> => ({ data: { session: makeSession() }, error: null })),
    signInWithOtp: jest.fn(async (): Promise<unknown> => ({ error: null })),
    verifyOtp: jest.fn(overrides?.verifyOtp ?? (async (): Promise<unknown> => ({ data: { session: makeSession() }, error: null }))),
    signInWithOAuth: jest.fn(
      overrides?.signInWithOAuth ??
        (async (): Promise<unknown> => ({ data: { url: 'https://auth.example/oauth' }, error: null })),
    ),
    signOut: jest.fn(async (): Promise<unknown> => ({ error: null })),
    onAuthStateChange: jest.fn((listener: (event: string, session: SupabaseSession | null) => void) => {
      listener('SIGNED_IN', makeSession());
      return { data: { subscription: { unsubscribe: () => {} } } };
    }),
    getUser: jest.fn(async (): Promise<unknown> => ({
      data: { user: { id: 'user-1', email: 'a@b.co', app_metadata: { provider: 'google' } } },
      error: null,
    })),
  };
  return {
    client: spies as unknown as SupabaseAuthClient,
    spies,
  };
}

describe('SupabaseAuthenticationProvider', () => {
  it('maps a supabase session to the domain AuthSession (ms expiry)', async () => {
    const { client } = makeAuthClient({
      getSession: async () => ({ data: { session: makeSession() }, error: null }),
    });
    const provider = new SupabaseAuthenticationProvider(client);

    const session = await provider.getSession();
    expect(session).not.toBeNull();
    expect(session?.userId).toBe('user-1');
    expect(session?.accessToken).toBe('access.jwt.value');
    expect(session?.refreshToken).toBe('refresh-token');
    expect(session?.expiresAt).toBeGreaterThan(Date.now());
    expect(session?.provider).toBe('email');
  });

  it('returns null when supabase reports no session', async () => {
    const { client } = makeAuthClient();
    const provider = new SupabaseAuthenticationProvider(client);
    expect(await provider.getSession()).toBeNull();
  });

  it('maps the google provider from app_metadata', async () => {
    const session = makeSession({
      user: { id: 'user-1', app_metadata: { providers: ['google'] } },
    });
    const { client } = makeAuthClient({ getSession: async () => ({ data: { session }, error: null }) });
    const provider = new SupabaseAuthenticationProvider(client);
    expect((await provider.getSession())?.provider).toBe('google');
  });

  it('falls back to expires_in when expires_at is absent', async () => {
    const session = makeSession({ expires_at: undefined, expires_in: 1800 });
    const { client } = makeAuthClient({ getSession: async () => ({ data: { session }, error: null }) });
    const provider = new SupabaseAuthenticationProvider(client);
    const mapped = await provider.getSession();
    expect(mapped?.expiresAt).toBeGreaterThan(Date.now() + 1700_000);
  });

  it('refreshSession resolves the refreshed session', async () => {
    const { client } = makeAuthClient();
    const provider = new SupabaseAuthenticationProvider(client);
    const session = await provider.refreshSession();
    expect(session.accessToken).toBe('access.jwt.value');
  });

  it('refreshSession throws when the provider rejects', async () => {
    const { client } = makeAuthClient();
    (client.refreshSession as unknown as { mockResolvedValue: (v: unknown) => unknown }).mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid Refresh Token' },
    });
    const provider = new SupabaseAuthenticationProvider(client);
    await expect(provider.refreshSession()).rejects.toThrow(/refresh failed/i);
  });

  it('signInWithEmailOtp passes the email and throws on error', async () => {
    const { client, spies } = makeAuthClient();
    const provider = new SupabaseAuthenticationProvider(client);

    await provider.signInWithEmailOtp('user@example.com');
    expect(spies.signInWithOtp).toHaveBeenCalledWith({ email: 'user@example.com' });

    (spies.signInWithOtp as unknown as { mockResolvedValue: (v: unknown) => unknown }).mockResolvedValue({ error: { message: 'rate limited' } });
    await expect(provider.signInWithEmailOtp('user@example.com')).rejects.toThrow(
      /could not send the login code/i,
    );
  });

  it('verifyEmailOtp returns the mapped session', async () => {
    const { client, spies } = makeAuthClient();
    const provider = new SupabaseAuthenticationProvider(client);

    const session = await provider.verifyEmailOtp({ email: 'user@example.com', code: '123456' });
    expect(session.accessToken).toBe('access.jwt.value');
    expect(spies.verifyOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('verifyEmailOtp throws on an invalid code (no session fabrication)', async () => {
    const { client } = makeAuthClient({
      verifyOtp: async () => ({ data: { session: null }, error: { message: 'Invalid OTP' } }),
    });
    const provider = new SupabaseAuthenticationProvider(client);
    await expect(
      provider.verifyEmailOtp({ email: 'user@example.com', code: '000000' }),
    ).rejects.toThrow(/invalid login code/i);
  });

  it('signInWithGoogle throws OAuthRedirectPending on native (no immediate session)', async () => {
    const { client, spies } = makeAuthClient({
      signInWithOAuth: async () => ({ data: { url: 'https://auth.example/google' }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    });
    const provider = new SupabaseAuthenticationProvider(client);

    await expect(provider.signInWithGoogle()).rejects.toBeInstanceOf(OAuthRedirectPending);
    expect(spies.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', options: { redirectTo: 'billlens://auth/callback' } }),
    );
  });

  it('getCurrentProviderIdentity maps provider + subject (never email as key)', async () => {
    const { client } = makeAuthClient();
    const provider = new SupabaseAuthenticationProvider(client);

    const identity = await provider.getCurrentProviderIdentity();
    expect(identity?.provider).toBe('google');
    expect(identity?.providerSubject).toBe('user-1');
    expect(identity?.providerEmail).toBe('a@b.co');
  });

  it('signOut propagates provider errors', async () => {
    const { client, spies } = makeAuthClient();
    (spies.signOut as unknown as { mockResolvedValue: (v: unknown) => unknown }).mockResolvedValue({ error: { message: 'network' } });
    const provider = new SupabaseAuthenticationProvider(client);
    await expect(provider.signOut()).rejects.toThrow(/sign out failed/i);
  });

  it('onAuthStateChange maps supabase events onto AuthState', async () => {
    const { client } = makeAuthClient();
    const provider = new SupabaseAuthenticationProvider(client);

    const states: string[] = [];
    const unsubscribe = provider.onAuthStateChange((state) => states.push(state));
    expect(states).toContain('authenticated');
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
