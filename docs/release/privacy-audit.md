# Privacy Audit — BillLens v2.0.0 Release Candidate

> Evidence-based audit executed 2026-10-10 (Phase 8, Prompts 71 + 80).
> Companion to `store/privacy-disclosures.md` (the store-facing map).

## Final privacy checks (Prompt 80) — verdicts

| Check | Verdict | Evidence |
|---|---|---|
| Privacy policy matches behaviour | ✅ (draft matches; legal sign-off pending) | `docs/legal/privacy-policy.md` written from the data inventory in this audit |
| Store disclosures match behaviour | ✅ | `store/privacy-disclosures.md` maps every claim to a code path |
| Remote OCR consent works | ✅ | explicit per-use consent in capture pipeline; tests in capture/privacy suites |
| Local-only storage works | ✅ | `privacy-aware-sync-rules.ts` + e2e `local-only-attachment-never-uploads.yaml` + privacy suites |
| Delete-after-extraction works | ✅ | receipt privacy preference states + capture tests |
| Account deletion works | ✅ (new in remediation) | use cases + screen + route + 14 tests; guest = immediate local wipe; account = 14-day recovery + session revocation |
| Export works | ✅ | CSV + JSON export use cases + tests (`data-export.test.ts`, `export-group-csv` e2e) |
| Analytics opt-out works | ✅ | consent flag gates collection; redaction of amounts; analytics suites |
| Notification privacy works | ✅ | private-mode notification content + e2e `receive-private-notification.yaml` + tests |
| Removed members lose access | ✅ | RLS removal propagation + security tests (`removed-member-access-denied` e2e; `invitation-security.md`) |
| Data retention jobs work | ✅ | `src/domain/compliance/data-retention-jobs.ts` — 12 automated job types with legal-hold exemption |

## Data inventory (verified against code)

See the full table in `store/privacy-disclosures.md`. Summary of the
prohibited-collection verification:

- **No location permission** anywhere in `app.config.ts` (verified by
  reading the config; iOS infoPlist + Android permissions lists contain
  camera/photos/storage only).
- **No contacts, microphone, background location, ad IDs.**
- **Payment credentials never stored** — payment references are hashed
  (`paymentReferenceHash`), UPI VPAs optional + masked, evidence files
  user-controlled.

## Redaction verification (tests)

| Redactor | Sensitive key classes stripped | Amount handling | Test |
|---|---|---|---|
| Metrics | 14+ (emails, tokens, VPAs, receipt text, merchant, notes…) | bucketed | `metrics-redactor.test.ts` |
| Feedback | same family | bucketed | feedback suites |
| Analytics | same family + no event without consent flag | bucketed | `analytics-redactor.test.ts` |

## Backups & exports

- Backups are **user-created and local**; schema documented
  (`docs/backup-format.md`); backup payloads exclude session/refresh
  tokens, secrets, and provider credentials (tests:
  `data-export.test.ts`, backup suites).
- Malformed backup import is rejected safely (conflict/backup suites +
  `generate-redacted-diagnostics` e2e).

## Consent model

- Separate consents (analytics / crash reporting / remote OCR /
  notifications / receipt cloud sync) — never one bundled checkbox.
- Consent records capture policy version + timestamp + withdrawal
  timestamp (Prompt 78 requirement) — consent versioning fields exist in
  the privacy preference model.

## Known privacy gaps

1. **Legal review pending** — the Privacy Policy draft is behaviour-
   accurate but must be signed off before publication (P8 gate).
2. **Remote OCR provider** — no concrete provider is wired yet; when
   one is, the disclosure row must be updated in the same release.
3. **Crash-reporting retention periods** are placeholders pending legal
   confirmation (`docs/legal/data-retention-policy.md`).
