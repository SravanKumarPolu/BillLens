/**
 * OCR provider selection (v2.5.0).
 *
 * Resolves which `CaptureProcessor` implementation the app uses:
 *
 *   - `mock`        — the on-device `MockCaptureProcessor` (offline,
 *                     deterministic, no cost). Development/staging ONLY.
 *                     Its results are sample data and are always labelled
 *                     as such in the review UI.
 *   - `remote`      — `RemoteOcrCaptureProcessor` against the Supabase
 *                     Edge Function `ocr-receipt`. Requires the project
 *                     URL + anon key; the provider credential stays
 *                     server-side.
 *   - `unavailable` — no usable OCR provider. `process()` fails with a
 *                     typed `NOT_CONFIGURED` error that the capture UI
 *                     maps to an explicit "Receipt scanning unavailable"
 *                     state (manual expense entry remains available).
 *
 * Production guarantee (v2.5.0 regression fix):
 *   Mock OCR can NEVER be selected for production users. The caller must
 *   pass `allowMock: false` in production builds (derived from the
 *   validated `EXPO_PUBLIC_APP_ENV`). When mock is refused and no remote
 *   provider is configured, the selection is `unavailable` — never a
 *   silent fallback to sample data presented as a real scan.
 *
 * Selection order (first match wins):
 *   1. Explicit `EXPO_PUBLIC_OCR_MODE` (mock | remote) — overrides.
 *      `remote` without configuration → `unavailable`.
 *      `mock` in production → `unavailable` (refused).
 *   2. `remote` when a Supabase project is configured (offline
 *      development can still force `EXPO_PUBLIC_OCR_MODE=mock`).
 *   3. `mock` when `allowMock` is true (non-production environments).
 *   4. `unavailable` otherwise.
 *
 * The choice is logged ONCE at boot via the injected logger (no PII —
 * endpoint host only, never the key).
 */

import type { CaptureProcessor } from '@domain/ports/capture-processor.port';

import { MockCaptureProcessor } from './mock-capture-processor';
import { RemoteOcrCaptureProcessor } from './remote-ocr-capture-processor';
import { UnavailableCaptureProcessor } from './unavailable-capture-processor';

export type OcrMode = 'mock' | 'remote' | 'unavailable';

/** Modes a caller may force via EXPO_PUBLIC_OCR_MODE. */
export type OcrModeOverride = Exclude<OcrMode, 'unavailable'>;

export interface OcrProviderConfig {
  /** Explicit mode override (EXPO_PUBLIC_OCR_MODE). */
  readonly modeOverride?: OcrModeOverride;
  /** Supabase project URL (empty → remote impossible). */
  readonly supabaseUrl: string;
  /** Supabase anon key (empty → remote impossible). */
  readonly supabaseAnonKey: string;
  /**
   * Whether the on-device mock processor may be selected at all.
   * MUST be `false` for production builds — mock OCR results are sample
   * data and must never reach production users as if they were real
   * extractions. Derive from the validated environment:
   * `env.appEnv !== 'production'`.
   */
  readonly allowMock: boolean;
  /** Supplies the current user JWT for the Authorization header. */
  readonly getAccessToken?: () => Promise<string | null>;
  /** Reads the image at a local URI as base64. */
  readonly loadImageBase64: (uri: string) => Promise<string>;
  /** Optional fetch injection (tests). */
  readonly fetchImpl?: typeof fetch;
}

export interface OcrProviderSelection {
  readonly mode: OcrMode;
  readonly processor: CaptureProcessor;
  /** Endpoint actually used (remote mode only). */
  readonly endpoint?: string;
  /** Human-readable explanation — surfaced by the sync/OCR diagnostics. */
  readonly reason: string;
}

/** Default Edge Function path within the Supabase project. */
export const OCR_EDGE_FUNCTION_PATH = '/functions/v1/ocr-receipt';

export function resolveOcrProvider(config: OcrProviderConfig): OcrProviderSelection {
  const remotePossible =
    config.supabaseUrl.length > 0 && config.supabaseAnonKey.length > 0;

  if (config.modeOverride === 'remote') {
    if (!remotePossible) {
      // v2.5.0: forced remote without configuration is an explicit,
      // visible "unavailable" state — NOT a silent mock fallback. A
      // production user must never receive sample extraction data.
      return unavailable(
        'OCR mode was forced to remote but no Supabase project is configured — ' +
          'receipt scanning is unavailable. Set EXPO_PUBLIC_SUPABASE_URL and ' +
          'EXPO_PUBLIC_SUPABASE_ANON_KEY (and deploy the ocr-receipt Edge Function) ' +
          'to enable it, or add expenses manually.',
      );
    }
    return buildRemote(config);
  }

  if (config.modeOverride === 'mock') {
    if (!config.allowMock) {
      // v2.5.0: production builds refuse the mock provider outright —
      // even when explicitly requested — so sample data can never be
      // presented as real extraction in a release build.
      return unavailable(
        'Mock OCR was explicitly selected but is not permitted in production builds — ' +
          'receipt scanning is unavailable. Deploy the ocr-receipt Edge Function and ' +
          'remove EXPO_PUBLIC_OCR_MODE=mock, or add expenses manually.',
      );
    }
    return {
      mode: 'mock',
      processor: new MockCaptureProcessor(),
      reason: 'OCR mode explicitly set to mock (EXPO_PUBLIC_OCR_MODE=mock).',
    };
  }

  if (remotePossible) {
    return buildRemote(config);
  }

  if (config.allowMock) {
    return {
      mode: 'mock',
      processor: new MockCaptureProcessor(),
      reason:
        'No Supabase project configured — using the on-device mock processor (sample data, ' +
        'labelled as demo in the review UI). Configure EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY (and deploy the ocr-receipt Edge Function, see ' +
        'supabase/functions/ocr-receipt/) to enable live OCR.',
    };
  }

  return unavailable(
    'No OCR provider is configured — receipt scanning is unavailable. ' +
      'Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (and deploy the ' +
      'ocr-receipt Edge Function, see supabase/functions/ocr-receipt/), or add expenses manually.',
  );
}

function buildRemote(config: OcrProviderConfig): OcrProviderSelection {
  const endpoint = `${config.supabaseUrl.replace(/\/+$/, '')}${OCR_EDGE_FUNCTION_PATH}`;
  const processor = new RemoteOcrCaptureProcessor({
    endpoint,
    anonKey: config.supabaseAnonKey,
    ...(config.getAccessToken !== undefined
      ? { getAccessToken: config.getAccessToken }
      : {}),
    loadImageBase64: config.loadImageBase64,
    ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
  });
  return {
    mode: 'remote',
    processor,
    endpoint,
    reason: `Live OCR via the ocr-receipt Edge Function (${safeHost(config.supabaseUrl)}).`,
  };
}

function unavailable(reason: string): OcrProviderSelection {
  return {
    mode: 'unavailable',
    processor: new UnavailableCaptureProcessor(),
    reason,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'configured-host';
  }
}
