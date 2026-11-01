// Supabase Edge Function: ocr-receipt (v2.5.0)
//
// Server-side OCR proxy for the BillLens mobile app. The app sends a
// receipt/payment-screenshot image; this function calls the configured
// cloud OCR provider, maps the provider output to BillLens's
// ExtractionResult wire contract, and returns it.
//
// WHY THIS EXISTS (architecture):
//   OCR provider credentials must never ship inside the mobile bundle.
//   The app only holds the Supabase URL + anon key (RLS-scoped) and the
//   user's JWT. The provider API key lives ONLY in this function's
//   environment (Supabase secrets).
//
// CONFIGURATION (Supabase secrets — `supabase secrets set`):
//   OCR_PROVIDER                  one of: google_cloud_vision | stub
//                                 (default: google_cloud_vision — v2.5.0)
//   GOOGLE_CLOUD_VISION_API_KEY   required when OCR_PROVIDER=google_cloud_vision
//   OCR_MAX_IMAGE_BYTES           optional, default 10485760 (10 MB)
//   OCR_ALLOW_STUB                set to "true" to permit the stub provider
//                                 (integration testing ONLY — default refuse)
//
// v2.5.0 PRODUCTION GUARDS:
//   - The stub provider is REFUSED unless OCR_ALLOW_STUB=true. The old
//     default (stub) would serve fabricated "Stub Merchant" receipts
//     with HIGH confidence to real users when a deployer forgot to
//     configure the real provider.
//   - The Authorization JWT is verified IN-FUNCTION (createClient +
//     auth.getUser) — defense in depth in case platform-level
//     verify_jwt is ever disabled for this function.
//   - Early Content-Length rejection before buffering the body.
//
// DEPLOY:
//   supabase functions deploy ocr-receipt
//   (Keep JWT verification ON: the app calls with the anon-key JWT
//   (guest) or the user JWT (signed in).)

// @ts-nocheck — Deno runtime (deployed to Supabase, not bundled into the
// app; excluded from the app's tsc/eslint/jest runs via .eslintignore +
// jest testPathIgnorePatterns).

const MAX_IMAGE_BYTES = Number(Deno.env.get('OCR_MAX_IMAGE_BYTES') ?? 10_485_760);
// v2.5.0: default to the REAL provider. The stub is opt-in for tests.
const PROVIDER = Deno.env.get('OCR_PROVIDER') ?? 'google_cloud_vision';
const ALLOW_STUB = Deno.env.get('OCR_ALLOW_STUB') === 'true';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorJson(code: string, message: string, status: number): Response {
  return json({ error: message, code }, status);
}

/**
 * Verify the caller's JWT in-function (defense in depth — mirrors the
 * platform's verify_jwt guard). Two valid caller identities:
 *   1. GUEST — the project's anon key JWT (the client sends it as the
 *      bearer when nobody is signed in). Compared against SUPABASE_ANON_KEY.
 *   2. USER — a Supabase auth JWT, verified via auth.getUser().
 * Anything else is rejected BEFORE any provider cost is incurred.
 */
async function verifyCaller(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token.length === 0) {
    return {
      ok: false,
      response: errorJson('AUTH_REQUIRED', 'Missing Authorization bearer token.', 401),
    };
  }
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (anonKey.length > 0 && token === anonKey) {
    return { ok: true }; // guest caller
  }
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const client = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? anonKey,
    );
    const { error } = await client.auth.getUser(token);
    if (error !== null) {
      return {
        ok: false,
        response: errorJson('AUTH_INVALID', 'The supplied token is not valid.', 401),
      };
    }
    return { ok: true };
  } catch (_err) {
    return {
      ok: false,
      response: errorJson('AUTH_CHECK_FAILED', 'Could not verify the caller identity.', 500),
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return errorJson('METHOD_NOT_ALLOWED', 'Use POST with a JSON body.', 405);
  }

  // --- Reject oversized bodies BEFORE buffering them (v2.5.0) -----------
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  // base64 inflates by ~4/3 — the JSON body budget is derived from the
  // image budget, with headroom for the envelope.
  if (contentLength > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4096) {
    return errorJson('IMAGE_TOO_LARGE', `Image exceeds ${MAX_IMAGE_BYTES} bytes.`, 413);
  }

  // --- Verify the caller's JWT (v2.5.0, in-function) --------------------
  const caller = await verifyCaller(req);
  if (!caller.ok) return caller.response;

  // --- Parse + validate input -------------------------------------------
  let body: { imageBase64?: string; sourceType?: string };
  try {
    body = await req.json();
  } catch {
    return errorJson('INVALID_REQUEST', 'Body must be JSON.', 400);
  }

  const { imageBase64, sourceType } = body ?? {};
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return errorJson('INVALID_REQUEST', 'imageBase64 is required.', 400);
  }
  if (typeof sourceType !== 'string') {
    return errorJson('INVALID_REQUEST', 'sourceType is required.', 400);
  }

  // base64 inflates bytes by ~4/3.
  const approxBytes = Math.floor((imageBase64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return errorJson('IMAGE_TOO_LARGE', `Image exceeds ${MAX_IMAGE_BYTES} bytes.`, 413);
  }

  // --- v2.5.0: refuse the stub provider unless explicitly allowed -------
  // Fabricated extraction data must NEVER reach production users as if
  // it were a real scan — the guard lives here (server-side) as well as
  // in the app's provider selector.
  if (PROVIDER === 'stub' && !ALLOW_STUB) {
    return errorJson(
      'PROVIDER_NOT_CONFIGURED',
      'No OCR provider is configured on the server. Set OCR_PROVIDER (e.g. google_cloud_vision) ' +
        'and its credential secret — see supabase/functions/ocr-receipt/README.md.',
      503,
    );
  }

  // --- Dispatch to the configured provider -------------------------------
  try {
    switch (PROVIDER) {
      case 'google_cloud_vision':
        return await extractWithGoogleCloudVision(imageBase64, sourceType);
      case 'stub':
        return json(await extractWithStub(imageBase64, sourceType));
      default:
        return errorJson(
          'PROVIDER_NOT_CONFIGURED',
          `Unknown OCR_PROVIDER "${PROVIDER}".`,
          503,
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('ocr-receipt failed:', message);
    if (/not configured/i.test(message)) {
      return errorJson('PROVIDER_NOT_CONFIGURED', 'The OCR provider credential is not configured.', 503);
    }
    return errorJson('OCR_PROVIDER_FAILED', 'The OCR provider failed. Please retry.', 502);
  }
});

// ---------------------------------------------------------------------------
// Provider: Google Cloud Vision (DOCUMENT_TEXT_DETECTION + heuristic parser)
// ---------------------------------------------------------------------------

async function extractWithGoogleCloudVision(imageBase64: string, sourceType: string) {
  const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
  if (!apiKey) {
    throw new Error('GOOGLE_CLOUD_VISION_API_KEY is not configured.');
  }

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['en', 'hi'] },
          },
        ],
      }),
    },
  );

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    return new Response(
      JSON.stringify({ error: 'Rate limited by the OCR provider.', code: 'RATE_LIMIT' }),
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          ...(retryAfter !== null ? { 'Retry-After': retryAfter } : {}),
        },
      },
    );
  }
  if (!response.ok) {
    throw new Error(`Cloud Vision responded ${response.status}`);
  }

  const payload = await response.json();
  const annotation = payload?.responses?.[0]?.fullTextAnnotation;
  const text = typeof annotation?.text === 'string' ? annotation.text : '';

  // Heuristic receipt field extraction over the OCR text. Money values
  // are parsed into INTEGER MINOR UNITS server-side (string arithmetic —
  // never floats) using the detected currency's minor-unit scale.
  const parsed = parseReceiptText(text, sourceType);

  return {
    ...parsed,
    rawText: text.slice(0, 100_000),
    provider: 'google_cloud_vision',
  };
}

// ---------------------------------------------------------------------------
// Provider: stub (integration testing WITHOUT a paid credential)
// ---------------------------------------------------------------------------

async function extractWithStub(imageBase64: string, sourceType: string) {
  // Deterministic pseudo-extraction derived from the image length, so
  // the full pipeline (client → function → client mapping → draft) can
  // be exercised end-to-end. Clearly labelled as a stub.
  const seed = imageBase64.length;
  const isPayment = sourceType.endsWith('_screenshot');
  const total = 1000 + (seed % 900);
  return {
    merchant: {
      value: isPayment ? 'UPI Payment' : 'Stub Merchant',
      confidence: 0.9,
      sourceText: 'stub',
    },
    date: { value: new Date().toISOString().slice(0, 10), confidence: 0.9 },
    currencyCode: { value: 'INR', confidence: 0.95 },
    subtotal: { value: total, confidence: 0.85 },
    tax: { value: 0, confidence: 0.8 },
    total: { value: total, confidence: 0.85 },
    lineItems: [],
    overallConfidence: 0.85,
    totalMatches: true,
    provider: 'stub',
    warnings: ['Stub OCR provider — configure a real provider before production.'],
  };
}

// ---------------------------------------------------------------------------
// Heuristic receipt parser (server-side, string-arithmetic money)
// ---------------------------------------------------------------------------

const CURRENCY_MINOR_UNITS = {
  INR: 2, USD: 2, EUR: 2, GBP: 2, AUD: 2, CAD: 2, CHF: 2, CNY: 2, SGD: 2,
  AED: 2, ZAR: 2, JPY: 0, KRW: 0, VND: 0, KWD: 3, BHD: 3, IQD: 3, JOD: 3,
};

/** Parse a decimal money string into integer minor units (no floats). */
function toMinor(raw, currency) {
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  if (cleaned.length === 0) return undefined;
  const negative = cleaned.startsWith('-');
  const unsigned = cleaned.replace(/^-/, '');
  const [intPart, fracPart] = unsigned.split('.');
  if (intPart === undefined) return undefined;
  const decimals = CURRENCY_MINOR_UNITS[currency] ?? 2;
  let frac = (fracPart ?? '').slice(0, decimals).padEnd(decimals, '0');
  if (decimals === 0) frac = '';
  const minor = Number.parseInt(`${intPart}${frac}`, 10) * (negative ? -1 : 1);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

function detectCurrency(text) {
  if (/₹|\bRs\.?\b|\bINR\b/i.test(text)) return 'INR';
  if (/\$/.test(text)) return 'USD';
  if (/€/.test(text)) return 'EUR';
  if (/£/.test(text)) return 'GBP';
  return 'INR'; // default for the primary market
}

export function parseReceiptText(text, sourceType) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const currency = detectCurrency(text);

  // Merchant heuristic: the first non-numeric, non-total line.
  const merchantLine =
    lines.find(
      (l) => l.length >= 3 && !/^\d/.test(l) && !/total|amount|invoice|tax|gst|bill/i.test(l),
    ) ?? '';

  // Totals heuristic: the LAST line that mentions total/amount/sum.
  const totalLine = [...lines]
    .reverse()
    .find((l) => /total|amount (paid|transferred)|grand total|sum/i.test(l));
  const totalMatch = totalLine?.match(/([0-9]+(?:[.,][0-9]+)?)/g);
  let totalMinor;
  if (totalMatch !== undefined && totalMatch.length > 0) {
    // Prefer the LARGEST number on the line (totals dominate their line).
    const candidates = totalMatch
      .map((m) => toMinor(m.replace(/,/g, ''), currency))
      .filter((v) => v !== undefined);
    totalMinor = candidates.length > 0 ? Math.max(...candidates) : undefined;
  }

  // Date heuristics: ISO, d/m/y, d Mon y.
  const dateMatch =
    text.match(/(\d{4})-(\d{2})-(\d{2})/) ??
    text.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/) ??
    text.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
  const dateValue = dateMatch !== undefined ? normalizeDate(dateMatch[0]) : undefined;

  // Tax heuristic: a line mentioning tax/gst/vat with a number.
  const taxLine = lines.find((l) => /\b(tax|gst|vat)\b/i.test(l) && /[0-9]/.test(l));
  const taxNum = taxLine?.match(/([0-9]+(?:\.[0-9]+)?)/g);
  const taxMinor =
    taxNum !== undefined && taxNum.length > 0 ? toMinor(taxNum[taxNum.length - 1], currency) : 0;

  // Tip heuristic: a line mentioning tip/service charge.
  const tipLine = lines.find((l) => /\b(tip|service charge)\b/i.test(l) && /[0-9]/.test(l));
  const tipNum = tipLine?.match(/([0-9]+(?:\.[0-9]+)?)/g);
  const tipMinor =
    tipNum !== undefined && tipNum.length > 0 ? toMinor(tipNum[tipNum.length - 1], currency) : undefined;

  const overallConfidence = totalMinor !== undefined ? 0.8 : 0.35;
  const totalMatches = totalMinor !== undefined; // line-item cross-check lands with a smarter parser

  return {
    merchant: {
      value: merchantLine.length > 0 ? merchantLine.slice(0, 80) : undefined,
      confidence: merchantLine.length > 0 ? 0.7 : 0.2,
    },
    date: { value: dateValue, confidence: dateValue !== undefined ? 0.75 : 0.3 },
    currencyCode: { value: currency, confidence: 0.9 },
    subtotal: { value: totalMinor, confidence: totalMinor !== undefined ? 0.7 : 0.2 },
    tax: { value: taxMinor ?? 0, confidence: taxLine !== undefined ? 0.7 : 0.5 },
    ...(tipMinor !== undefined ? { tip: { value: tipMinor, confidence: 0.7 } } : {}),
    total: { value: totalMinor, confidence: totalMinor !== undefined ? 0.8 : 0.3 },
    lineItems: [], // item-level extraction: roadmap (see README)
    overallConfidence,
    totalMatches,
  };
}

function normalizeDate(raw) {
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso !== undefined) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (dmy !== undefined) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const dMonY = raw.match(
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i,
  );
  if (dMonY !== undefined) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = months.findIndex((m) => dMonY[2].toLowerCase().startsWith(m));
    if (monthIndex >= 0) {
      return `${dMonY[3]}-${String(monthIndex + 1).padStart(2, '0')}-${dMonY[1].padStart(2, '0')}`;
    }
  }
  return undefined;
}
