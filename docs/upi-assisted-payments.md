# BillLens — UPI-Assisted Settlement

> Status: **Phase 6 · Track 4 — UPI deep-link, QR, sharing, and return-to-app handler implemented.**
> Companion documents: [`settlement-domain.md`](./settlement-domain.md), [`settlement-lifecycle.md`](./settlement-lifecycle.md), [`balance-engine.md`](./balance-engine.md).

## 1. Overview

BillLens helps users open a compatible UPI application with pre-filled payment information and then return to BillLens to record the result. BillLens is **not** a bank or a payment processor — it does not move money, does not verify payments, and does not trust the UPI app's return signal as proof of payment.

The UPI flow is built on five pure domain modules and five application-layer use cases:

| Layer | Module | Purpose |
|---|---|---|
| Domain | `upi-vpa-validator` | Validate the VPA format (`name@bank`) and mask it for display |
| Domain | `upi-deep-link-builder` | Build a standards-compliant `upi://` URI; gate on INR-only |
| Domain | `upi-qr-generator` | Wrap the URI for encoding as a QR code (delegates to a `QrEncoderPort`) |
| Domain | `payment-request-sharing` | Build a shareable text message with masked VPA + UPI link |
| Domain | `upi-return-handler` | Process the platform "user returned" signal; **never** return "payment completed" |
| Application | `SaveUpiPaymentHandleUseCase` | Save a member's VPA (validate, mask, encrypt, persist) |
| Application | `GenerateUpiDeepLinkUseCase` | Decrypt the VPA, build the `upi://` URI |
| Application | `GenerateUpiQrUseCase` | Encode the URI as a QR code |
| Application | `SharePaymentRequestUseCase` | Build the shareable message |
| Application | `HandleUpiReturnUseCase` | Process the return; advance settlement to `pending_confirmation` (never `completed`) |

## 2. The safety contract

Phase 6 Prompt 56 is unambiguous:

> "BillLens must never claim 'Payment completed' only because a UPI deep link was opened, a QR code was displayed, a payment screenshot was attached, the user left BillLens and returned, or a payment reference was manually entered."

BillLens enforces this **by construction**, not by discipline:

1. **The return handler never returns `payment_completed`.** The two possible outcomes of `handleUpiReturn` are `returned_pending_confirmation` (advance to `pending_confirmation`) and `cancelled` (leave the settlement alone). There is no third variant. The TypeScript discriminated union makes this provable: there is no code path that produces a "completed" result from the return handler.

2. **The `pending_confirmation → completed` transition requires the receiver.** Only `ConfirmSettlementUseCase` (Track 1) can advance a settlement to `completed`, and it requires `confirmedByMemberId` — the receiver's member id. The payer cannot self-confirm.

3. **The currency gate refuses non-INR.** `assertUpiSupportedCurrency` throws `InvalidEntityError` for any currency other than INR. The deep-link builder re-checks this defensively. The use case checks it before calling the builder. Three layers of defence.

4. **Evidence does not prove completion.** The user can attach a payment reference hash or an evidence hash to the settlement (via `paymentReferenceHash` / `evidenceHash` on `RecordSettlementUseCase`). These are stored for the receiver's review and for duplicate detection, but they do NOT change the settlement's status. The receiver must still confirm explicitly.

## 3. What BillLens may and may not know

The spec is explicit about the asymmetry of evidence:

BillLens **may know**:
- The user returned to the app (platform signal).
- A callback was received (platform signal — varies by app).
- The external app failed to open (platform signal).
- The user cancelled inside BillLens (platform signal).
- The user's own statement of what happened (`paid` / `did_not_pay` / `unknown`).

BillLens **may not know with certainty**:
- Payment succeeded.
- The payee received the money.
- The amount was unchanged.
- The payment was not later reversed.

Unless a verified payment integration provides that evidence — and BillLens does not have such an integration in the MVP. The UPI callback payloads vary by app and are not trustworthy (they can be spoofed); BillLens does not consume them.

## 4. The VPA validator

A VPA (Virtual Payment Address) has the form `name@bank`. The validator enforces:

- `name`: 1-100 characters, alphanumeric + `.` + `_` + `-`, must start with alphanumeric. Case-insensitive (some users enter `John.Doe` rather than `john.doe`).
- `bank` (PSP identifier): 2-20 lowercase alphanumeric chars, must start with a letter. Always lowercase per NPCI convention — `OKSBI` is rejected.

The `maskUpiVpa` function produces a display-safe form:
- For name ≤ 3 chars: `ab@oksbi` → `a***@oksbi`
- For name 4+ chars: `john.doe@oksbi` → `jo***@oksbi`
- The PSP part is never masked (it's a public bank identifier).

The validator is deliberately conservative — it does not attempt to match the full NPCI character set (which is not documented in a public, stable spec). The conservative regex catches the overwhelming majority of real-world VPAs; edge cases can be added later without breaking existing handles.

## 5. The deep-link builder

The URI format per the NPCI UPI deep-linking spec:

```
upi://pay?pa={payeeVpa}&pn={payeeName}&am={amount}&cu={currency}&tn={note}&tr={reference}
```

Parameters:
- `pa` — payee VPA (mandatory). Validated by `validateUpiVpa`. URL-encoded (the `@` becomes `%40`).
- `pn` — payee name (mandatory). 1-100 chars. URL-encoded.
- `am` — amount in major units (e.g. `10.50`). BillLens always pre-fills the exact amount — never lets the user type it in the UPI app.
- `cu` — currency code. BillLens enforces INR only (see `assertUpiSupportedCurrency`).
- `tn` — transaction note (optional). Max 80 chars per NPCI. URL-encoded.
- `tr` — transaction reference (optional). BillLens generates a short unique id (`BL-{8 hex chars}`) if not provided, so the user can match the UPI transaction back to a BillLens settlement.

Parameters BillLens does NOT include:
- `mc` (merchant code) — BillLens is not a merchant.
- `tid` (transaction id from merchant) — same.
- `url` (merchant URL) — same.

The URI contains the full payee VPA in plaintext — this is required by the UPI spec; the user's UPI app needs the VPA to route the payment. The URI is NOT logged (the analytics redactor strips `upi://` URIs). The URI is NOT embedded in QR codes that contain any other BillLens data — the QR contains ONLY the URI.

## 6. The INR-only currency gate

The spec rule (Prompt 56):

> "UPI payment requests should use supported currency rules. Do not present UPI as a generic payment mechanism for unsupported currencies. If the balance is in pounds sterling, show another settlement method rather than attempting a UPI conversion."

`assertUpiSupportedCurrency(currencyCode)` throws `InvalidEntityError` for any currency other than INR. The list of supported currencies is `UPI_SUPPORTED_CURRENCIES = ['INR']` — extendable in future (e.g. NPR for Nepal UPI) by adding to the array.

The gate is enforced at three layers:
1. The use case (`GenerateUpiDeepLinkUseCase`) checks before calling the builder.
2. The deep-link builder (`buildUpiDeepLink`) re-checks defensively.
3. The UI (when wired up in a future track) should disable the UPI option for non-INR balances — but the gate does not depend on the UI.

The multi-currency balance engine (Track 3) returns per-currency balances, so the UI can check the settlement's currency and refuse to even show the UPI option for non-INR.

## 7. The QR-code generator

The QR generator wraps the deep-link URI for encoding. The actual QR encoding is delegated to a `QrEncoderPort`:

```ts
interface QrEncoderPort {
  encode(content: string): Promise<string>; // returns a data URL
}
```

Concrete implementations (plugged in at the application layer):
- `NodeQrEncoderPort` — uses the `qrcode` npm package (for CLI / server use).
- `ExpoQrEncoderPort` — uses `expo-barcode-scanner` (for the React Native app).

The QR generator enforces the spec rule by construction: the only input is the `upi://` URI. There is no API to add metadata, expense history, member balances, receipt data, private notes, or access tokens to the QR code. The `QrEncoderPort.encode` receives a single string and produces a single image — nothing else.

The generator refuses URIs longer than 500 chars (QR codes can technically handle up to ~2,953 bytes at low error correction, but very long URIs produce dense, hard-to-scan QR codes). It also refuses non-`upi://` URIs (defensive — the use case should have built the URI via the deep-link builder).

## 8. Payment-request sharing

`buildPaymentRequestMessage` produces a shareable text message:

```
Weekend Trip — Jane Doe → John Doe
₹42.50

Pay to: jo***@oksbi

Tap to pay via UPI:
upi://pay?pa=john.doe%40oksbi&pn=John+Doe&am=42.50&cu=INR&tn=Weekend+Trip

billlens://settlement/s/abc123
```

Privacy contract:
- The message body contains the **masked** VPA (`jo***@oksbi`), never the full VPA. The function refuses to embed an unmasked VPA — it requires the masked form to contain `***`.
- The UPI URI contains the full VPA in plaintext (required for the UPI spec). This is acceptable because the shareable message is meant for the payer to send to themselves (or to a trusted party) to launch the UPI app on their own device — not for public sharing.
- The optional `billlens://settlement/...` link is a deep link into the BillLens app (parallel to the existing `billlens://group/join/...` deep link). The function validates it starts with `billlens://` or `https://billlens.app`.

## 9. The return-to-app handler

The handler is the most safety-critical piece. It takes the platform's signal (what happened when the user tried to launch UPI) and the user's own statement (what they say happened in the UPI app), and produces one of two outcomes:

| `platformSignal` | `userStatement` | Result |
|---|---|---|
| `user_cancelled_in_billels` | (any) | `cancelled` — leave settlement alone |
| `app_failed_to_open` | (any) | `cancelled` — leave settlement alone |
| `returned_to_app` | `paid` | `returned_pending_confirmation` — advance to `pending_confirmation` |
| `returned_to_app` | `unknown` | `returned_pending_confirmation` — advance to `pending_confirmation` |
| `returned_to_app` | `did_not_pay` | `cancelled` — leave settlement alone |
| `returned_to_app` | (undefined) | `returned_pending_confirmation` — the safer default |

**There is no `payment_completed` variant.** The TypeScript discriminated union enforces this at compile time. The handler NEVER claims payment success — by construction.

The `HandleUpiReturnUseCase` (application layer) connects this to the settlement state machine:
- On `returned_pending_confirmation`, it calls `RecordSettlementUseCase` (Track 1) to advance the settlement from `draft` (or `requested`) to `pending_confirmation`. The receiver must then confirm explicitly via `ConfirmSettlementUseCase` (Track 1).
- On `cancelled`, it leaves the settlement in its current state (typically `draft`).

The use case also accepts an optional `paymentReferenceHash` (sha256 of the UPI UTR) and `evidenceHash` (sha256 of an attached screenshot), which it passes to `RecordSettlementUseCase` for storage and duplicate detection. These do NOT change the settlement's status — they are evidence for the receiver's review, not proof of completion.

## 10. The MemberPaymentHandle entity

The entity stores a member's UPI VPA in two forms:

- `maskedDisplayValue` — the user-facing form (e.g. `jo***@oksbi`). Always present. Safe to show in UI and to include in audit logs.
- `encryptedValue` — the ciphertext of the full VPA, plus `encryptionKeyId` identifying which key was used. Nullable for transient handles. The application layer never sees the plaintext key — envelope encryption with a per-tenant key.

The full VPA is NEVER stored in plaintext on the entity. The `GenerateUpiDeepLinkUseCase` decrypts it from the encrypted store at the moment the deep link is built, holds it in memory for the duration of the build, then discards it. The decrypted VPA is NOT logged, NOT included in audit entries, NOT stored anywhere.

The verification status has three states:
- `unverified` — the user entered the handle but it has not been verified. Default for new handles.
- `user_confirmed` — the user explicitly confirmed the handle is correct. NOT a third-party verification.
- `verified` — verified by a third-party mechanism (tiny test transaction, UPI mandate). Reserved for a future verification integration; BillLens does not perform this in the MVP.

The UPI deep-link builder accepts handles in any verification status — verification is a user trust signal, not a gate. The UI MAY show a "not verified" badge next to unverified handles, but it does not prevent launching UPI.

A member may have multiple handles of the same type (e.g. one personal VPA and one joint-account VPA). At most one may be marked `isDefault = true` per `(member, type)` — enforced by a partial unique index in the schema (Track 1 migration).

## 11. The repository contract

`MemberPaymentHandleRepository` (in `src/domain/repositories/payment-handle.repository.ts`) provides:

- `findById` — find a handle by id (returns null for soft-deleted).
- `listByMember` — list active handles for a member, optionally filtered by type.
- `findDefault` — find the default handle for a `(member, type)` pair.
- `save` — save a new or updated handle.
- `markDefault` — atomically clear other defaults of the same `(member, type)` and set this one. The repository handles the cross-handle update in a single transaction; the application layer does NOT need to do this manually.
- `softDelete` — soft-delete a handle (preserves audit trail).
- `updateVerificationStatus` — update the verification status (e.g. `unverified → user_confirmed`).

## 12. Privacy and audit

The audit entries for UPI operations contain ONLY:
- The handle id.
- The masked VPA.
- The settlement id.
- The transaction reference (the `BL-{8 hex chars}` id).
- Boolean flags (`upiDeepLinkGenerated`, `isDefault`, etc.).

They NEVER contain:
- The full VPA.
- The full `upi://` URI (which contains the full VPA in plaintext).
- Payment screenshots or references.
- Bank account details.

The existing `analytics-redactor.ts` and `feedback-redactor.ts` should be extended with VPA masking when the UI is wired up (Track 7).

## 13. Testing

- **`upi-vpa-validator.test.ts`** — 30 tests: valid VPAs (long names, short names, dots/dashes/underscores), invalid VPAs (empty, missing @, missing name, missing PSP, uppercase PSP, spaces, multiple @, leading punctuation, digit-start PSP), `isValidUpiVpa` predicate, `maskUpiVpa` masking rules.
- **`upi-deep-link-builder.test.ts`** — 20 tests: currency gate (INR accepted, others rejected), happy path (URI format, parameter encoding, reference generation), validation errors (zero/negative amount, empty name, oversized note/reference).
- **`upi-qr-generator.test.ts`** — 11 tests: happy path, custom size, validation errors (non-upi URI, empty URI, oversized URI, out-of-range size), safety (only the URI is encoded).
- **`payment-request-sharing.test.ts`** — 14 tests: happy path (with/without group context, with/without BillLens link), amount formatting (integer vs fractional, fallback to ISO code for unknown currencies), privacy (never embeds unmasked VPA in message body), validation errors.
- **`upi-return-handler.test.ts`** — 11 tests: **the safety invariant** (every input combination produces only `returned_pending_confirmation` or `cancelled` — never `payment_completed`), branch coverage for each `platformSignal`, input validation.
- **`member-payment-handle.test.ts`** — 20 tests: factory (defaults, label, verification status, validation errors), `markPaymentHandleDefault`, `verifyPaymentHandle`, `softDeletePaymentHandle`, `isPaymentHandleActive`.
- **`upi-usecases.test.ts`** — 18 tests: `SaveUpiPaymentHandleUseCase` (happy path, invalid VPA, audit entry without full VPA), `GenerateUpiDeepLinkUseCase` (happy path, non-INR rejection, deleted handle rejection, audit entry without full VPA), `GenerateUpiQrUseCase` (happy path, non-upi rejection), `SharePaymentRequestUseCase` (happy path, unmasked VPA refusal), `HandleUpiReturnUseCase` (**safety invariant** — every input combination never produces `completed`; happy path advances to `pending_confirmation`; cancelled cases leave settlement in draft; payment reference hash attached).

Total: **124 new tests across 7 new test suites**. Zero regressions on the existing 119 suites / 3,735 tests.

## 14. What is NOT in scope for Track 4

- The concrete `QrEncoderPort` implementations (`NodeQrEncoderPort`, `ExpoQrEncoderPort`). They live in the infrastructure layer and require wiring into the existing QR libraries.
- The concrete `PaymentHandleEncryptionPort` implementation. It requires a key management integration (envelope encryption with a per-tenant key) and is deferred to a security-hardening batch.
- The UPI deep-link launcher (the React Native `Linking.openURL` call). This is a UI concern and is wired up in the screen layer (Track 7).
- The "ask what happened" UI. The `HandleUpiReturnUseCase` accepts the user's statement as an input; the UI that prompts the user for it is part of the screen layer (Track 7).
- The analytics redactor extension for VPA masking. The existing redactor should be extended to strip `upi://` URIs and VPAs from analytics events; this is deferred to Track 7.
- UPI callback handling. BillLens does NOT consume UPI callback payloads (they vary by app and can be spoofed). The platform's "user returned" signal is the only input BillLens uses.

## 15. References

- `src/domain/services/upi/upi-vpa-validator.ts` — VPA format validation and masking.
- `src/domain/services/upi/upi-deep-link-builder.ts` — `upi://` URI builder and INR-only gate.
- `src/domain/services/upi/upi-qr-generator.ts` — QR-code generator (delegates to `QrEncoderPort`).
- `src/domain/services/upi/payment-request-sharing.ts` — shareable message builder.
- `src/domain/services/upi/upi-return-handler.ts` — return-to-app handler (the safety-critical piece).
- `src/domain/entities/member-payment-handle.ts` — the entity.
- `src/domain/repositories/payment-handle.repository.ts` — the repository contract.
- `src/application/upi/` — the five application-layer use cases.
- `src/domain/services/upi/__tests__/` — 86 domain tests.
- `src/application/upi/__tests__/` — 18 use case tests.
- `src/domain/entities/__tests__/member-payment-handle.test.ts` — 20 entity tests.
- [`settlement-domain.md`](./settlement-domain.md) — the Settlement entity (the UPI flow mutates settlements).
- [`settlement-lifecycle.md`](./settlement-lifecycle.md) — the state machine (the UPI flow advances settlements through the lifecycle).
- [`balance-engine.md`](./balance-engine.md) — the multi-currency balance engine (the INR-only gate depends on per-currency balances).
