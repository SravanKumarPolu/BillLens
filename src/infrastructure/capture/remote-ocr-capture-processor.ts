/**
 * RemoteOcrCaptureProcessor — production `CaptureProcessor` adapter
 * (v2.4.0) that sends the captured image to a backend OCR proxy
 * (Supabase Edge Function `ocr-receipt`) and maps the validated response
 * into the domain `ExtractionResult`.
 *
 * WHY A BACKEND PROXY (architecture decision):
 *   Cloud OCR credentials (Google Cloud Vision / Azure / AWS) must NEVER
 *   be embedded in the mobile bundle. The app only holds the Supabase
 *   project URL + anon key (RLS-scoped, public-by-design) and the user's
 *   JWT; the provider API key lives exclusively in the Edge Function's
 *   environment. This mirrors `SupabaseRemoteSyncPort`'s credential
 *   posture and honours the documented rule in `src/config/env.ts`.
 *
 * Behaviour guarantees:
 *   - Per-attempt timeout via `AbortController` (default 30 s).
 *   - Cooperative cancellation: an abort on the caller's signal stops
 *     the in-flight attempt immediately (rejects with an abort error).
 *   - Bounded retry with exponential backoff + jitter for TRANSIENT
 *     failures only (network errors, HTTP 429, 5xx). 4xx (except 429)
 *     and validation failures fail fast — retrying those is waste.
 *   - Response is validated with zod BEFORE mapping — a malformed or
 *     drifting server contract surfaces as `INVALID_RESPONSE`, never as
 *     silently-wrong financial data.
 *   - Money arrives from the server in INTEGER MINOR UNITS (the server
 *     performs decimal parsing with currency-aware precision) — the
 *     client never multiplies floats by 100.
 *
 * The adapter is fully unit-testable: `fetchImpl`, `loadImageBase64`,
 * `now` and `sleep` are injectable.
 */

import { z } from 'zod';

import { asExtractionResultId, createExtractionResult } from '@domain/entities';
import type { ExtractionResult } from '@domain/entities/extraction-result';
import type {
  CaptureProcessor,
  CaptureProcessorInput,
  CaptureProcessOptions,
} from '@domain/ports/capture-processor.port';
import { createExtractedField, asExtractionConfidence } from '@domain/value-objects';
import { MAX_IMAGE_FILE_SIZE_BYTES } from '@domain/value-objects';

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export type OcrErrorCode =
  | 'NOT_CONFIGURED'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_READ_FAILED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'SERVER_ERROR'
  | 'INVALID_RESPONSE'
  | 'CANCELLED';

export class OcrCaptureError extends Error {
  readonly code: OcrErrorCode;
  readonly retriable: boolean;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;

  constructor(
    code: OcrErrorCode,
    message: string,
    options?: { retriable?: boolean; statusCode?: number; retryAfterMs?: number; cause?: unknown },
  ) {
    super(message, options);
    this.name = 'OcrCaptureError';
    this.code = code;
    this.retriable = options?.retriable ?? false;
    this.statusCode = options?.statusCode;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// Wire contract (Edge Function ↔ client) — validated with zod
// ---------------------------------------------------------------------------

const number01 = z.number().min(0).max(1);

const textFieldSchema = z.object({
  value: z.string().optional(),
  confidence: number01,
  sourceText: z.string().optional(),
});

const moneyFieldSchema = z.object({
  /** Integer minor units (server-side decimal parsing). */
  value: z.number().int().min(0).optional(),
  confidence: number01,
  sourceText: z.string().optional(),
});

const lineItemSchema = z.object({
  id: z.string().optional(),
  name: textFieldSchema,
  quantity: z.object({ value: z.number().min(0).optional(), confidence: number01 }),
  unitPriceMinor: moneyFieldSchema,
  discountMinor: moneyFieldSchema.optional(),
  taxMinor: moneyFieldSchema.optional(),
  totalAmountMinor: moneyFieldSchema,
});

export const ocrResponseSchema = z.object({
  merchant: textFieldSchema,
  date: z.object({
    value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
    confidence: number01,
    sourceText: z.string().optional(),
  }),
  currencyCode: z.object({
    value: z
      .string()
      .regex(/^[A-Z]{3}$/, 'currency must be ISO 4217')
      .optional(),
    confidence: number01,
    sourceText: z.string().optional(),
  }),
  subtotal: moneyFieldSchema,
  tax: moneyFieldSchema,
  tip: moneyFieldSchema.optional(),
  total: moneyFieldSchema,
  lineItems: z.array(lineItemSchema).max(100).default([]),
  overallConfidence: number01,
  totalMatches: z.boolean(),
  rawText: z.string().max(200_000).optional(),
  provider: z.string().optional(),
  warnings: z.array(z.string().max(200)).max(10).optional(),
});

export type OcrResponse = z.infer<typeof ocrResponseSchema>;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface RemoteOcrCaptureProcessorOptions {
  /** Full endpoint URL, e.g. https://<project>.supabase.co/functions/v1/ocr-receipt */
  readonly endpoint: string;
  /** Supabase anon key (public, RLS-scoped) — sent as `apikey`. */
  readonly anonKey: string;
  /**
   * Supplies the CURRENT user access token for the `Authorization`
   * header when the user is signed in (row-level attribution server-side).
   * Returns null for guests — the anon key JWT is used instead.
   */
  readonly getAccessToken?: () => Promise<string | null>;
  /** Reads the image at a local URI as base64 (no data: prefix). */
  readonly loadImageBase64: (uri: string) => Promise<string>;
  /** Injectable for tests. */
  readonly fetchImpl?: typeof fetch;
  readonly sleepImpl?: (ms: number) => Promise<void>;
  readonly nowMs?: () => number;
  /** Per-attempt timeout (default 30 s). */
  readonly timeoutMs?: number;
  /** Max attempts INCLUDING the first (default 3 → 1 try + 2 retries). */
  readonly maxAttempts?: number;
  /** Base backoff for retries (default 800 ms, doubled per attempt). */
  readonly baseRetryDelayMs?: number;
}

export class RemoteOcrCaptureProcessor implements CaptureProcessor {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly baseRetryDelayMs: number;

  constructor(private readonly options: RemoteOcrCaptureProcessorOptions) {
    if (!options.endpoint || !options.anonKey) {
      throw new OcrCaptureError(
        'NOT_CONFIGURED',
        'Remote OCR requires an endpoint URL and an anon key.',
      );
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleepImpl ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 800;
  }

  async process(
    input: CaptureProcessorInput,
    processOptions?: CaptureProcessOptions,
  ): Promise<ExtractionResult> {
    // --- Read + size-guard the image --------------------------------------
    let imageBase64: string;
    try {
      imageBase64 = await this.options.loadImageBase64(input.imageUri);
    } catch (error) {
      throw new OcrCaptureError('IMAGE_READ_FAILED', 'Could not read the captured image.', {
        cause: error,
      });
    }
    // base64 inflates bytes by ~4/3 — compare against the raw-byte budget.
    const approxBytes = Math.floor((imageBase64.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_FILE_SIZE_BYTES) {
      throw new OcrCaptureError(
        'IMAGE_TOO_LARGE',
        `The image is too large (${Math.round(approxBytes / 1024)} KB).`,
      );
    }

    const userToken =
      this.options.getAccessToken !== undefined ? await this.options.getAccessToken() : null;

    // --- Attempts loop -----------------------------------------------------
    let lastError: OcrCaptureError | null = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (processOptions?.signal?.aborted) {
        throw abortError();
      }
      try {
        const response = await this.fetchOnce(input, imageBase64, userToken, processOptions);
        return this.mapResponse(input.captureSourceId, response.body, response.provider);
      } catch (error) {
        if (isAbortFromCaller(processOptions?.signal) || (error instanceof Error && error.name === 'AbortError')) {
          throw processOptions?.signal?.aborted ? abortError() : timeoutError();
        }
        const ocrError = normalizeError(error);
        const canRetry = attempt < this.maxAttempts && ocrError.retriable;
        if (!canRetry) throw ocrError;
        lastError = ocrError;
        const delay = this.backoffDelayMs(attempt, ocrError.retryAfterMs);
        if (delay > 0) await this.sleep(delay);
      }
    }
    // Unreachable when maxAttempts >= 1 — kept for type completeness.
    throw (
      lastError ??
      new OcrCaptureError('SERVER_ERROR', 'OCR processing failed for an unknown reason.')
    );
  }

  // ------------------------------------------------------------------ parts

  private async fetchOnce(
    input: CaptureProcessorInput,
    imageBase64: string,
    userToken: string | null,
    processOptions?: CaptureProcessOptions,
  ): Promise<{ body: OcrResponse; provider?: string }> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(new TimeoutAbort()), this.timeoutMs);
    const callerSignal = processOptions?.signal;
    const onCallerAbort = () => controller.abort(new CancelledAbort());
    if (callerSignal !== undefined) {
      if (callerSignal.aborted) {
        clearTimeout(timeoutHandle);
        throw abortError();
      }
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.options.anonKey,
          Authorization: `Bearer ${userToken ?? this.options.anonKey}`,
        },
        body: JSON.stringify({
          imageBase64,
          sourceType: input.sourceType,
          captureSourceId: input.captureSourceId,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      // Abort reasons distinguish timeout vs caller cancellation.
      if (controller.signal.reason instanceof TimeoutAbort) throw timeoutError();
      if (controller.signal.reason instanceof CancelledAbort) throw abortError();
      if (error instanceof Error && error.name === 'AbortError') throw timeoutError();
      throw new OcrCaptureError('NETWORK', 'Network error while scanning the receipt.', {
        retriable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeoutHandle);
      if (callerSignal !== undefined) {
        callerSignal.removeEventListener('abort', onCallerAbort);
      }
    }

    if (!response.ok) {
      throw await this.errorFromStatus(response);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw new OcrCaptureError('INVALID_RESPONSE', 'The OCR service returned a non-JSON body.', {
        cause: error,
      });
    }

    const parsed = ocrResponseSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new OcrCaptureError(
        'INVALID_RESPONSE',
        `The OCR service response failed validation (${issues}).`,
      );
    }
    return { body: parsed.data, provider: parsed.data.provider };
  }

  private async errorFromStatus(response: Response): Promise<OcrCaptureError> {
    let serverMessage = '';
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      serverMessage = body.error ?? body.message ?? '';
    } catch {
      // Non-JSON error body — status text is enough.
    }
    const suffix = serverMessage.length > 0 ? `: ${serverMessage}` : '.';
    if (response.status === 401 || response.status === 403) {
      return new OcrCaptureError('AUTH', `The OCR service rejected the request${suffix}`, {
        statusCode: response.status,
      });
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const retryAfterMs = retryAfter !== null ? Number(retryAfter) * 1000 : undefined;
      return new OcrCaptureError('RATE_LIMIT', 'The OCR service is busy. Try again shortly.', {
        retriable: true,
        statusCode: 429,
        ...(Number.isFinite(retryAfterMs) ? { retryAfterMs } : {}),
      });
    }
    if (response.status >= 500) {
      return new OcrCaptureError('SERVER_ERROR', `The OCR service failed${suffix}`, {
        retriable: true,
        statusCode: response.status,
      });
    }
    return new OcrCaptureError('INVALID_RESPONSE', `The request was rejected${suffix}`, {
      statusCode: response.status,
    });
  }

  /** Exponential backoff with jitter; honours server Retry-After (capped). */
  private backoffDelayMs(attempt: number, retryAfterMs?: number): number {
    if (retryAfterMs !== undefined && retryAfterMs > 0) {
      return Math.min(retryAfterMs, 30_000);
    }
    const exponential = this.baseRetryDelayMs * 2 ** (attempt - 1);
    const jitter = Math.random() * 300;
    return Math.min(exponential + jitter, 30_000);
  }

  /** Validated wire payload → domain ExtractionResult. Pure (exported for tests). */
  private mapResponse(
    captureSourceId: CaptureProcessorInput['captureSourceId'],
    body: OcrResponse,
    _provider?: string,
  ): ExtractionResult {
    return createExtractionResult({
      id: asExtractionResultId(`ocr-${cryptoId()}`),
      captureSourceId,
      merchant: createExtractedField(body.merchant.value, asExtractionConfidence(body.merchant.confidence), {
        ...(body.merchant.sourceText !== undefined ? { sourceText: body.merchant.sourceText } : {}),
      }),
      date: createExtractedField(body.date.value, asExtractionConfidence(body.date.confidence), {
        ...(body.date.sourceText !== undefined ? { sourceText: body.date.sourceText } : {}),
      }),
      currencyCode: createExtractedField(
        body.currencyCode.value,
        asExtractionConfidence(body.currencyCode.confidence),
        {
          ...(body.currencyCode.sourceText !== undefined
            ? { sourceText: body.currencyCode.sourceText }
            : {}),
        },
      ),
      subtotal: createExtractedField(
        body.subtotal.value,
        asExtractionConfidence(body.subtotal.confidence),
      ),
      tax: createExtractedField(body.tax.value, asExtractionConfidence(body.tax.confidence)),
      ...(body.tip !== undefined
        ? {
            tip: createExtractedField(
              body.tip.value,
              asExtractionConfidence(body.tip.confidence),
            ),
          }
        : {}),
      total: createExtractedField(body.total.value, asExtractionConfidence(body.total.confidence)),
      lineItems: body.lineItems.map((item, index) => ({
        id: item.id ?? `line-${index}`,
        name: createExtractedField(item.name.value, asExtractionConfidence(item.name.confidence)),
        quantity: createExtractedField(
          item.quantity.value,
          asExtractionConfidence(item.quantity.confidence),
        ),
        unitPriceMinor: createExtractedField(
          item.unitPriceMinor.value,
          asExtractionConfidence(item.unitPriceMinor.confidence),
        ),
        ...(item.discountMinor !== undefined
          ? {
              discountMinor: createExtractedField(
                item.discountMinor.value,
                asExtractionConfidence(item.discountMinor.confidence),
              ),
            }
          : {}),
        ...(item.taxMinor !== undefined
          ? {
              taxMinor: createExtractedField(
                item.taxMinor.value,
                asExtractionConfidence(item.taxMinor.confidence),
              ),
            }
          : {}),
        totalAmountMinor: createExtractedField(
          item.totalAmountMinor.value,
          asExtractionConfidence(item.totalAmountMinor.confidence),
        ),
      })),
      overallConfidence: asExtractionConfidence(body.overallConfidence),
      totalMatches: body.totalMatches,
      ...(body.rawText !== undefined ? { rawText: body.rawText } : {}),
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Distinguishes timeout aborts from caller cancellation. */
class TimeoutAbort extends Error {
  constructor() {
    super('timeout');
    this.name = 'TimeoutAbort';
  }
}
class CancelledAbort extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledAbort';
  }
}

function abortError(): OcrCaptureError {
  return new OcrCaptureError('CANCELLED', 'Receipt scanning was cancelled.');
}
function timeoutError(): OcrCaptureError {
  return new OcrCaptureError('TIMEOUT', 'Receipt scanning timed out. Please retry.', {
    retriable: true,
  });
}

function isAbortFromCaller(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function normalizeError(error: unknown): OcrCaptureError {
  if (error instanceof OcrCaptureError) return error;
  if (error instanceof Error && /timeout/i.test(error.message)) {
    return new OcrCaptureError('TIMEOUT', 'Receipt scanning timed out. Please retry.', {
      retriable: true,
      cause: error,
    });
  }
  if (error instanceof Error && /network|fetch/i.test(error.message)) {
    return new OcrCaptureError('NETWORK', 'Network error while scanning the receipt.', {
      retriable: true,
      cause: error,
    });
  }
  return new OcrCaptureError('SERVER_ERROR', error instanceof Error ? error.message : String(error), {
    retriable: false,
    cause: error,
  });
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
