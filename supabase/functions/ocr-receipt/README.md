# ocr-receipt — Supabase Edge Function (server-side OCR proxy)

BillLens **never embeds OCR provider credentials in the mobile app**.
The app POSTs the captured image here (authenticated with the Supabase
anon-key JWT or the signed-in user's JWT); this function calls the
configured cloud OCR provider and returns a validated `ExtractionResult`
wire payload. The provider API key lives only in this function's
environment.

## Wire contract

`POST /functions/v1/ocr-receipt`

```json
{
  "imageBase64": "<base64 image bytes, no data: prefix>",
  "sourceType": "paper_receipt | gallery_image | upi_screenshot | card_screenshot | bank_screenshot | digital_invoice | shared_image",
  "captureSourceId": "<client capture id, for logging only>"
}
```

Response `200` (validated client-side with zod — see
`src/infrastructure/capture/remote-ocr-capture-processor.ts`):

```json
{
  "merchant":  { "value": "Paradise Biryani", "confidence": 0.95, "sourceText": "PARADISE BIRYANI" },
  "date":      { "value": "2026-07-29", "confidence": 0.9 },
  "currencyCode": { "value": "INR", "confidence": 0.98 },
  "subtotal":  { "value": 950,  "confidence": 0.85 },
  "tax":       { "value": 50,   "confidence": 0.8 },
  "tip":       { "value": 20,   "confidence": 0.7 },
  "total":     { "value": 1020, "confidence": 0.92 },
  "lineItems": [
    { "id": "item-1", "name": {"value": "Biryani", "confidence": 0.9},
      "quantity": {"value": 2, "confidence": 0.95},
      "unitPriceMinor": {"value": 350, "confidence": 0.85},
      "totalAmountMinor": {"value": 700, "confidence": 0.9} }
  ],
  "overallConfidence": 0.88,
  "totalMatches": true,
  "rawText": "…",
  "provider": "google_cloud_vision"
}
```

**All money values are INTEGER MINOR UNITS**, parsed server-side with
string arithmetic (never floats) using the detected currency's
minor-unit scale (JPY/KRW/VND = 0 decimals, KWD/BHD/IQD/JOD = 3).

Error taxonomy (status → client `OcrErrorCode`):

| Status | Client code     | Retried by client? |
|--------|-----------------|--------------------|
| 401/403| `AUTH`          | no |
| 413    | `IMAGE_TOO_LARGE` (client pre-checks too) | no |
| 429    | `RATE_LIMIT`    | yes (honours `Retry-After`) |
| 5xx    | `SERVER_ERROR`  | yes (exponential backoff + jitter) |
| malformed body | `INVALID_RESPONSE` | no |

## Configure + deploy

```bash
supabase login
supabase link --project-ref <your-project-ref>

# Choose the provider and set its credentials:
supabase secrets set OCR_PROVIDER=google_cloud_vision
supabase secrets set GOOGLE_CLOUD_VISION_API_KEY=<your-key>
# optional: supabase secrets set OCR_MAX_IMAGE_BYTES=10485760
# v2.5.0: the stub provider is REFUSED unless explicitly allowed
# (integration testing only):
# supabase secrets set OCR_ALLOW_STUB=true

supabase functions deploy ocr-receipt
```

Then set in the app's `.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
# optional, defaults to "remote when Supabase is configured":
EXPO_PUBLIC_OCR_MODE=remote
```

## Providers

- **`google_cloud_vision`** (default in v2.5.0): DOCUMENT_TEXT_DETECTION
  + the heuristic receipt parser in this function (merchant / date /
  currency / subtotal / tax / tip / total; line-item extraction is on
  the roadmap). Pricing at time of writing: ~$1.50 per 1,000 images
  after the free monthly 1,000 — costs are server-side and can be
  rate-limited per project.
- **`stub`** (OPT-IN since v2.5.0 via `OCR_ALLOW_STUB=true`):
  deterministic placeholder extraction, clearly labelled
  `provider: "stub"`. Exists so the full pipeline (app → function →
  zod validation → draft) can be integration-tested BEFORE a paid
  credential is provisioned. **Refused with `PROVIDER_NOT_CONFIGURED`
  unless explicitly allowed** — fabricated extraction data must never
  reach production users as if it were a real scan.

Providers were evaluated for: receipt accuracy (Cloud Vision's
DOCUMENT_TEXT_DETECTION is the accuracy leader for photographed
receipts), cost (pay-per-image, no per-seat), privacy (image bytes are
processed transiently; only the parsed fields are returned — raw text is
forwarded to the client, never stored server-side), and operational
requirements (one API key, no account linking, REST-only).

## Live OCR status (honest)

**BLOCKED — not yet live.** This function is deployed code, but the
maintainer has not provisioned a Supabase project + Cloud Vision
credential in this repository's environment. Until that happens the app
runs the on-device mock processor and the sync/OCR diagnostics surface
the reason (see `getOcrProviderReason()` in `services-registry.ts`).
After provisioning, verify live OCR with:

1. `supabase functions deploy ocr-receipt`
2. Set the two `EXPO_PUBLIC_SUPABASE_*` vars in `.env.local`.
3. Build the dev client, scan a real receipt, and confirm the draft
   review screen shows fields with confidence badges.
