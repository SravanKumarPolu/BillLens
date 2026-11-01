> **BillLens v2.25.0 | Repository-grounded documentation audit | 2026-10-23**  \n> Source snapshot: `BillLens(5).zip`. Statuses describe source inspection and previously documented tests; **no native device tests were executed during this audit**.  \n> These consolidated files supersede conflicting planning claims; historical files remain available.

# Source audit and contradictions

## Scope and method
Inspected the uploaded archive `BillLens(5).zip`, `package.json`, actual Expo routes (43 `.tsx` route files), `src/` directories, SQLite migration registry (13 migrations) and the existing documentation set. Extracted 42 distinct CREATE TABLE definitions from `schema.ts`. No dependency installation, live backend, emulator, physical device, npm test or signed build was performed during this pass. No source code was changed.

## Reused and preserved
`AGENTS.md`; `docs/FEATURE_MATRIX.md`; `docs/IMPLEMENTATION_PROGRESS.md`; `docs/IMPLEMENTATION_BLOCKERS.md`; `docs/design-system.md`; `docs/navigation-map.md`; `docs/database-schema.md`; `docs/LOCAL_FIRST_ARCHITECTURE.md`; `docs/ENCRYPTED_SYNC_PROTOCOL.md`; `docs/KEY_MANAGEMENT.md`; `docs/DATA_RETENTION.md`; `docs/release/launch-decision.md` and related specialised documentation. Historical source documents were not removed.

## Important contradictions resolved in the new canonical documents
1. `docs/database-schema.md` labels Supabase PostgreSQL as the source of truth; for local MVP, the authoritative schema is **SQLite in `src/infrastructure/sqlite/schema.ts`**. Historical PostgreSQL docs retained.
2. Earlier roadmap describes automatic encrypted sync; current `IMPLEMENTATION_PROGRESS.md` and blockers say **not wired/deployed**.
3. Mock parser/ML Kit adapter presence does not establish **physical-device OCR success**.
4. Automated manual-expense tests coexist with reported **Android save failures**; mark device flow partial until retested.
5. Expo Go cannot provide remote push on Android; notification code must not eagerly load unavailable native modules.
6. **365-day cleanup is a suggestion with guards, not automatic deletion**; user-requested automatic deletion would be a new safety-reviewed requirement.
7. Lazy import patterns do not prove smaller native binary or performance gains; measure with real build and device.
8. Historical `NOT READY FOR RELEASE` is consistent with missing device, beta, signing, legal and security gates.
9. Existing notification runtime adapter guards Expo Go; confirm native behavior on a development build before closing incident.

## Feature and release gaps
P0: Android manual expense/camera/gallery and notification startup smoke tests. P1: on-device ML Kit OCR, reminders, upgrade/backup/restore, a11y and performance. P2: relay deployment, encrypted sync wiring, conflict resolution UI, invite/recovery UI, independent security review. Release: signed builds, store submissions, legal sign-off and beta.

## Validation performed
Static source extraction, migration/table inventory, route inventory, document cross-links, ZIP packaging verification. **Not performed:** Jest, ESLint, TypeScript, Expo Doctor, actual SQLite execution, Android/iOS device tests, network relay deployment. Do not treat these as passed.

## Next engineering task
Reproduce and fix remaining Android manual-expense and capture failures on a development build, while ensuring notification modules never crash Expo Go startup; then run real-device regression matrix and record build/version/evidence.
