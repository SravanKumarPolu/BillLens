import { beforeEach, describe, expect, it } from '@jest/globals';

import { parseEnv, clearEnvCache, hasSupabaseConfig } from '../env';

describe('env configuration', () => {
  beforeEach(() => {
    clearEnvCache();
  });

  describe('parseEnv', () => {
    it('parses a valid development env', () => {
      const env = parseEnv({
        appEnv: 'development',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'fake-anon-key',
      });
      expect(env.appEnv).toBe('development');
      expect(env.supabaseUrl).toBe('https://example.supabase.co');
      expect(env.supabaseAnonKey).toBe('fake-anon-key');
      expect(env.easProjectId).toBeUndefined();
    });

    it('parses a valid production env with EAS project ID', () => {
      const env = parseEnv({
        appEnv: 'production',
        supabaseUrl: 'https://prod.supabase.co',
        supabaseAnonKey: 'prod-anon-key',
        easProjectId: 'abc123',
      });
      expect(env.appEnv).toBe('production');
      expect(env.easProjectId).toBe('abc123');
    });

    it('parses a valid staging env', () => {
      const env = parseEnv({
        appEnv: 'staging',
        supabaseUrl: 'https://staging.supabase.co',
        supabaseAnonKey: 'staging-anon-key',
      });
      expect(env.appEnv).toBe('staging');
    });

    it('defaults appEnv to development when not provided', () => {
      const env = parseEnv({
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'key',
      });
      expect(env.appEnv).toBe('development');
    });

    it('rejects invalid app env', () => {
      expect(() =>
        parseEnv({
          appEnv: 'qa',
          supabaseUrl: 'https://example.supabase.co',
          supabaseAnonKey: 'key',
        }),
      ).toThrow(/appEnv/i);
    });

    it('rejects invalid supabase URL', () => {
      expect(() =>
        parseEnv({
          appEnv: 'development',
          supabaseUrl: 'not-a-url',
          supabaseAnonKey: 'key',
        }),
      ).toThrow(/supabaseUrl/i);
    });

    it('treats empty anon key as not-configured (offline-first boot)', () => {
      // v2.4.0 contract: the app must boot without cloud configuration —
      // cloud sync stays deferred rather than failing startup. An empty
      // anon key is therefore valid and simply reports "not configured".
      const env = parseEnv({
        appEnv: 'development',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: '',
      });
      expect(hasSupabaseConfig(env)).toBe(false);
    });

    it('parses a missing supabase URL as not-configured (offline-first boot)', () => {
      // v2.4.0 contract: missing URL defaults to "" and the environment
      // still validates — the app is fully usable offline.
      const env = parseEnv({
        appEnv: 'development',
        supabaseAnonKey: 'key',
      });
      expect(env.supabaseUrl).toBe('');
      expect(hasSupabaseConfig(env)).toBe(false);
    });

    it('reports hasSupabaseConfig true only when both values are present', () => {
      const env = parseEnv({
        appEnv: 'development',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'anon-key',
      });
      expect(hasSupabaseConfig(env)).toBe(true);
    });

    it('error message references .env.example for discoverability', () => {
      let caught: Error | null = null;
      try {
        parseEnv({ appEnv: 'qa' });
      } catch (err) {
        caught = err as Error;
      }
      expect(caught).not.toBeNull();
      expect(caught!.message).toContain('.env.example');
    });
  });
});
