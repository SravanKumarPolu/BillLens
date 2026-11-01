import { z } from 'zod';

/**
 * BillLens environment configuration.
 *
 * Public mobile variables (EXPO_PUBLIC_*) are safe to embed in the mobile
 * bundle because they are scoped by Supabase Row Level Security.
 *
 * Private secrets (service-role keys, OCR credentials, signing secrets) must
 * NEVER appear here — they belong only in Supabase Edge Functions and other
 * server-side environments.
 */

const AppEnvSchema = z.enum(['development', 'staging', 'production']);

const EnvSchema = z.object({
  appEnv: AppEnvSchema,
  // Optional — the app is offline-first and must boot without cloud
  // configuration. When provided, the values are shape-validated; the
  // sync layer treats "not configured" as a deferred (not failed) state.
  supabaseUrl: z
    .union([z.literal(''), z.string().url('EXPO_PUBLIC_SUPABASE_URL must be a valid URL')])
    .optional(),
  supabaseAnonKey: z.string().optional(),
  easProjectId: z.string().min(1).optional(),
});

export type AppEnv = z.infer<typeof AppEnvSchema>;
export type Env = z.infer<typeof EnvSchema>;
export type RawEnv = Record<string, string | undefined>;

/** True when a Supabase project is configured for cloud sync. */
export function hasSupabaseConfig(env: Env): boolean {
  return typeof env.supabaseUrl === 'string'
    && env.supabaseUrl.length > 0
    && typeof env.supabaseAnonKey === 'string'
    && env.supabaseAnonKey.length > 0;
}

/**
 * Read process.env into a normalized RawEnv record.
 * Exposed for testing — production code should call {@link getEnv}.
 */
export function readProcessEnv(): RawEnv {
  return {
    appEnv: process.env.EXPO_PUBLIC_APP_ENV,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    easProjectId: process.env.EAS_PROJECT_ID,
  };
}

/**
 * Validate a raw env record and return a typed {@link Env}.
 * Throws a single, human-readable Error listing all issues.
 *
 * Pure function — safe to call from tests.
 */
export function parseEnv(raw: RawEnv): Env {
  // In production, EXPO_PUBLIC_APP_ENV must be explicitly set — never default
  // to "development", otherwise a misconfigured prod build would silently run
  // with dev-only behaviour (e.g. verbose logging, relaxed validation,
  // disabled telemetry). The Zod schema below will reject `undefined` and
  // produce a clear error message.
  if (!raw.appEnv && process.env.NODE_ENV === 'production') {
    throw new Error(
      'EXPO_PUBLIC_APP_ENV must be explicitly set in production (cannot default to development).',
    );
  }

  // Apply defaults before parsing so an unspecified appEnv resolves to
  // "development" rather than failing — but only in non-production runtimes.
  // The guard above already blocks the prod-without-appEnv case.
  const withDefaults: RawEnv = {
    appEnv: raw.appEnv ?? 'development',
    supabaseUrl: raw.supabaseUrl ?? '',
    supabaseAnonKey: raw.supabaseAnonKey ?? '',
    easProjectId: raw.easProjectId,
  };

  const result = EnvSchema.safeParse(withDefaults);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => {
        const path = i.path.join('.') || '(root)';
        return `  - ${path}: ${i.message}`;
      })
      .join('\n');
    throw new Error(
      `Invalid BillLens environment configuration:\n${issues}\n\n` +
        'Check your .env.local file against .env.example.',
    );
  }
  return result.data;
}

let cachedEnv: Env | null = null;

/**
 * Get the validated environment, caching the result.
 * Throws if validation fails. Subsequent calls return the cached value.
 */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  cachedEnv = parseEnv(readProcessEnv());
  return cachedEnv;
}

/** Reset the env cache. Used by tests; not needed in production. */
export function clearEnvCache(): void {
  cachedEnv = null;
}

export function isDevEnv(): boolean {
  return getEnv().appEnv === 'development';
}

export function isStagingEnv(): boolean {
  return getEnv().appEnv === 'staging';
}

export function isProdEnv(): boolean {
  return getEnv().appEnv === 'production';
}
