# Rollback Plan — BillLens

> Phase 8, Prompt 76/80. Time-boxed procedures; each lever has an owner
> (release manager) and a verification step.

## 1. OTA (JS) rollback — minutes

Applies to JS-only defects shipped via EAS Update.

```bash
# List recent updates for the production channel
eas update:list --channel production

# Repoint the channel branch to the last known-good update
eas update --branch production --message "Rollback to <good-update-id>" --republish "<good-update-group-id>"
```

Verify: launch the app offline → online, confirm the previous behaviour
returns; confirm the runtime version policy excluded the affected
binaries. **Constraint:** never use OTA to ship native-dependent JS to
incompatible binaries; OTA cannot change native code or DB schema.

## 2. Store release pause — minutes

- Play Console: halt staged rollout (Production → Releases → Halt).
  Existing users keep the release; new users get the prior version.
- App Store Connect: remove from sale is last resort; prefer pausing
  phased release (Automatic phased release → Pause up to 30 days) and
  pulling pending submissions.

## 3. Backend feature disablement — minutes

Each risky feature has a flag (Prompt 76): cloud OCR, debt
simplification, backup restore, experimental notifications, new
payment methods. Disable server-side via the flags service / Edge
Function config; the app degrades gracefully offline-first.

## 4. Database migration recovery

All migrations so far are **additive** (verified:
`docs/release/migration-report.md`). Recovery ladder:

1. App rollback to previous version (schema stays compatible).
2. If a migration must be reverted: restore from the pre-migration
   snapshot (taken before every migration per runbook), replaying no
   user writes beyond the snapshot window. This is a
   last-resort, downtime-notifying operation.
3. Verify post-restore: `validate-balance-invariants` over affected
   groups; audit-log spot checks.

## 5. Notification / OCR shutdown

- Notifications: disable the send path server-side; in-app banner
  informs users reminders are delayed.
- OCR: disable remote OCR flag; capture falls back to on-device/manual
  entry.

## 6. Incident communication

Follow `incident-response-plan.md` §Status communication; rollback
execution must always be paired with a banner/status note stating
what users may see (e.g. features temporarily disabled).

## 7. Verification after any rollback

1. `npm run secret-scan` + tests green on the restored release
   artefacts.
2. Financial invariants re-validated (unit fixtures + production-safe
   probes).
3. Crash rate and sync-failure rate observed below thresholds for
   [WINDOW — ops to confirm] before re-attempting rollout.

## Rehearsal

Rollback levers 1–3 are rehearsed in staging before the first
production release; rehearsal results recorded here.
