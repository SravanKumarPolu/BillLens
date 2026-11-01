/**
 * Services registry — the bridge that makes the composition root
 * reachable from the presentation layer WITHOUT opening the
 * presentation → infrastructure boundary.
 *
 * Why this file exists (architecture note):
 *
 *   The composition root lives in `src/infrastructure/composition-root.ts`
 *   (docs/architecture-boundaries.md §7), but ESLint correctly forbids
 *   presentation files (including `app/**`) from importing
 *   `@infrastructure/*`. The one layer every screen may already import is
 *   the store layer (`@store/*`). This module therefore acts as the
 *   application-scoped SERVICE LOCATOR: the production bootstrap imports
 *   the infrastructure pieces, builds the graph once, and publishes it
 *   here; screens read it via `getAppServices()` / `useAppServicesReady()`.
 *
 *   Screens still consume USE CASES ONLY through this registry — never
 *   adapters — so the boundary's spirit (presentation depends on
 *   application interfaces) is preserved.
 *
 * Lifecycle:
 *   1. `ServicesGate` (mounted in `app/_layout.tsx`) calls
 *      `initAppServices()` once on app start.
 *   2. `initAppServices()` opens the local SQLite database, applies
 *      pending migrations, and builds the composition root with the
 *      production adapters (expo-sqlite, expo-secure-store).
 *   3. Screens / hooks call `tryGetAppServices()` (null-safe) or
 *      `getAppServices()` (throws with guidance if called too early).
 *   4. `startSyncCoordinator()` is invoked after init so the offline
 *      sync loop begins when (and only when) the app shell decides to.
 *
 * Testing:
 *   - `setAppServicesForTesting()` injects a graph built over
 *     `InMemoryDatabase` — used by unit tests.
 *   - `resetAppServices()` drops the cached graph (tests / account
 *     deletion wipe flows).
 */

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { create } from 'zustand';

import { getEnv, hasSupabaseConfig } from '@config/env';
import { ExpoImageHasher, ExpoImageDataReader } from '@infrastructure/capture/expo-image-ports';
import { LazyCaptureProcessor } from '@infrastructure/capture/lazy-capture-processor';
import type { AppServices } from '@infrastructure/composition-root';
import { createCompositionRoot } from '@infrastructure/composition-root';
import { SupabaseAuthenticationProvider } from '@infrastructure/remote/supabase-authentication-provider';
import { SupabaseRemoteSyncPort } from '@infrastructure/remote/supabase-remote-sync-port';
import { ExpoLocalDataWiper } from '@infrastructure/security/expo-local-data-wiper';
import { ExpoSecureStorage } from '@infrastructure/security/expo-secure-store';
import { ExpoSqliteDatabase } from '@infrastructure/sqlite/expo-sqlite-database';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { recoverInterruptedDrafts } from '@infrastructure/sync/draft-recovery';
import { getAuthStoreWriter } from '@store/auth-store';

// ---------------------------------------------------------------------------
// Registry state (single source of truth; readable outside React via
// zustand's `getState()` and inside React via the hooks below).
// ---------------------------------------------------------------------------

type ServicesStatus = 'idle' | 'initializing' | 'ready' | 'error';

interface ServicesRegistryState {
  readonly status: ServicesStatus;
  readonly services: AppServices | null;
  readonly errorMessage: string | null;
}

const useServicesRegistry = create<ServicesRegistryState>()(() => ({
  status: 'idle',
  services: null,
  errorMessage: null,
}));

// ---------------------------------------------------------------------------
// Test / special-flow seams
// ---------------------------------------------------------------------------

/**
 * Injectable factory used by tests to build the graph over in-memory
 * adapters. When null, the production factory is used.
 */
let servicesFactoryOverride:
  | (() => Promise<AppServices>)
  | null = null;

/** Last OCR provider selection reason (diagnostics / sync status screen). */
let lastOcrSelectionReason: string | null = null;

/**
 * Optional warm-up registered by the production factory. Called after the
 * first screen is interactive so launch never waits for OCR construction.
 */
let optionalWarmUp: (() => Promise<void>) | null = null;

export async function warmUpOptionalServices(): Promise<void> {
  if (optionalWarmUp === null) return;
  try {
    await optionalWarmUp();
  } catch {
    // Optional work: a failure must not affect the app.
  }
}

/** Active OCR provider mode ('mock' | 'remote' | 'unavailable'). */
let lastOcrSelectionMode: 'mock' | 'remote' | 'mlkit' | 'unavailable' | null = null;

/** Human-readable explanation of the active OCR provider mode. */
export function getOcrProviderReason(): string | null {
  return lastOcrSelectionReason;
}

/**
 * Active OCR provider mode, or null before initialization.
 *
 * Screens use this to (a) label mock-OCR drafts as DEMO data in the
 * review UI and (b) explain why receipt scanning is unavailable in
 * production builds without a configured OCR backend.
 */
export function getOcrProviderMode(): 'mock' | 'remote' | 'mlkit' | 'unavailable' | null {
  return lastOcrSelectionMode;
}

/**
 * Replace the production bootstrap factory. Call BEFORE
 * `initAppServices()`. Pass null to restore production behaviour.
 */
export function configureAppServicesFactory(
  factory: (() => Promise<AppServices>) | null,
): void {
  servicesFactoryOverride = factory;
}

/**
 * Production bootstrap: open DB → migrate → recover interrupted drafts →
 * select the OCR provider → compose (v2.4.0).
 *
 * OCR selection: `EXPO_PUBLIC_OCR_MODE` overrides; otherwise `remote`
 * when a Supabase project is configured (the ocr-receipt Edge Function
 * deploys with it), else the on-device mock. See
 * `src/infrastructure/capture/ocr-provider-selector.ts`.
 */
/**
 * Production bootstrap: open DB → migrate → recover interrupted drafts →
 * select the OCR provider → compose (v2.4.0).
 *
 * OCR selection: `EXPO_PUBLIC_OCR_MODE` overrides; otherwise `remote`
 * when a Supabase project is configured (the ocr-receipt Edge Function
 * deploys with it), else the on-device mock. See
 * `src/infrastructure/capture/ocr-provider-selector.ts`.
 *
 * Identity (v2.4.0): when Supabase is configured a
 * `SupabaseAuthenticationProvider` is wired; without it the app runs the
 * honest guest-mode provider. Either way the durable local guest
 * identity + account deletion services run over SQLite + SecureStore.
 */
async function productionFactory(): Promise<AppServices> {
  const database = await ExpoSqliteDatabase.open();
  await runMigrations(database);

  // Recover capture/OCR runs interrupted by a crash or force-quit BEFORE
  // any screen reads the pipeline state (resets stuck processing rows so
  // the user can retry or discard — never auto-confirms).
  await recoverInterruptedDrafts(database);

  const env = getEnv();
  const cloudConfigured = hasSupabaseConfig(env);
  const secureStorage = new ExpoSecureStorage();

  // Session token accessor — binds remote sync (and OCR) to the CURRENT
  // user's JWT once a session exists; guests fall back to the anon key.
  //
  // v2.5.0: the accessor DETECTS an expired token (JWT `exp` claim) and
  // triggers a best-effort session refresh through the wired AuthService
  // before handing the token to the sync port / OCR proxy. Previously a
  // token that expired while the app was backgrounded was handed out
  // verbatim until the next full sign-in — every upload 401'd until the
  // port's AUTH_TOKEN_EXPIRED retry path (and nothing ever refreshed).
  const getAccessToken = async (): Promise<string | null> => {
    const readToken = async (): Promise<string | null> => {
      try {
        return await secureStorage.get('billlens.supabase.access_token');
      } catch {
        return null;
      }
    };
    const token = await readToken();
    if (token === null) return null;
    if (!isJwtExpired(token)) return token;
    // Expired — one best-effort refresh attempt. The AuthService
    // persists the refreshed session to SecureStore on success; a
    // network failure leaves the (stale) token in place and the sync
    // port classifies the resulting 401/PGRST301 as retriable, so the
    // op retries with the NEXT refreshed token.
    const services = tryGetAppServices();
    const authService = services?.identity?.authService ?? null;
    if (authService !== null) {
      try {
        await authService.refreshSession();
      } catch {
        // Fall through — hand back whatever we have.
      }
      return readToken();
    }
    return token;
  };

  // OCR is NOT constructed at boot. The proxy resolves the provider on the
  // first capture (or during the post-interaction warm-up below).
  const lazyOcr = new LazyCaptureProcessor(async () => {
    const { resolveOcrProvider } = await import(
      '@infrastructure/capture/ocr-provider-selector'
    );
    const ocr = resolveOcrProvider({
      ...(process.env.EXPO_PUBLIC_OCR_MODE === 'remote' ||
      process.env.EXPO_PUBLIC_OCR_MODE === 'mock'
        ? { modeOverride: process.env.EXPO_PUBLIC_OCR_MODE as 'remote' | 'mock' }
        : {}),
      supabaseUrl: env.supabaseUrl ?? '',
      supabaseAnonKey: env.supabaseAnonKey ?? '',
      // v2.5.0 PRODUCTION GUARD: mock OCR is permitted ONLY in non-
      // production environments. Production builds resolve to the remote
      // provider or to an explicit "unavailable" state.
      allowMock: env.appEnv !== 'production',
      ...(cloudConfigured ? { getAccessToken } : {}),
      loadImageBase64: async (uri) => {
        const reader = new ExpoImageDataReader();
        const data = await reader.read(uri);
        return data.base64;
      },
    });
    lastOcrSelectionReason = ocr.reason;
    lastOcrSelectionMode = ocr.mode;
    return ocr;
  });
  optionalWarmUp = async (): Promise<void> => {
    await lazyOcr.resolve();
  };

  return createCompositionRoot({
    database,
    secureStorage,
    // Lazy: constructed on first capture or warm-up, never at boot.
    captureProcessor: lazyOcr,
    ...(cloudConfigured
      ? {
          supabaseUrl: env.supabaseUrl,
          supabaseAnonKey: env.supabaseAnonKey,
          // Session-bound remote sync: every upload carries the user JWT.
          remoteSync: new SupabaseRemoteSyncPort(
            env.supabaseUrl,
            env.supabaseAnonKey,
            getAccessToken,
          ),
          authProvider: buildSupabaseAuthProvider(env),
        }
      : {}),
    authStateWriter: getAuthStoreWriter(),
    imageReader: new ExpoImageDataReader(),
    imageHasher: new ExpoImageHasher(),
    localWiper: new ExpoLocalDataWiper(database),
    // Production device-secret hash: expo-crypto SHA-256.
    hashDeviceSecret: async (input) => new ExpoImageHasher().hashImageBase64(input),
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
  });
}

/** Build the Supabase auth provider over a fresh supabase-js client. */
function buildSupabaseAuthProvider(env: ReturnType<typeof getEnv>): SupabaseAuthenticationProvider {
  const client = createClient(env.supabaseUrl ?? '', env.supabaseAnonKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  return new SupabaseAuthenticationProvider(client.auth);
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Build and cache the application services graph. Idempotent: concurrent
 * or repeated calls while ready return the existing graph untouched.
 *
 * On failure the registry enters the `error` state with a readable
 * message; a later call retries from scratch (the SQLite layer is
 * opened per attempt, so a transient open failure is recoverable).
 */
export async function initAppServices(): Promise<AppServices> {
  const current = useServicesRegistry.getState();
  if (current.status === 'ready' && current.services !== null) {
    return current.services;
  }

  useServicesRegistry.setState({ status: 'initializing', errorMessage: null });

  try {
    const factory = servicesFactoryOverride ?? productionFactory;
    const services = await factory();
    useServicesRegistry.setState({ status: 'ready', services, errorMessage: null });
    return services;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error while initializing services.';
    useServicesRegistry.setState({ status: 'error', services: null, errorMessage: message });
    throw error;
  }
}

/**
 * Get the wired services. Throws when called before `initAppServices()`
 * has completed — the error names the exact fix (call the init first),
 * which keeps integration mistakes obvious during development.
 */
export function getAppServices(): AppServices {
  const { status, services } = useServicesRegistry.getState();
  if (status === 'ready' && services !== null) {
    return services;
  }
  throw new Error(
    `App services are not initialized (status: ${status}). ` +
      'Call initAppServices() — normally done once by ServicesGate in app/_layout.tsx — ' +
      'before requesting services, or use tryGetAppServices() for null-safe access.',
  );
}

/** Null-safe variant for hooks that render before initialization finishes. */
export function tryGetAppServices(): AppServices | null {
  const { status, services } = useServicesRegistry.getState();
  return status === 'ready' ? services : null;
}

/** Current registry status ('idle' | 'initializing' | 'ready' | 'error'). */
/**
 * True when Supabase is configured. Used by the retention UI to decide
 * whether a group's local copy can be safely purged (it cannot when a
 * pull would restore it).
 */
export function isCloudSyncConfigured(): boolean {
  return hasSupabaseConfig(getEnv());
}

export function getServicesStatus(): ServicesStatus {
  return useServicesRegistry.getState().status;
}

/** Drop the cached graph. Tests and the account-deletion wipe use this. */
export function resetAppServices(): void {
  useServicesRegistry.setState({ status: 'idle', services: null, errorMessage: null });
}

/**
 * Test-only injection of a fully-built graph. Bypasses the factory so a
 * test can share its own in-memory database with assertions.
 */
export function setAppServicesForTesting(services: AppServices | null): void {
  useServicesRegistry.setState(
    services === null
      ? { status: 'idle', services: null, errorMessage: null }
      : { status: 'ready', services, errorMessage: null },
  );
}

// ---------------------------------------------------------------------------
// Sync coordinator lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the offline-sync loop (connectivity subscription + stuck-op
 * recovery). Safe to call repeatedly — `SyncCoordinator.start()` guards
 * against double-start. Returns silently when services are not ready so
 * callers do not need their own guards.
 *
 * v2.4.0: when no Supabase project is configured the loop is NOT
 * started — the app is offline-first and the queue stays local. The
 * sync status screen surfaces "not configured" honestly instead of
 * manufacturing permanent failures for every queued operation.
 */
export async function startSyncCoordinator(): Promise<void> {
  const services = tryGetAppServices();
  if (services === null) return;
  if (!hasSupabaseConfig(getEnv())) return; // deferred until cloud is configured
  await services.sync.coordinator.start();
}

/** Stop the offline-sync loop (app background / tests / wipe flows). */
export async function stopSyncCoordinator(): Promise<void> {
  const services = tryGetAppServices();
  if (services === null) return;
  await services.sync.coordinator.stop();
}

// ---------------------------------------------------------------------------
// React surface
// ---------------------------------------------------------------------------

/**
 * Subscribe to the registry status from React. Screens use this to
 * decide between "real data" and "not yet initialized" rendering
 * without try/catching the registry.
 */
export function useServicesStatus(): ServicesStatus {
  return useServicesRegistry((s) => s.status);
}

/** Convenience hook: true once the graph is built and published. */
export function useAppServicesReady(): boolean {
  return useServicesRegistry((s) => s.status === 'ready' && s.services !== null);
}

/** Convenience hook: the initialization error message, or null. */
export function useServicesError(): string | null {
  return useServicesRegistry((s) => s.errorMessage);
}

// ---------------------------------------------------------------------------
// JWT expiry helper (v2.5.0)
// ---------------------------------------------------------------------------

/**
 * Best-effort check of a Supabase JWT's `exp` claim. Returns false for
 * anything unparseable (let the server decide) — this ONLY gates the
 * opportunistic refresh in `getAccessToken`, never a security decision.
 */
function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = parts[1] ?? '';
    const decoded = globalThis.atob !== undefined
      ? globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
      : Buffer.from(payload, 'base64').toString('binary');
    const claims = JSON.parse(decoded) as { exp?: number };
    if (typeof claims.exp !== 'number') return false;
    // Consider tokens expiring within 30s already stale — the upload
    // round-trip would otherwise race the expiry.
    return claims.exp * 1000 <= Date.now() + 30_000;
  } catch {
    return false;
  }
}
