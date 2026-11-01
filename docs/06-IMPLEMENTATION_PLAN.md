> **BillLens v2.25.0 | Repository-grounded documentation audit | 2026-10-23**  \n> Source snapshot: `BillLens(5).zip`. Statuses describe source inspection and previously documented tests; **no native device tests were executed during this audit**.  \n> These consolidated files supersede conflicting planning claims; historical files remain available.

# Implementation plan — evidence-based, not a restart

Previous Phase 1–10 prompts are planning history, **not proof of completion**. Retain existing tested code. Work on each item in dependency order, verify acceptance, then update traceability and feature matrix. P0 blocks usable MVP, P1 blocks quality, P2 requires external infrastructure/coordination.

| Priority | Task | Source | Acceptance criterion | Status |
|---|---|---|---|---|
| P0 | Android native module boot | `src/infrastructure/notifications/notification-runtime.ts` | Expo Go boot no red screen | PARTIAL |
| P0 | Manual expense create/edit | `app/expenses/new.tsx` | Saved expense exists once and balances match | PARTIAL |
| P0 | Camera/gallery/image persistence | `app/capture/` | Capture to draft or manual fallback on phone | PARTIAL |
| P1 | Real local OCR | `src/infrastructure/capture/` | ₹100 receipt fixture reviewed and saved | PARTIAL |
| P1 | Local reminder scheduling | `src/infrastructure/notifications/` | No boot crash; reminders scheduled on dev build | IMPLEMENTED_UNVERIFIED |
| P1 | Device and upgrade tests | `docs/release/` | Executed evidence matrix | PARTIAL |
| P2 | Encrypted sync app wiring | `src/application/sync/` | Two phones converge without duplicates | EXTERNAL_DEPENDENCY |
| P2 | Conflict review | `src/infrastructure/sqlite/sqlite-encrypted-sync-store.ts` | Conflicts visible and safely resolved | PARTIAL |
| P2 | Invite/key recovery UX | `src/application/invitations/` | Real join/revoke/recovery test | PARTIAL |
| P2 | Release gates | `docs/release/` | Release decision backed by evidence | PARTIAL |


## Work protocol
For each task: inspect current implementation → reproduce on target runtime → add regression test → smallest safe change → run unit/SQLite/TypeScript/lint → run native device test → record evidence and remaining limitations. Preserve SQLite and financial invariants; do not remove existing functionality. Maintain `docs/REQUIREMENTS_TRACEABILITY.md`, `docs/FEATURE_MATRIX.md` and `AGENTS.md`.

## Release dependency
Do not label release-ready until signed build, Android/iOS device matrix, schema upgrade test, accessibility, legal sign-off and staged beta are completed. See `docs/release/launch-decision.md`.
