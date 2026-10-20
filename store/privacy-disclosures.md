# Privacy Disclosures ↔ Actual Behaviour Map

> Prompt 77: "Match disclosures to actual data practices. Do not
> under-declare data collection." This matrix maps every store
> disclosure to the code path that implements it. Review before every
> submission.

## Data inventory (what actually exists in code)

| Data | Where it lives | Collected when | Code reference |
|---|---|---|---|
| Email address | Supabase `auth.users` | Only for email-OTP / social sign-in | `request-email-otp.usecase.ts` |
| Cloud profile | Supabase `profiles` | On account creation/upgrade | Supabase migrations |
| Groups / expenses / splits / settlements | SQLite (always) + Supabase (only when sync/auth used) | On entity creation | `sqlite-sync-repository.ts`, `supabase-remote-sync-port.ts` |
| Receipt images | Local files (always). Cloud storage ONLY if cloud sync enabled | On capture/import | `privacy-aware-sync-rules.ts` |
| Receipt OCR text | Local SQLite. Remote OCR ONLY with per-use explicit consent | On extraction | `docs/privacy-and-trust.md` |
| Payment evidence | Local files; cloud only when synced | On attachment | `attachment-sync` rules |
| UPI VPA handles | Local SQLite, masked in UI; never in sync payloads by default | Optional, user-entered | `member-payment-handle.ts` |
| Device installation id | SecureStore + `device_installations` | On first launch | `device-installation-service.ts` |
| Analytics events | Local store; cloud only if analytics consented; amounts bucketed | On consent | `analytics-redactor`, `record-analytics-event.usecase.ts` |
| Crash reports | Redacted (no receipt text/tokens/amounts) | On consent / crash | `metrics-redactor.ts` |
| Push tokens | `device_installations` | On permission grant | notification architecture |

## Never-collected list (verified)

- Location (no permission requested in `app.config.ts`)
- Contacts
- Precise financial credentials (no card/bank details stored; UPI VPA is optional and masked)
- Ad identifiers; no third-party trackers; no ads SDKs (dependency tree reviewed)

## Disclosure mapping

| Store disclosure | Actual behaviour | Match |
|---|---|---|
| "Contact info — collected for accounts" | Email stored for auth only; used for OTP + account deletion notices | ✅ |
| "User content — receipts & expenses" | Synced only after auth/sync opt-in; local-only mode never uploads (`local-only-attachment-never-uploads` e2e) | ✅ |
| "Diagnostics — redacted" | `metrics-redactor` strips 14+ sensitive key classes; tested | ✅ |
| "Usage — opt-out" | Analytics disabled-by-default consent flag; withdrawal stops collection | ✅ |
| "Identifiers — pseudonymous" | Device installation id is random, not linked to email in analytics | ✅ |
| "No location" | No location permission in config; no location code | ✅ |
| "No payment data" | UPI handle optional + masked; payment references stored as hash only (`paymentReferenceHash`) | ✅ |

## Receipt privacy preferences (implemented states)

1. **Local-only** — never uploads (default for sensitive receipts).
2. **Delete after extraction** — OCR text kept, image destroyed.
3. **Cloud sync** — explicit per-user choice; group-shared.

## Removed-member access

When a member is removed: RLS denies future reads/writes; device keeps
local history until next sync reconciliation; attachments get new
signed-URL denials (covered by e2e `removed-member-access-denied` and
security tests `rls-verification`).

## Retention (summary — full policy in `docs/legal/data-retention-policy.md`)

- Guest data: device-only until upgrade; wiped on guest deletion.
- Deleted groups: 30-day soft-delete, then purge.
- Receipt images: until user deletes or account deletion.
- Audit events: retained for financial integrity; contain no content.
- Backups: user-created, local, exclude all tokens/secrets.

Any change to this table requires updating: Privacy Policy, both store
disclosure forms, and this file — in the same release.
