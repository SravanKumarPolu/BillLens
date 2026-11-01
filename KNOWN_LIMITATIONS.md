# Known limitations — BillLens v2.26.0 (2026-10-23)

Each item states: what it is, the current status, the evidence, why it
remains incomplete, the exact remaining action, and whether it blocks a
closed-testing release. "Blocks release" refers to the mandatory gates
in `FINAL_RELEASE_CHECKLIST.md`.

## Hardware-dependent verification (blocks release)

**KL-1 — On-device ML Kit OCR never executed.**
- Status: IMPLEMENTED_BUT_UNVERIFIED.
- Evidence: `mlkit-ocr-capture-processor.test.ts` (retry, cancellation,
  empty-output rejection) passes in Node; `docs/NATIVE_BUILD_VERIFICATION.md`
  records a debug APK/AAB build with ML Kit models bundled, but no
  runtime recognition has ever been captured.
- Why incomplete: no emulator/device/Android SDK in every environment
  since the feature landed.
- Remaining action: run the 14-point protocol in
  `docs/DEVICE_CAMERA_OCR_CHECKLIST.md` on a development build.
- **Blocks release: YES** (PRD P1 requires device-verified OCR).

**KL-2 — Camera, gallery, permissions and notifications unverified on hardware.**
- Status: IMPLEMENTED_BUT_UNVERIFIED (unit + screen tests pass).
- Evidence: `camera-screen.test.tsx`, `gallery-picker-screen.test.tsx`,
  reminder use-case tests; Expo Go guard verified in Node.
- Remaining action: device smoke matrix (camera capture, gallery import,
  permission denial → settings, reminder delivery on a dev build).
- **Blocks release: YES** for closed testing.

**KL-3 — No Maestro E2E execution.** 65 flows authored, none run.
- **Blocks release: YES** for release (not for internal testing).

## Sync and collaboration (PRD P2 — does not block offline release)

**KL-4 — Automatic encrypted multi-device sync is not shipped.**
- Status: BLOCKED (external), by design for this release.
- Evidence: the complete stack exists and is Node-tested — crypto
  (`src/domain/sync-crypto`), durable store (migration 0008),
  `EncryptedSyncEngine`, reference relay with signature verification and
  one-time joins, and `two-device-sync.test.ts` (two real SQLite files,
  now executing in this environment) — but **no screen starts or joins
  encrypted sync and no relay is deployed**.
- Why incomplete: relay hosting requires approval/credentials; the PRD
  scopes remote sharing as P2.
- Remaining action: (1) obtain a relay host — the reference server is a
  zero-dependency Node process deployable to any free-tier container
  service (see `docs/RELAY_DEPLOYMENT.md` for sizing and feasibility);
  (2) wire invitations + engine into the app lifecycle; (3) run the
  documented cross-device protocol on hardware.
- **Blocks release: NO** (offline-first is fully functional and honest —
  the sync screen reports "not configured" when cloud is absent).

**KL-5 — Group invitations/join UI is a placeholder.** Complete, tested
`JoinGroupUseCase` + invitations module exist unwired; the join screen
validates token shape only. Tied to KL-4 (P2 scope).
- **Blocks release: NO.**

**KL-6 — Live Supabase verification blocked on a provisioned project.**
Code + SQL + probes documented (`docs/deployment.md` §3). Free tier is
sufficient for verification. **Blocks release: NO** (cloud is optional).

## Functional gaps (do not block release)

**KL-7 — Settlement reversal has no UI.** Use case + tests + composition
wiring exist; no screen calls it. Exact action: route the existing
`SettlementConfirmationScreen` (currently unrouted) or add a reversal
action to a settlement-detail screen.

**KL-8 — No dedicated settlement list/detail screens.** Settlement
history is visible via the activity timeline and the balances screen's
pending cards; `ListSettlementsUseCase` has no UI caller.

**KL-9 — Per-settlement reminder scheduling has no UI** (use cases
exist, tested, unwired). The shipped opt-in daily reminder is wired.

**KL-10 — Manual expense form has no autosave** (the itemized form
does). Losing input on app kill is possible mid-form.

**KL-11 — Audit/state-history writes are not inside the entity-save
transaction** (they follow it). A crash in the window loses the audit
row, not the financial row. Compensating action: reconciliation job.

**KL-12 — `groupType`/`privacyDefault` from the create form are kept in
the UI store only** (the create use case has no such fields). Harmless
today; either persist via a future migration or remove the fields.

**KL-13 — Pre-identity actor assumptions.** Void passes `'local-user'`
(v2.26.0: honest but still an assumption); confirmation assumes the
receiver is the local user. Full identity linking needs the identity
adapters/cloud project.

**KL-14 — Unwired domain modules (10 modules, ~14.7k LOC)** (enterprise,
BI, i18n, roadmap, experiments, security runners, …) have zero
production consumers. Deliberate decision: keep (working, tested code)
per the "do not delete working features" constraint; wire or archive
later.

**KL-15 — FX conversion absent** (no rate source; inventing rates is
forbidden by the PRD). Multi-currency balances remain per-currency.

**KL-16 — English-only UI; long lists are capped rather than
virtualised; web bundle is a single 556 KB gzip chunk.** Performance and
localisation follow-ups, not financial-correctness issues.

**KL-17 — `settlements.method` accepts 4 values locally while the
domain defines 6** (`card`/`wallet` hidden from the picker since
v2.26.0). A coordinated local+cloud schema migration would close the
divergence permanently.

## Security and compliance (blocks store release, not internal testing)

**KL-18 — No independent security review/certification.** Internal
audits only (Noble primitives reviewed; secret scan clean; no PII in
logs by redaction contract). **Blocks store release: YES.**

**KL-19 — Legal drafts unsigned** (`docs/legal/*` marked DRAFT); privacy
policy URLs unpublished. **Blocks store release: YES.**

**KL-20 — SQLite is not encrypted at rest beyond the OS sandbox;
exports are unencrypted; deletion is not a forensic wipe.** Disclosed
honestly in-app (privacy copy). **Blocks release: NO** (disclosed), but
store review requires the Data Safety forms in `store/` to match.
