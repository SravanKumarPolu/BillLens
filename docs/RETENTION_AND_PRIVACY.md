# Retention, privacy and local erasure

## Retention modes

| Mode | Financial records | Temporary receipt files |
|---|---|---|
| Keep until manually deleted | Untouched | Untouched |
| Review after window (default 365 days) | Listed for human review; never auto-deleted | Untouched |
| Auto-clean temporary files | Untouched | Old unreferenced files queued for deletion |

`assessRetention` still protects groups with outstanding balances, pending
settlement confirmations or unsynced changes. Eligibility is reviewed by the
user; there is no automatic financial deletion.

## Cleanup mechanics

- Runs on app start when auto-clean mode is selected, at most once per 24h.
- Scans `cache/billlens-images` and `document/billlens-restored-receipts`.
- Skips any URI referenced by a receipt or capture source; skips files newer
  than the cutoff; max 50 candidates per run.
- Enqueues into the existing `file_cleanup_queue`; the existing retry worker
  deletes files. No second queue.
- Interrupted runs are safe: queue intent persists, UI work is bounded.

## Erase all local data

- Path: Settings → Data & storage → Erase all local data.
- Shows group/expense/settlement/receipt counts.
- Requires typing `DELETE`, then a native destructive confirmation.
- Deletes all user tables and local preferences; keeps `schema_version` and
  `file_cleanup_queue` so receipt-file cleanup survives.
- Receipt image URIs are queued before rows are deleted.

## Privacy facts

- SQLite is protected by the app sandbox, **not** encrypted at rest.
- Backups are encrypted; CSV/JSON/PDF/XLSX exports are not.
- No account or cloud is required; optional Supabase/relay are not configured by
  default.
- Uninstalling removes app data subject to Android behaviour.
- Deletion is logical, not a guarantee of forensic erasure from flash storage.
- OCR runs on-device; receipt text may remain in extraction/draft rows according
  to existing privacy preferences.

## Tests

- Retention boundary at exact UTC instant; time-zone independence.
- Leap-year 365-day boundary.
- Cleanup cutoff, 50-file cap, referenced-file exclusion.
- Full wipe: wrong confirmation rejected, counts, queue intent, schema retained,
  second run idempotent.
- Existing retention protections for balances/pending/unsynced changes.
