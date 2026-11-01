# Incident Response Plan — BillLens

> Phase 8, Prompt 79/80. Ops-facing runbook. Owner: release manager on
> call; each incident type names the responsible function.

## Severity model

| Severity | Definition | Examples | Response |
|---|---|---|---|
| **Critical** | Financial or privacy integrity broken at scale | Cross-account exposure; incorrect widespread balances; credentials exposed; data-loss release; unauthorised receipt access; auth bypass | Immediate: halt rollout (pause stores + OTA kill), disable affected backend feature, incident channel, exec notification; public comms within 24h |
| **High** | Core function degraded for many users | Frequent sync failure; settlement-state confusion; auth outage; OCR provider outage; notification outage; crash rate above threshold | Same-day mitigation; feature flag off; comms in-app banner |
| **Medium** | Limited-scope defect | Non-critical UI defect; minor formatting; small animation issue | Next patch |
| **Low** | Cosmetic / doc gap | Typos, minor report formatting | Backlog |

## Playbook per incident type

| Incident | First actions | Rollback lever |
|---|---|---|
| Data exposure / unauthorised access | Revoke affected sessions; rotate keys (`secret-rotation` runbook); inspect audit logs; scope with access logs | Disable affected endpoint/feature flag; force sign-out |
| Incorrect balance bug | Freeze balance cache invalidations; verify with `validate-balance-invariants` on affected groups; publish correction plan | Disable debt-simplification flag; ship invariant-pinning patch |
| Duplicate settlement bug | Halt settlement confirmations (flag); mark duplicates via `mark-duplicate-settlement`; reconcile balances | Reverse duplicates (`reverse-settlement`) |
| Authentication outage | Check Supabase status; enable offline-authenticated mode messaging; extend OTP rate-limit windows | None needed — app is offline-first |
| Sync outage | Disable incremental sync flag (fallback full sync); queue grows safely offline | Sync coordinator cooldown self-heals |
| OCR provider outage | Route to on-device fallback / disable remote OCR flag | Feature flag |
| Notification outage | Set in-app incident banner; reminders degrade to in-app | Feature flag |
| Corrupt release | **Pause store rollout (staged %) + OTA rollback** (see `rollback-plan.md`) | OTA rollback + store halt |
| Backup restore defect | Disable restore flag; preserve user files; publish advisory | Feature flag |
| Backup/restore data-loss report | Collect redacted diagnostics; reproduce from user-provided backup copy (with consent) | Disable restore until fixed |

## Status communication

- In-app incident banner (copy template: what happened / what works /
  what to do / next update time)
- Support status message + store release notes
- Email template for authenticated users where warranted
- Public status page if/when operated

## Rollout pause criteria (Prompt 79)

Pause staged rollout when any of: crash rate exceeds threshold;
sync-failure rate rises; **financial invariant failures occur**;
authentication failures rise; data-loss reports appear; any privacy
incident occurs.

## Post-incident

Blameless review within 5 working days: timeline, root cause,
detection gap, tests to add (each financial incident must add an
invariant regression test), audit-log retention of the evidence.
