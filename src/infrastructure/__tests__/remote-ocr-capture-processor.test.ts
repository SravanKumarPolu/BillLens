/**
 * RemoteOcrCaptureProcessor tests — the production OCR HTTP adapter,
 * exercised against an injected fetch double (no network).
 *
 * Covers: happy-path mapping, auth headers, response validation,
 * timeout aborts, retry policy (retriable vs permanent errors),
 * caller cancellation, size guard, and error taxonomy.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import { RemoteOcrCaptureProcessor } from '@infrastructure/capture/remote-ocr-capture-processor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENDPOINT = 'https://demo.supabase.co/functions/v1/ocr-receipt';
const ANON_KEY = 'anon-key';

/** Representative healthy receipt payload (the Edge Function contract). */
const HEALTHY_RESPONSE = {
  merchant: { value: 'Paradise Biryani', confidence: 0.95, sourceText: 'PARADISE BIRYANI' },
  date: { value: '2026-07-29', confidence: 0.9, sourceText: '29 Jul 2026' },
  currencyCode: { value: 'INR', confidence: 0.98, sourceText: 'Rs' },
  subtotal: { value: 950, confidence: 0.85, sourceText: '950.00' },
  tax: { value: 50, confidence: 0.8, sourceText: 'GST 50.00' },
  tip: { value: 20, confidence: 0.7, sourceText: 'Tip 0.20' },
  total: { value: 1020, confidence: 0.92, sourceText: '1020.00' },
  lineItems: [
    {
      id: 'item-1',
      name: { value: 'Chicken Biryani', confidence: 0.88 },
      quantity: { value: 2, confidence: 0.95 },
      unitPriceMinor: { value: 350, confidence: 0.85 },
      totalAmountMinor: { value: 700, confidence: 0.9 },
    },
  ],
  overallConfidence: 0.88,
  totalMatches: true,
  rawText: 'PARADISE BIRYANI\nTotal: 1020.00',
  provider: 'google_cloud_vision',
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

interface FetchCall {
  readonly url: string | URL | RequestInfo;
  readonly init?: RequestInit;
}

type FetchImpl = typeof fetch;

/** Captures calls; returns queued responses or throws. */
function makeFetchDouble(handler: (call: FetchCall, callIndex: number) => Promise<Response> | Response) {
  const calls: FetchCall[] = [];
  const impl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: FetchCall = { url: input, init };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as unknown as FetchImpl & { mock: { calls: unknown[][] } };
  return { impl, calls };
}

function makeProcessor(overrides?: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  baseRetryDelayMs?: number;
  getAccessToken?: () => Promise<string | null>;
}) {
  return new RemoteOcrCaptureProcessor({
    endpoint: ENDPOINT,
    anonKey: ANON_KEY,
    loadImageBase64: async () => 'aGVsbG8=',
    ...(overrides?.fetchImpl !== undefined ? { fetchImpl: overrides.fetchImpl } : {}),
    ...(overrides?.timeoutMs !== undefined ? { timeoutMs: overrides.timeoutMs } : {}),
    ...(overrides?.maxAttempts !== undefined ? { maxAttempts: overrides.maxAttempts } : {}),
    ...(overrides?.baseRetryDelayMs !== undefined
      ? { baseRetryDelayMs: overrides.baseRetryDelayMs }
      : {}),
    ...(overrides?.getAccessToken !== undefined
      ? { getAccessToken: overrides.getAccessToken }
      : {}),
    sleepImpl: async () => {}, // no real waiting in tests
  });
}

const INPUT = {
  captureSourceId: 'cap-1' as never,
  imageUri: 'file:///receipts/r.jpg',
  sourceType: 'paper_receipt' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('RemoteOcrCaptureProcessor — success', () => {
  it('maps a validated response into a domain ExtractionResult', async () => {
    const { impl } = makeFetchDouble(() => jsonResponse(HEALTHY_RESPONSE));
    const processor = makeProcessor({ fetchImpl: impl });

    const result = await processor.process(INPUT);

    expect(result.merchant.value).toBe('Paradise Biryani');
    expect(result.merchant.confidence).toBeCloseTo(0.95);
    expect(result.total.value).toBe(1020);
    expect(result.tip?.value).toBe(20);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0]?.name.value).toBe('Chicken Biryani');
    expect(result.totalMatches).toBe(true);
    expect(result.rawText).toContain('PARADISE');
    expect(result.captureSourceId).toBe(INPUT.captureSourceId);
  });

  it('sends the anon key header and bearer token when the user is signed in', async () => {
    const { impl, calls } = makeFetchDouble(() => jsonResponse(HEALTHY_RESPONSE));
    const processor = makeProcessor({
      fetchImpl: impl,
      getAccessToken: async () => 'user-jwt',
    });

    await processor.process(INPUT);

    expect(calls).toHaveLength(1);
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers['apikey']).toBe(ANON_KEY);
    expect(headers['Authorization']).toBe('Bearer user-jwt');
    const body = JSON.parse(String(calls[0]!.init?.body)) as { sourceType: string };
    expect(body.sourceType).toBe('paper_receipt');
  });

  it('falls back to the anon key as bearer for guests', async () => {
    const { impl, calls } = makeFetchDouble(() => jsonResponse(HEALTHY_RESPONSE));
    const processor = makeProcessor({ fetchImpl: impl });

    await processor.process(INPUT);

    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${ANON_KEY}`);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('RemoteOcrCaptureProcessor — response validation', () => {
  it('rejects a malformed body with INVALID_RESPONSE (no silent wrong data)', async () => {
    const { impl } = makeFetchDouble(() =>
      jsonResponse({ merchant: { value: 42, confidence: 0.9 } }),
    );
    const processor = makeProcessor({ fetchImpl: impl });

    await expect(processor.process(INPUT)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      retriable: false,
    });
  });

  it('rejects a non-JSON body', async () => {
    const { impl } = makeFetchDouble(
      () => new Response('<html>gateway error</html>', { status: 200 }),
    );
    const processor = makeProcessor({ fetchImpl: impl });

    await expect(processor.process(INPUT)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects a currency that is not ISO 4217', async () => {
    const bad = { ...HEALTHY_RESPONSE, currencyCode: { value: 'rupees', confidence: 0.9 } };
    const { impl } = makeFetchDouble(() => jsonResponse(bad));
    const processor = makeProcessor({ fetchImpl: impl });

    await expect(processor.process(INPUT)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

// ---------------------------------------------------------------------------
// Error taxonomy + retry
// ---------------------------------------------------------------------------

describe('RemoteOcrCaptureProcessor — errors and retries', () => {
  it('retries HTTP 500 and succeeds on the second attempt', async () => {
    const { impl, calls } = makeFetchDouble((_, i) =>
      i === 0 ? jsonResponse({ error: 'boom' }, { status: 500 }) : jsonResponse(HEALTHY_RESPONSE),
    );
    const processor = makeProcessor({ fetchImpl: impl });

    const result = await processor.process(INPUT);
    expect(result.total.value).toBe(1020);
    expect(calls).toHaveLength(2);
  });

  it('retries network failures', async () => {
    const { impl, calls } = makeFetchDouble((_, i) => {
      if (i === 0) throw new TypeError('Failed to fetch');
      return jsonResponse(HEALTHY_RESPONSE);
    });
    const processor = makeProcessor({ fetchImpl: impl });

    await expect(processor.process(INPUT)).resolves.toBeTruthy();
    expect(calls).toHaveLength(2);
  });

  it('gives up after maxAttempts and surfaces SERVER_ERROR', async () => {
    const { impl, calls } = makeFetchDouble(() => jsonResponse({ error: 'down' }, { status: 503 }));
    const processor = makeProcessor({ fetchImpl: impl, maxAttempts: 3 });

    await expect(processor.process(INPUT)).rejects.toMatchObject({
      code: 'SERVER_ERROR',
      retriable: true,
    });
    expect(calls).toHaveLength(3);
  });

  it('does NOT retry a 400 rejection (permanent)', async () => {
    const { impl, calls } = makeFetchDouble(() =>
      jsonResponse({ error: 'bad request' }, { status: 400 }),
    );
    const processor = makeProcessor({ fetchImpl: impl });

    await expect(processor.process(INPUT)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(calls).toHaveLength(1);
  });

  it('does NOT retry a 401 auth failure', async () => {
    const { impl, calls } = makeFetchDouble(() =>
      jsonResponse({ error: 'invalid jwt' }, { status: 401 }),
    );
    const processor = makeProcessor({ fetchImpl: impl });

    await expect(processor.process(INPUT)).rejects.toMatchObject({ code: 'AUTH' });
    expect(calls).toHaveLength(1);
  });

  it('maps 429 to RATE_LIMIT and retries', async () => {
    const { impl, calls } = makeFetchDouble((_, i) =>
      i === 0
        ? jsonResponse({ error: 'rate limited' }, { status: 429, headers: { 'retry-after': '1' } })
        : jsonResponse(HEALTHY_RESPONSE),
    );
    const processor = makeProcessor({ fetchImpl: impl });

    await expect(processor.process(INPUT)).resolves.toBeTruthy();
    expect(calls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Timeout + cancellation
// ---------------------------------------------------------------------------

describe('RemoteOcrCaptureProcessor — timeout and cancellation', () => {
  it('aborts an attempt after the timeout and maps to TIMEOUT (retriable)', async () => {
    // A fetch double that hangs forever BUT rejects when its abort signal
    // fires — exactly how real fetch behaves under AbortController.
    const impl = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal === null || signal === undefined) return;
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    ) as unknown as typeof fetch;
    const processor = makeProcessor({ fetchImpl: impl, timeoutMs: 20, maxAttempts: 1 });

    await expect(processor.process(INPUT)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('rejects promptly with CANCELLED when the caller aborts before the call', async () => {
    const { impl, calls } = makeFetchDouble(() => jsonResponse(HEALTHY_RESPONSE));
    const processor = makeProcessor({ fetchImpl: impl });
    const controller = new AbortController();
    controller.abort();

    await expect(processor.process(INPUT, { signal: controller.signal })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Size guard
// ---------------------------------------------------------------------------

describe('RemoteOcrCaptureProcessor — size guard', () => {
  it('rejects oversized images before any network call', async () => {
    const { impl, calls } = makeFetchDouble(() => jsonResponse(HEALTHY_RESPONSE));
    const processor = new RemoteOcrCaptureProcessor({
      endpoint: ENDPOINT,
      anonKey: ANON_KEY,
      loadImageBase64: async () => 'x'.repeat(Math.ceil((11 * 1024 * 1024 * 4) / 3)),
      fetchImpl: impl,
      sleepImpl: async () => {},
    });

    await expect(processor.process(INPUT)).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    expect(calls).toHaveLength(0);
  });

  it('requires endpoint + anon key (NOT_CONFIGURED)', () => {
    expect(
      () =>
        new RemoteOcrCaptureProcessor({
          endpoint: '',
          anonKey: '',
          loadImageBase64: async () => '',
        }),
    ).toThrow(/NOT_CONFIGURED|anon key|endpoint/i);
  });
});
