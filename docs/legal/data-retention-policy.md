# Data Retention Policy — BillLens

> **DRAFT — NOT LEGAL ADVICE.** For review by a qualified legal
> professional before publication (Phase 8, Prompt 78). The retention
> jobs implementing this policy live in
> `src/domain/compliance/data-retention-jobs.ts` (12 automated job
> types with legal-hold exemption).

**Last updated:** [TBD]

## Principles

1. **Local-first**: data the app does not need in the cloud stays on
   the device.
2. **Purpose limitation**: each data class is kept only as long as its
   purpose requires.
3. **Deletion is real**: purges remove the record and, where
   applicable, its storage objects.
4. **Legal hold overrides**: retention jobs skip entities under a
   documented legal or dispute hold.

## Retention table

| # | Data class | Retention | Trigger | Notes |
|---|---|-----------|---------|-------|
| 1 | Guest data | Device-only, indefinite until deletion | Guest wipe / app removal | Never leaves device unless upgraded |
| 2 | Account data | Life of account | Account deletion (14-day recovery, then purge) | Email retained until deletion completes |
| 3 | Deleted groups | 30 days soft-delete → purge | Group deletion | Members can restore within window |
| 4 | Deleted expenses | 30 days soft-delete → purge | Expense void/delete | Balance impact reverses immediately on delete |
| 5 | Audit history | [RETENTION PERIOD — legal to confirm] | — | Change summaries only; no content |
| 6 | Receipt images | Until user deletes; account deletion purges all | Per-receipt delete / account deletion | Local-only images never had a cloud copy |
| 7 | OCR text | Until receipt deleted, or "delete after extraction" removes image immediately | Receipt deletion | Extraction-only preference: image deleted post-extraction |
| 8 | Temporary files (capture cache, processed images) | Automatic cleanup ≤ 24h | Session cleanup job | Not synced, not backed up |
| 9 | Payment references | Hash form only; original strings never stored | — | `paymentReferenceHash` |
| 10 | Backups | User-held files; BillLens servers never receive them | User-managed | Exclude all tokens/secrets by design |
| 11 | Diagnostic reports | [RETENTION PERIOD — legal to confirm] | Redaction + purge job | Auto-redacted at creation |
| 12 | Analytics | [RETENTION PERIOD — legal to confirm] | Consent withdrawal stops collection; purge job removes old events | Amount-bucketed only |

## Deletion completion (account deletion)

1. In-app request → status `scheduled`, 14-day recovery window opens.
2. Cancellation during window restores normal service.
3. After the window, the server-side job completes: profile, auth
   linkage, synced content, storage objects, and notification tokens
   are purged; sessions were already revoked at request time.
4. Group history contributed to *other* groups is preserved for those
   members (see `account-deletion-policy.md`).

## Verification

Retention behaviour is covered by automated tests in
`src/domain/compliance/` and re-verified at each release candidate
(see `docs/release/production-readiness-report.md`).
