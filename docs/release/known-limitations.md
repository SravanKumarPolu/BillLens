# Known Limitations — BillLens v2.0.0 Release Candidate

> Honest register (Phase 8, Prompt 71 rule 21 + Prompt 80). Each item
> names its risk id, impact class, and the gate that closes it.

## Engineering limitations (carried from v2.0.0, verified this audit)

1. **RISK-WIRE-01 — persistence core landed; remaining adapters and
   write-through remain.** *(Narrowed 2026-10-10 (v2.0.3): the four
   core entity repositories — groups, group members, expenses
   (atomic aggregate save), and expense drafts — now exist as
   production SQLite adapters, wired through the composition root's
   `repositories` bucket. Every mutation co-enqueues its offline-sync
   operation inside the same transaction. 21 new tests prove
   round-trips, rollback atomicity, pagination, and the write→read
   coherence with the Phase 6 balance engine.)* *(Narrowed further
   2026-10-11 (v2.1.0): the SETTLEMENT write-side adapter
   (`SqliteSettlementRepository` — full state machine, reversals,
   state history, idempotency contracts) and the AUDIT adapter
   (`SqliteAuditRepository` + migration v3's `audit_logs.group_id`)
   landed and are wired through a 13-use-case `settlements` bucket;
   the manual expense form (`CreateExpenseManuallyUseCase` + the real
   `/expenses/new` screen) writes through the expense adapter; the
   group home screen reads real members / expenses / suggested
   transfers; the Prompt 81 monitoring dashboard UI +
   `SqliteMetricRepository` landed. 86 new tests, including the
   write→settle→reverse→balance-restore coherence proof.)* What still
   remains: identity (guest/user) and account-deletion adapters (need
   the provisioned Supabase project), the create-group use case over
   the repositories, and the settlement screens' write-through.
   Gate: remaining adapter PRs + use-case wiring before closed beta.
1b. **RISK-BAL-01 (resolved 2026-10-11) — balance engine ignored
   settlement lifecycle status.** The engine counted every
   non-deleted settlement: pending-confirmation / disputed / draft
   settlements moved balances and reversals double-counted against
   their own reversal records. Fixed in v2.1.0 (completed-only filter
   + reversal-pair rule); 5 regression tests added. Recorded here
   because any data written while the bug was live must be re-derived
   from the raw records once a real deployment exists (dev databases
   only — no production data was ever written).
2. **RISK-E2E-01 — Maestro flows not executed on devices.** 65 flows
   defined (phase6/7/8); none executed on physical devices. Gate:
   device lab session pre-beta; results into `test-summary.md`.
3. **RISK-SEC-02 — RLS live execution pending.** Policies exist and
   are statically asserted; multi-user execution probes against a real
   Supabase project pending. Gate: `supabase db reset` + policy probes
   in staging.
4. **RISK-PBT-01 — Property-based tests use in-house generators.**
   Financial invariants verified over large deterministic + seeded
   matrices; `fast-check` not adopted. Gate: add `fast-check` suites or
   document generator equivalence for review.
5. **RISK-QUEUE-01 — dependency-based queue ordering is a stub**
   (`listBlocked`/`areDependenciesMet` MVP stubs; field defined).
   Gate: implement before multi-entity offline stress.
6. **RISK-OCR-01 — remote OCR provider not integrated.** Mock
   processor only; privacy pipeline (consent, delete-after-extraction)
   implemented and tested. Gate: provider integration + disclosure
   update in the same release.
7. **RISK-BACKUP-01 — backup encryption not implemented** (spec:
   "offer where feasible"). Backups are user-held, local, secret-free.
   Gate: optional encryption or explicit limitation note in help
   content.
8. **RISK-EXPORT-01 — PDF export not implemented** (CSV + JSON are).
   Spec marks PDF recommended, not required.

## This remediation's additions (Phase 8 packaging gaps closed)

- `assets/` regenerated (icon/adaptive-icon/splash/favicon) — builds
  were broken without them.
- `eas.json`, CI + release workflows, `npm run secret-scan` wiring,
  phase-8 Maestro flows, store metadata, legal drafts, docs/release
  reports, account-deletion flow (domain + app + UI + 14 tests).

## Security risk register

- **RISK-SEC-01 — Expo CLI toolchain advisories (74 audit findings, 0
  in shipped runtime deps).** Build-host isolation applies; no
  non-breaking fixes exist for 2 criticals (`shell-quote`, `tar` via
  `@expo/cli`/`xcode`). Gate: Expo SDK upgrade (tracked, planned —
  Prompt 71 forbids blind breaking upgrades).
- **RISK-SEC-03 — local at-rest encryption**: SQLite relies on the OS
  sandbox; no additional DB encryption layer. Stated honestly in
  `docs/legal/security-overview.md`.

## Legal / ops gates before launch

- Legal sign-off on all `docs/legal/` drafts (privacy, terms, AUP,
  retention, deletion, security overview).
- Privacy Policy + Terms published at the store-declared URLs.
- Physical-device matrix (iOS + Android) and accessibility
  screen-reader passes executed and recorded.
- Closed beta run with the Prompt 79 participant mix; findings
  addressed; crash/sync thresholds observed.
- Demo review account provisioned; screenshots captured from the
  pinned demo dataset.

## Explicitly not claimed

- No SOC 2 / ISO 27001 / PCI claims of any kind.
- No "guaranteed OCR accuracy", no automatic payment verification, no
  bank integrations — in product copy, store listings, and legal docs.
